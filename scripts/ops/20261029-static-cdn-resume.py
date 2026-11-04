"""Scoped CDN resumption, run on management host with an explicit phase.

Changes only the existing default-static map. Provider status is verified in UI.
No application, database, provider, DNS, package or protection mutations.
"""
import base64
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

os.umask(0o077)
ROOT = Path('/opt/mengceng')
OUT = Path('/root/mengceng-static-cdn-resume-20261029')
TARGET = ROOT / 'ops/static-cdn-20261027/static-cdn-maps.conf'
RELEASE = ROOT / 'releases/20261028Tdirect-7e162e51'
NGINX = '/www/server/nginx/sbin/nginx'
CDN = 'static-test.mengceng.com'
PREFIX = '/assets/cdn-20261028/'


def sha(b):
    return hashlib.sha256(b).hexdigest()


def save(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2))


def load(name):
    return json.loads((OUT / name).read_text())


def runtime():
    return subprocess.check_output(['docker', 'ps', '--no-trunc', '--format', '{{.ID}} {{.Names}} {{.Image}}']).decode().splitlines()


def current():
    assert (ROOT / 'current').resolve() == RELEASE, 'Release changed: inspect newer deployment'


def fetch(host, path, origin=False, cookie=False):
    args = ['curl', '--noproxy', '*', '-sS', '--connect-timeout', '10', '--max-time', '60', '-D', '-', '-w', '\nMETA%{json}', '-H', 'Origin: https://mengceng.com']
    if origin:
        args += ['--resolve', host + ':443:127.0.0.1']
    if cookie:
        args += ['-H', 'Cookie: mc_static_origin=1']
    p = subprocess.run(args + ['https://' + host + path], capture_output=True)
    raw, meta = p.stdout.rsplit(b'\nMETA', 1)
    head, _, body = raw.partition(b'\r\n\r\n')
    headers = {}
    for line in head.decode().splitlines()[1:]:
        if ':' in line:
            k, v = line.split(':', 1)
            headers[k.lower()] = v.strip()
    m = json.loads(meta)
    row = {'host': host, 'path': path, 'status': m['http_code'], 'tls': m['ssl_verify_result'], 'returncode': p.returncode, 'bytes': len(body), 'sha256': sha(body), 'headers': {k: v for k, v in headers.items() if k in ['content-type', 'cache-control', 'access-control-allow-origin', 'access-control-allow-credentials', 'age', 'x-cache', 'via']}}
    assert p.returncode == 0 and row['tls'] == 0, row
    return row, body


def prepare():
    current()
    OUT.mkdir(mode=0o700)
    original = TARGET.read_bytes()
    assert sha(original) == '2ed56de06b9c291dae296a3dd97f1ccc6c05919e11dd8f3c36f5623c2fea51a4'
    assert original.count(b'default 0;') == 1
    artifact = RELEASE / 'web-artifact'
    rows = json.loads((RELEASE / 'web-artifact-manifest.json').read_text())
    live = Path('/var/lib/docker/volumes/mengceng_web-data/_data')
    for r in rows:
        assert sha((artifact / r['path']).read_bytes()) == r['sha256']
        assert sha((live / r['path']).read_bytes()) == r['sha256']
    prior = json.loads(Path('/root/mengceng-static-recovery-20261029/before-private.json').read_text())
    protected = {p: sha(Path(p).read_bytes()) for p in prior['protected']}
    state = {'release': str(RELEASE), 'target': str(TARGET), 'original': base64.b64encode(original).decode(), 'original_sha256': sha(original), 'candidate_sha256': sha(original.replace(b'default 0;', b'default 1;', 1)), 'protected': protected, 'containers': runtime()}
    raw = json.dumps(state, sort_keys=True).encode()
    backup = OUT / 'before.json.age'
    subprocess.run(['age', '-R', '/www/wwwroot/sign.1kb.day/shared/backup-keys/recipient.txt', '-o', str(backup)], input=raw, check=True, capture_output=True)
    restored = subprocess.check_output(['age', '-d', '-i', '/www/wwwroot/sign.1kb.day/shared/backup-keys/identity.agekey', str(backup)])
    assert restored == raw and base64.b64decode(json.loads(restored)['original']) == original
    save('before-private.json', state)
    save('backup-proof.json', {'backup': str(backup), 'sha256': sha(backup.read_bytes()), 'bytes': backup.stat().st_size, 'actual_decryption_and_config_restore_verified': True, 'release': str(RELEASE), 'artifact_and_live_files_verified': len(rows), 'protected_files': len(protected), 'original_sha256': sha(original), 'candidate_sha256': state['candidate_sha256']})
    print('NEW_ENCRYPTED_BACKUP_RESTORE_VERIFIED')


def baseline():
    current()
    s = load('before-private.json')
    assert runtime() == s['containers']
    assert all(sha(Path(p).read_bytes()) == h for p, h in s['protected'].items())
    return s


def expected_bridge(p):
    b = p.read_bytes()
    if p.suffix in ['.js', '.css']:
        for old, new in [(b'"/brand/', b'"https://static-test.mengceng.com/brand/'), (b"'/brand/", b"'https://static-test.mengceng.com/brand/"), (b'`/brand/', b'`https://static-test.mengceng.com/brand/'), (b'url(/brand/', b'url(https://static-test.mengceng.com/brand/'), (b'return`/`+e', b'return`https://static-test.mengceng.com/assets/cdn-20261028/`+(e.startsWith("assets/")?e.slice(7):e)')]:
            b = b.replace(old, new)
    return b


def cdn():
    s = baseline()
    assert sha(TARGET.read_bytes()) == s['original_sha256'], 'Keep same-origin mode until preflight passes'
    dns = {}
    for n in [CDN, CDN + '.queniuaa.com']:
        text = subprocess.check_output(['dig', '+short', n, 'A']).decode()
        assert text.strip() and 'offline.specialcdnstatus.com' not in text and '169.254.' not in text, text
        dns[n] = text.strip().splitlines()
    artifact = RELEASE / 'web-artifact'
    selected = set()
    for conf in ['home.conf', 'html.conf']:
        text = (ROOT / 'ops/static-cdn-20261027' / conf).read_text()
        selected.update(re.findall(r'\$\{mc_static_assets\}([^"\'<>]+\.(?:js|css))', text))
    for p in (artifact / 'assets').iterdir():
        if p.suffix in ['.css', '.woff2', '.wasm'] or re.match(r'(?:login|auth|register|forgot-password|brand-auth-entry)[-.]', p.name):
            selected.add(p.name)
    def check(name):
        p = artifact / 'assets' / name
        assert p.is_file(), name
        row, body = fetch(CDN, PREFIX + name)
        h = row['headers']
        mime = {'.js': 'javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.wasm': 'application/wasm'}[p.suffix]
        assert row['status'] == 200 and mime in h.get('content-type', '').lower(), row
        assert 'immutable' in h.get('cache-control', '') and h.get('access-control-allow-origin') in ['*', 'https://mengceng.com'], row
        assert sha(body) == sha(expected_bridge(p)), {'mismatch': name, 'row': row}
        row['matches_current_release_with_existing_bridge_transform'] = True
        return row
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        assets = list(pool.map(check, sorted(selected)))
    brands = []
    for path in ['/brand/fonts/glow-sc-medium-core.woff2', '/brand/fonts/glow-sc-regular-core.woff2']:
        origin, ob = fetch('mengceng.com', path, True)
        if origin['status'] == 404:
            continue
        row, b = fetch(CDN, path)
        assert row['status'] == origin['status'] == 200 and b == ob, row
        assert row['headers'].get('access-control-allow-origin') in ['*', 'https://mengceng.com'], row
        brands.append(row)
    save('cdn-preflight-proof.json', {'passed': True, 'dns': dns, 'release': str(RELEASE), 'assets': assets, 'brand_assets': brands, 'asset_count': len(assets), 'bytes': sum(r['bytes'] for r in assets), 'default_still_same_origin': True})
    print(json.dumps({'passed': True, 'cdn_assets': len(assets), 'brand_assets': len(brands), 'bytes': sum(r['bytes'] for r in assets)}))


def install(data):
    tmp = TARGET.with_name(TARGET.name + '.resume-next')
    tmp.write_bytes(data)
    tmp.chmod(0o644)
    os.replace(tmp, TARGET)
    subprocess.run([NGINX, '-t'], check=True, capture_output=True)
    subprocess.run([NGINX, '-s', 'reload'], check=True, capture_output=True)


def pages(expect_cdn):
    rows = []
    for path in ['/', '/login', '/register']:
        row, body = fetch('mengceng.com', path)
        assert row['status'] == 200
        assert (b'src="https://static-test.mengceng.com/assets/cdn-20261028/index-USgpMd-T.js"' in body) == expect_cdn
        rows.append(row)
    row, body = fetch('mengceng.com', '/', True, True)
    assert row['status'] == 200 and b'src="/assets/index-USgpMd-T.js"' in body
    rows.append(row)
    for path, code in [('/api/public/brand-site', 200), ('/api/health/ready', 200), ('/api/resources', 401), ('/api/canvas-projects', 401)]:
        row, b = fetch('mengceng.com', path)
        assert row['status'] == code
        if path == '/api/health/ready':
            d = json.loads(b)['data']
            assert d['ready'] and d['schema']['current'] == 61 and d['build']['commit'].startswith('7e162e51')
        rows.append(row)
    return rows


def apply():
    s = baseline()
    assert load('cdn-preflight-proof.json')['passed']
    assert sha(TARGET.read_bytes()) == s['original_sha256']
    original = base64.b64decode(s['original'])
    try:
        install(original.replace(b'default 0;', b'default 1;', 1))
        time.sleep(1)
        checks = pages(True)
    except BaseException:
        install(original)
        save('guarded-rollback-proof.json', {'same_origin_restored': True, 'checks': pages(False)})
        raise
    save('switch-proof.json', {'passed': True, 'time': time.strftime('%Y-%m-%dT%H:%M:%S%z'), 'mode': 'default_existing_cdn', 'changed_files': [str(TARGET)], 'checks': checks, 'containers_and_protected_files_unchanged': True, 'quick_same_origin_cookie_retained': True})
    print('DEFAULT_CDN_ENABLED_PAGES_AND_AUTH_VERIFIED')


def verify():
    s = baseline()
    assert sha(TARGET.read_bytes()) == s['candidate_sha256']
    checks = pages(True)
    save('final-proof.json', {'passed': True, 'checks': checks, 'release': str(RELEASE), 'containers_unchanged': True, 'protected_files_unchanged': len(s['protected']), 'current_map_sha256': sha(TARGET.read_bytes())})
    print(json.dumps({'passed': True, 'checks': len(checks), 'protected': len(s['protected']), 'containers_unchanged': True}))


def rollback():
    s = baseline()
    assert sha(TARGET.read_bytes()) == s['candidate_sha256']
    install(base64.b64decode(s['original']))
    save('rollback-proof.json', {'same_origin_restored': True, 'checks': pages(False)})
    print('SAME_ORIGIN_RESTORED_NO_APP_OR_DB_ROLLBACK')


if __name__ == '__main__':
    assert len(sys.argv) == 2 and sys.argv[1] in ['prepare', 'cdn', 'apply', 'verify', 'rollback']
    globals()[sys.argv[1]]()
