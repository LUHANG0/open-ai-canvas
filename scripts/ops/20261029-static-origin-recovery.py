"""Scoped MengCeng incident recovery; run on its management host with explicit phase.

Retains current application and private OSS storage. No DNS/provider/database writes.
Private snapshot stays encrypted on the host; only *-proof.json is exportable.
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
OUT = Path('/root/mengceng-static-recovery-20261029')
TARGET = ROOT / 'ops/static-cdn-20261027/static-cdn-maps.conf'
NGINX = '/www/server/nginx/sbin/nginx'
EXPECTED_RELEASE = ROOT / 'releases/20261028Tdirect-7e162e51'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def save(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2, ensure_ascii=False))


def load(name):
    return json.loads((OUT / name).read_text())


def command(args):
    return subprocess.check_output(args)


def runtime():
    return command(['docker', 'ps', '--no-trunc', '--format', '{{.ID}} {{.Names}} {{.Image}}']).decode().splitlines()


def request(path, source='127.0.0.1', cookie=False):
    args = ['curl', '--noproxy', '*', '-sS', '--connect-timeout', '8', '--max-time', '25', '-D', '-', '-w', '\nMETA%{json}']
    if source:
        args += ['--resolve', 'mengceng.com:443:' + source]
    if cookie:
        args += ['-H', 'Cookie: mc_static_origin=1']
    p = subprocess.run(args + ['https://mengceng.com' + path], capture_output=True)
    raw, meta = p.stdout.rsplit(b'\nMETA', 1)
    headers, _, body = raw.partition(b'\r\n\r\n')
    m = json.loads(meta)
    row = {'path': path, 'target': source or 'public', 'status': m['http_code'], 'tls': m['ssl_verify_result'], 'returncode': p.returncode, 'bytes': len(body), 'sha256': sha(body), 'headers': [s for s in headers.decode().splitlines() if re.match(r'(?i)^(content-type|cache-control|access-control-allow-origin|cf-cache-status):', s)]}
    return row, body


def assert_current():
    assert (ROOT / 'current').resolve() == EXPECTED_RELEASE, 'Release changed; inspect newer work'


def prepare():
    assert_current()
    OUT.mkdir(mode=0o700)
    artifact = EXPECTED_RELEASE / 'web-artifact'
    rows = json.loads((EXPECTED_RELEASE / 'web-artifact-manifest.json').read_text())
    live = Path('/var/lib/docker/volumes/mengceng_web-data/_data')
    for r in rows:
        assert sha((artifact / r['path']).read_bytes()) == r['sha256'], 'Artifact mismatch'
        assert sha((live / r['path']).read_bytes()) == r['sha256'], 'Served volume mismatch'
    old = TARGET.read_bytes()
    assert old.count(b'default 1;') == 1 and b'~^1: 1;' in old
    new = old.replace(b'default 1;', b'default 0;', 1)
    # Prove the existing origin mode reproduces correct entry content before mutation.
    root, body = request('/', cookie=True)
    assert root['status'] == 200 and b'https://static-test.mengceng.com/assets/' not in body
    entry = re.search(rb'<script type="module" crossorigin src="([^"]+)"', body)[1].decode()
    entry_row, entry_body = request(entry)
    assert entry_row['status'] == 200 and sha(entry_body) == sha((artifact / entry.lstrip('/')).read_bytes())
    previous = json.loads(Path('/root/web-optimize-disable-20261029/before.json').read_text())
    protected = {p: sha(Path(p).read_bytes()) for p in previous['filehash'] if p != str(TARGET)}
    for p in [ROOT / 'shared/.env', ROOT / 'ops/compose.sh', ROOT / 'ops/homepage-preload.conf']:
        protected[str(p)] = sha(p.read_bytes())
    state = {'release': str(EXPECTED_RELEASE), 'target': str(TARGET), 'old': base64.b64encode(old).decode(), 'old_sha256': sha(old), 'new_sha256': sha(new), 'containers': runtime(), 'protected': protected}
    raw = json.dumps(state, sort_keys=True).encode()
    backup = OUT / 'before.json.age'
    subprocess.run(['age', '-R', '/www/wwwroot/sign.1kb.day/shared/backup-keys/recipient.txt', '-o', str(backup)], input=raw, check=True, capture_output=True)
    restored = command(['age', '-d', '-i', '/www/wwwroot/sign.1kb.day/shared/backup-keys/identity.agekey', str(backup)])
    assert restored == raw
    decoded = base64.b64decode(json.loads(restored)['old'])
    assert decoded == old
    (OUT / 'before-private.json').write_bytes(raw)
    (OUT / 'candidate.conf').write_bytes(new)
    save('backup-proof.json', {'path': str(backup), 'sha256': sha(backup.read_bytes()), 'bytes': backup.stat().st_size, 'exact_decryption_and_config_restore_verified': True, 'artifact_and_live_files_verified': len(rows), 'release': str(EXPECTED_RELEASE), 'entry_origin': entry_row, 'old_sha256': sha(old), 'new_sha256': sha(new)})
    print('PREPARED_VERIFIED_ENCRYPTED_BACKUP_AND_SAME_RELEASE_ORIGIN')


def install(data):
    temp = TARGET.with_name(TARGET.name + '.recovery-next')
    temp.write_bytes(data)
    temp.chmod(0o644)
    os.replace(temp, TARGET)
    subprocess.run([NGINX, '-t'], check=True, capture_output=True)
    subprocess.run([NGINX, '-s', 'reload'], check=True, capture_output=True)


def apply():
    assert_current()
    s = load('before-private.json')
    assert sha(TARGET.read_bytes()) == s['old_sha256']
    candidate = (OUT / 'candidate.conf').read_bytes()
    assert sha(candidate) == s['new_sha256']
    assert runtime() == s['containers']
    assert all(sha(Path(p).read_bytes()) == h for p, h in s['protected'].items())
    try:
        install(candidate)
        for attempt in range(12):
            row, body = request('/')
            if row['status'] == 200 and b'https://static-test.mengceng.com/assets/' not in body:
                break
            time.sleep(.5)
        assert row['status'] == 200 and b'https://static-test.mengceng.com/assets/' not in body
        save('switch-proof.json', {'time': time.strftime('%Y-%m-%dT%H:%M:%S%z'), 'changed_files': [str(TARGET)], 'mode': 'default_same_origin_static', 'root': row, 'release_unchanged': True, 'application_restart': False, 'dns_or_oss_or_database_changes': False})
    except BaseException:
        install(base64.b64decode(s['old']))
        save('guarded-rollback-proof.json', {'original_config_restored': True})
        raise
    print('DEFAULT_STATIC_ORIGIN_ENABLED')


def verify():
    assert_current()
    s = load('before-private.json')
    assert sha(TARGET.read_bytes()) == s['new_sha256']
    assert runtime() == s['containers']
    assert all(sha(Path(p).read_bytes()) == h for p, h in s['protected'].items())
    artifact = EXPECTED_RELEASE / 'web-artifact'
    files = sorted(p for p in (artifact / 'assets').iterdir() if p.suffix in ['.js', '.css', '.woff2', '.wasm'])
    def asset(p):
        row, body = request('/assets/' + p.name)
        row['content_matches_current_artifact'] = sha(body) == sha(p.read_bytes())
        mime = next((x.lower() for x in row['headers'] if x.lower().startswith('content-type:')), '')
        wanted = {'.js': 'javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.wasm': 'application/wasm'}[p.suffix]
        row['mime_valid'] = wanted in mime
        row['immutable'] = any('immutable' in x for x in row['headers'])
        assert row['status'] == 200 and row['tls'] == 0 and row['content_matches_current_artifact'] and row['mime_valid'] and row['immutable'], p.name
        return row
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
        assets = list(ex.map(asset, files))
    pages = []
    for path in ['/', '/login', '/register', '/features/canvas', '/tutorials/infinite-canvas']:
        row, body = request(path, None)
        assert row['status'] == 200 and row['tls'] == 0
        assert b'https://static-test.mengceng.com/assets/' not in body
        pages.append(row)
    apis = []
    for path, expected in [('/api/public/brand-site', 200), ('/api/health/ready', 200), ('/api/resources', 401), ('/api/canvas-projects', 401)]:
        row, body = request(path, None)
        assert row['status'] == expected and row['tls'] == 0
        if path == '/api/health/ready':
            data = json.loads(body)['data']
            assert data['ready'] and data['schema']['current'] == 61 and data['build']['commit'].startswith('7e162e51')
        apis.append(row)
    save('verification-proof.json', {'passed': True, 'release': str(EXPECTED_RELEASE), 'asset_count': len(assets), 'assets': assets, 'pages': pages, 'apis': apis, 'other_protected_files_unchanged': len(s['protected']), 'all_containers_unchanged': True, 'same_origin_cors': 'No cross-origin CORS permission needed; JS/CSS/fonts are served on mengceng.com', 'browser_acceptance': 'separate evidence required'})
    print(json.dumps({'passed': True, 'assets': len(assets), 'pages': len(pages), 'apis': len(apis), 'protected_files': len(s['protected']), 'containers_unchanged': True}))


def rollback():
    assert_current()
    s = load('before-private.json')
    assert sha(TARGET.read_bytes()) == s['new_sha256'], 'Config changed after repair; inspect before rollback'
    install(base64.b64decode(s['old']))
    print('ONLY_STATIC_DEFAULT_RESTORED_NO_APPLICATION_OR_DATA_ROLLBACK')


def routing():
    # Existing host-only credential wrapper; it never exports secrets.
    sys.path.insert(0, '/root/web-optimize-disable-20261029')
    import common as ops
    s = ops.load('before.json')
    revision = ops.load('revision-two-sites-restored.json')
    ali = ops.ali_records()
    root = [r for r in ali if r['RR'] == '@' and r['Type'] == 'A']
    assert len(root) == 6 and all(r['Status'] == 'ENABLE' for r in root)
    tasks = ops.query('SELECT * FROM dnsmgr_optimizeip ORDER BY id')
    assert [(r['id'], r['active']) for r in tasks] == [(1, 1), (2, 1), (3, 1)]
    for zone in s['zones'].values():
        records = ops.cfapi('/zones/' + zone['zone']['id'] + '/dns_records?per_page=5000')['result']
        byid = {r['id']: r for r in records}
        assert set(byid) == {r['id'] for r in zone['records']}
        for old in zone['records']:
            h = old['name']
            expected = ops.stable_cf(old)
            if h in revision['ordinary_sites']:
                expected.update({k: v for k, v in s['rollback'][h]['payload'].items() if k != 'comment'})
                expected.update(comment=None, settings={})
            assert ops.stable_cf(byid[old['id']]) == expected, h
    checks = []
    for record in root:
        for path in ['/', '/assets/index-USgpMd-T.js']:
            row = ops.check('mengceng.com', path, record['Value'])
            assert row['http_code'] == 200 and row['ssl_verify_result'] == 0 and row['returncode'] == 0
            if path.endswith('.js'):
                assert row['sha256'] == sha((EXPECTED_RELEASE / 'web-artifact/assets/index-USgpMd-T.js').read_bytes())
            checks.append(row)
    nodes = ops.php("echo json_encode(App\\Models\\Server::orderBy('id')->get()->map(fn($n)=>$n->getRawOriginal())->all());")
    def static(r):
        return {k: v for k, v in r.items() if k not in ['u', 'd', 'updated_at']}
    assert [static(r) for r in nodes] == [static(r) for r in s['nodes']]
    result = {'passed': True, 'all_cf_record_ids_and_routes_preserved': True, 'root_optimized_enabled': 6, 'active_tasks': [1, 2, 3], 'node_static_configs_preserved': len(nodes), 'edge_checks': checks, 'dns': [ops.doh('mengceng.com'), ops.doh('komari.kongtan.net', 'CNAME'), ops.doh('static-test.mengceng.com')]}
    save('routing-proof.json', result)
    print(json.dumps({'passed': True, 'edge_checks': len(checks), 'nodes_unchanged': len(nodes), 'all_cf_preserved': True}))


if __name__ == '__main__':
    assert len(sys.argv) == 2 and sys.argv[1] in ['prepare', 'apply', 'verify', 'routing', 'rollback']
    globals()[sys.argv[1]]()
