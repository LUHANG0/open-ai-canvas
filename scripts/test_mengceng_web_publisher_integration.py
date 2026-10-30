#!/usr/bin/env python3
"""Opt-in Linux Docker/nginx acceptance; no production files or ports are used.

python3 scripts/test_mengceng_web_publisher_integration.py \
  --root /private/task-owned/empty-directory --base-image sha256:<local-nginx-image>

Requires >20 GiB available (the publisher's extraction gate), Docker, curl and
Python 3.9+. The base image must contain nginx with sub_filter and wget. Builds
two tiny fixture layers without pulling. Cleans only resources it created;
small receipts/results stay in --root for review. Does not run automatically
under unittest discovery.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import time

spec = importlib.util.spec_from_file_location('publisher', Path(__file__).with_name('mengceng-web-publisher.py'))
pub = importlib.util.module_from_spec(spec); spec.loader.exec_module(pub)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', required=True, type=Path)
    parser.add_argument('--base-image', required=True)
    parser.add_argument('--browser-hold-seconds', type=int, default=0,
                        help='Optionally keep target live for up to 180 seconds; create ROOT/browser-continue to resume early')
    args = parser.parse_args()
    assert 0 <= args.browser_hold_seconds <= 180
    root = args.root
    assert root.is_absolute() and root.resolve() == root and not root.exists(), 'Use a new real absolute task directory'
    assert re.fullmatch(r'sha256:[a-f0-9]{64}', args.base_image), 'Base must be an existing image content ID'
    assert shutil.disk_usage(root.parent).free > 20 * 1024**3, 'Insufficient disk'
    root.mkdir(mode=0o700)
    identity = 'mc-publisher-test-' + hashlib.sha256(str(root).encode()).hexdigest()[:10]
    containers, images, network = [], [], None
    results = []
    shared = root / 'shared'; shared.mkdir()
    configs = root / 'nginx'; configs.mkdir()
    # Parent must be traversable inside nginx's unprivileged worker; root is a
    # private task directory on the host, mounted at /fixture in the container.
    # nginx runs workers as root only inside these unprivileged fixture images.
    def run(command, **kwargs):
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, **kwargs)
        if result.returncode:
            raise RuntimeError('Fixture command failed: ' + repr(command[:4]) + '\n' + result.stderr.decode()[-2000:])
        return result.stdout.decode().strip()
    def docker(*arguments): return run(['docker', *arguments])
    def check(name, callback):
        start = time.time(); callback()
        results.append({'name': name, 'passed': True, 'seconds': round(time.time() - start, 3)})
        pub.save_json(root / 'results.json', {'cases': results, 'complete': False})
        print('PASS ' + name, flush=True)
    def wait_healthy(name):
        for _ in range(40):
            state = json.loads(docker('inspect', name))[0]['State']
            if state.get('Health', {}).get('Status') == 'healthy': return
            time.sleep(0.5)
        raise RuntimeError('Fixture did not become healthy')
    try:
        network = identity; docker('network', 'create', '--label', 'io.mengceng.publisher-test=' + identity, network)
        # BuildKit parses a bare sha256:ID in FROM as a registry repository.
        # Give the already inspected local image a task-owned tag; never pull.
        base_tag = identity + ':base'
        docker('tag', args.base_image, base_tag); images.append(base_tag)
        assert json.loads(docker('image', 'inspect', base_tag))[0]['Id'] == args.base_image
        with socket.socket() as bound:
            bound.bind(('127.0.0.1', 0)); port = bound.getsockname()[1]
        origin = 'http://127.0.0.1:' + str(port)
        cdn = origin + '/cdn/assets/'
        brand = origin + '/cdn/brand/'
        releases, builds = {}, {}
        for side, char in [('old', 'a'), ('new', 'b')]:
            build = root / ('build-' + side); build.mkdir(); content = build / 'release'; content.mkdir()
            suffix = char * 8
            files = {
                'index.html': '<!doctype html><head><title>Publisher acceptance</title></head><body><h1>fixture-' + side + '</h1><script type="module" crossorigin src="/assets/index-' + suffix + '.js"></script></body>',
                'assets/index-' + suffix + '.js': 'import"./application-' + suffix + '.js";document.body.dataset.release="' + side + '";',
                'assets/application-' + suffix + '.js': 'import{a}from"./shared-12345678.js";export const brand="/brand/logo.svg";console.log(a);',
                'assets/application-' + suffix + '.css': '@font-face{font-family:fixture;src:url(/brand/fonts/test.woff2)}h1{color:' + ('green' if side == 'old' else 'blue') + '}',
                'assets/shared-12345678.js': 'export const a=1;',
                'brand/fonts/test.woff2': 'fixture-font',
                'brand/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
            }
            for name, body in files.items():
                path = content / name; path.parent.mkdir(exist_ok=True, parents=True); path.write_text(body)
            webconf = 'user root; events {} http { include /etc/nginx/mime.types; server { listen 80; root /fixture/shared; location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; } location /cdn-root/ { alias /fixture/shared/cdn/; } location /brand/ { add_header Cache-Control "public, max-age=300"; } location / { try_files $uri /index.html; add_header Cache-Control "no-cache"; } } }'
            (build / 'nginx.conf').write_text(webconf)
            (build / 'Dockerfile').write_text('FROM ' + base_tag + '\nRUN rm -rf /opt/canvas-release\nCOPY release/ /opt/canvas-release/\nCOPY nginx.conf /etc/nginx/nginx.conf\nLABEL org.opencontainers.image.revision="' + char * 40 + '"\nENTRYPOINT ["nginx", "-g", "daemon off;"]\nCMD []\nHEALTHCHECK --interval=1s --timeout=2s --start-period=0s CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1\n')
            tag = identity + ':' + side; images.append(tag)
            docker('build', '--network=none', '--pull=false', '-q', '-t', tag, str(build))
            image = json.loads(docker('image', 'inspect', tag))[0]['Id']
            release = {'format': 1, 'id': side, 'components': {s: {'image': image, 'commit': char * 40, 'version': side} for s in ('web', 'backend', 'yingce-agent')}}
            if side == 'new': release['basedOn'] = 'old'
            pub.save_json(root / (side + '.json'), release); releases[side] = release; builds[side] = content
        prefix = 'proxy_set_header Accept-Encoding "";\nsub_filter_once off;\nsub_filter \'href="/assets/\' \'href="${mc_static_assets}\';\nsub_filter \'src="/assets/\' \'src="${mc_static_assets}\';\n'
        origin_file, home = configs / 'origin.conf', configs / 'home.conf'
        oldinfo = pub.inspect_artifact(builds['old'], ['application'])
        oldorigin, oldhome = pub.render_preloads(releases['old'], oldinfo, prefix)
        origin_file.write_bytes(oldorigin); home.write_bytes(oldhome)
        html = configs / 'html.conf'; html.write_text(prefix)
        routing = configs / 'gateway.conf'
        routing.write_text('user root; events {} http { include /etc/nginx/mime.types; map $cookie_mc_static_origin $mc_static_assets { default ' + cdn + '; 1 /assets/; } server { listen 80; location = / { include ' + str(home) + '; proxy_pass http://web/; } location /cdn/assets/ { proxy_pass http://web/cdn-root/; proxy_set_header Accept-Encoding ""; sub_filter_once off; sub_filter_types application/javascript text/css; sub_filter \'"/brand/\' \'"' + brand + '\'; sub_filter \'url(/brand/\' \'url(' + brand + '\'; proxy_hide_header Cache-Control; add_header Cache-Control "public, max-age=31536000, immutable"; } location /cdn/brand/ { proxy_pass http://web/brand/; } location /assets/ { proxy_pass http://web; } location /brand/ { proxy_pass http://web; } location / { include ' + str(html) + '; proxy_pass http://web; } } }')
        gateway = identity + '-gateway'
        wrapper = root / 'nginx-command'
        wrapper.write_text('#!/bin/sh\nexec /usr/bin/docker exec ' + gateway + ' nginx -c ' + str(routing) + ' "$@"\n'); wrapper.chmod(0o700)
        config = {'format': 1, 'projectName': identity, 'nginxCommand': [str(wrapper)], 'originURL': origin,
            'cdnAssetsURL': cdn, 'cdnBrandURL': brand, 'originPreloadFile': str(origin_file), 'cdnPreloadFile': str(home),
            'protectedFiles': {str(p): pub.file_hash(p) for p in (routing, html)}, 'preloadStems': ['application'],
            'cdnTransforms': [{'from': '"/brand/', 'to': '"' + brand}, {'from': 'url(/brand/', 'to': 'url(' + brand}],
            'htmlMarkers': ['Publisher acceptance'], 'lockFile': str(root / 'publisher.lock'), 'operationTimeout': 120}
        config_path = root / 'config.json'; pub.save_json(config_path, config)
        current = None
        def switch(side):
            nonlocal current
            if current: docker('rm', '-f', current)
            for path in builds[side].rglob('*'):
                if path.is_file():
                    relative = path.relative_to(builds[side]); target = shared / relative
                    target.parent.mkdir(exist_ok=True, parents=True); shutil.copyfile(path, target)
                    if str(relative).startswith('assets/'):
                        mirrored = shared / 'cdn' / Path(str(relative).removeprefix('assets/'))
                        mirrored.parent.mkdir(exist_ok=True, parents=True); shutil.copyfile(path, mirrored)
            current = identity + '-' + side
            if current not in containers: containers.append(current)
            docker('run', '-d', '--name', current, '--label', 'io.mengceng.publisher-test=' + identity,
                '--label', 'com.docker.compose.project=' + identity, '--label', 'com.docker.compose.service=web',
                '--network', network, '--network-alias', 'web', '-v', str(root) + ':/fixture:ro', releases[side]['components']['web']['image'])
            wait_healthy(current)
            # nginx resolves upstreams at reload; the host updater also starts
            # the new container before invoking publisher publish/rollback.
            if gateway in containers: docker('exec', gateway, 'nginx', '-c', str(routing), '-s', 'reload'); time.sleep(0.3)
        switch('old')
        containers.append(gateway)
        docker('run', '-d', '--name', gateway, '--label', 'io.mengceng.publisher-test=' + identity, '--network', network,
            '--label', 'com.docker.compose.project=' + identity, '--label', 'com.docker.compose.service=gateway',
            '-p', '127.0.0.1:' + str(port) + ':80', '-v', str(root) + ':' + str(root) + ':ro',
            '--entrypoint', 'nginx', args.base_image, '-c', str(routing), '-g', 'daemon off;')
        time.sleep(0.5)
        receipt = root / 'receipt'; receipt.mkdir(mode=0o700)
        def phase(name, success=True, target_receipt=receipt):
            completed = subprocess.run([str(Path(__file__).with_name('mengceng-web-publisher.py')), name, str(root / 'old.json'), str(root / 'new.json'), str(target_receipt)], env={**os.environ, 'MENGCENG_WEB_PUBLISHER_CONFIG': str(config_path)}, capture_output=True)
            if (completed.returncode == 0) != success:
                raise RuntimeError('Unexpected publisher result: ' + name + ' ' + str(completed.returncode) + ' ' + completed.stderr.decode())
        initial = [p.read_bytes() for p in (origin_file, home)]
        check('real preflight leaves active nginx files unchanged', lambda: (phase('preflight'), pub.require(initial == [p.read_bytes() for p in (origin_file, home)], 'Preflight mutated active files')))
        check('publish refuses old running image', lambda: phase('publish', False))
        switch('new')
        check('publish target with real nginx syntax test and reload', lambda: phase('publish'))
        check('public CDN and origin fallback HTML/assets/fonts match target', lambda: phase('verify'))
        if args.browser_hold_seconds:
            pub.save_json(root / 'browser-target.json', {'url': origin, 'expectedRelease': 'new'})
            print('BROWSER ' + origin, flush=True)
            until = time.monotonic() + args.browser_hold_seconds
            while time.monotonic() < until and not (root / 'browser-continue').exists():
                time.sleep(0.5)
        corrupt = shared / 'cdn/application-bbbbbbbb.js'; saved = corrupt.read_bytes(); corrupt.write_text('bad CDN body')
        check('CDN corruption fails verification', lambda: phase('verify', False)); corrupt.write_bytes(saved)
        retained = shared / 'assets/index-aaaaaaaa.js'; saved = retained.read_bytes(); retained.unlink()
        check('missing old entry chunk fails verification', lambda: phase('verify', False)); retained.write_bytes(saved)
        check('repaired delivery passes full verification', lambda: phase('verify'))
        home.write_text('# operator edit\n')
        check('operator preload edit blocks publication without overwrite', lambda: (phase('publish', False), pub.require(home.read_text() == '# operator edit\n', 'Operator edit overwritten')))
        plan = pub.strict_json(receipt / 'plan.json'); home.write_bytes((receipt / 'next-1.conf').read_bytes())
        switch('old')
        check('rollback restores exact previous configs and actual public bytes', lambda: (phase('rollback'), pub.require(initial == [p.read_bytes() for p in (origin_file, home)], 'Rollback differs')))
        check('rollback can be repeated', lambda: phase('rollback'))
        # Inject a render defect into this isolated private test receipt, with
        # matching hash, to reach the actual nginx syntax failure boundary.
        next_home = receipt / 'next-1.conf'; next_home.write_bytes(next_home.read_bytes() + b'publisher_invalid_directive on;\n')
        plan['receiptFiles']['next-1.conf'] = pub.file_hash(next_home); pub.save_json(receipt / 'plan.json', plan)
        switch('new')
        check('real nginx rejects invalid prepared target configuration', lambda: phase('publish', False))
        # The updater restarts old web before rollback. Restore only the broken
        # on-disk fixture config so its switch helper can reload upstream DNS;
        # then recreate the partial publication state for publisher recovery.
        home.write_bytes(initial[1]); switch('old'); home.write_bytes(next_home.read_bytes())
        check('rollback repairs configs after failed real nginx syntax test', lambda: phase('rollback'))
        # Simulate interruption between two atomic writes using valid receipt.
        origin_file.write_bytes((receipt / 'next-0.conf').read_bytes())
        check('rollback repairs a partial two-file publication', lambda: phase('rollback'))
        browser = {'url': origin, 'receipt': str(receipt)}
        pub.save_json(root / 'browser-target.json', browser)
        # Browser access is optional and bounded. Harness normally cleans on
        # exit; use remote SSH forwarding and a separate fixture for long QA.
        pub.save_json(root / 'results.json', {'complete': True, 'cases': results, 'publisherSha256': pub.file_hash(Path(__file__).with_name('mengceng-web-publisher.py')), 'productionTouched': False})
    finally:
        cleanup = []
        for name in reversed(containers):
            exists = subprocess.run(['docker', 'inspect', name], capture_output=True)
            if exists.returncode == 0:
                row = json.loads(exists.stdout)[0]
                assert row['Config']['Labels'].get('io.mengceng.publisher-test') == identity
                docker('rm', '-f', name); cleanup.append(name)
        if network: docker('network', 'rm', network); cleanup.append(network)
        for image in images:
            if subprocess.run(['docker', 'image', 'inspect', image], capture_output=True).returncode == 0:
                docker('image', 'rm', image); cleanup.append(image)
        for build in root.glob('build-*'): shutil.rmtree(build)
        shutil.rmtree(shared)
        # Extracted copies are reconstructable from the fixture images, whose
        # generated source is deterministic above. Keep small plan/reports.
        for path in (root / 'receipt').glob('image-*'):
            if path.is_dir(): shutil.rmtree(path)
            else: path.unlink()
        pub.save_json(root / 'cleanup.json', {'removed': cleanup, 'fixtureSharedFilesRemoved': True})


if __name__ == '__main__': main()
