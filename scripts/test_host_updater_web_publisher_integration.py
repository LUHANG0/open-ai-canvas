#!/usr/bin/env python3
"""Opt-in full Host Updater -> real nginx/CDN publisher acceptance on Linux.

Use a new --root and a built --updater. All --*-image values must identify
existing local images. Only task-owned isolated Compose volumes are written.
No production paths, credentials, ports or updater service are used. No pulls.
The existing backend image must support schema 61 and PostgreSQL/Redis; Web
images must expose /opt/canvas-release and use the shared-volume entrypoint.
Successful runs clean containers/volumes/network and extracted copies, keeping
small private receipts. Failed runs keep the fixture for ownership-checked
inspection/cleanup; always stop the updater process before returning.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import time
import urllib.request

spec = importlib.util.spec_from_file_location('publisher', Path(__file__).with_name('mengceng-web-publisher.py'))
pub = importlib.util.module_from_spec(spec); spec.loader.exec_module(pub)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for option in ['root', 'updater', 'compose']:
        parser.add_argument('--' + option, type=Path, required=True)
    for option in ['old-web', 'new-web', 'backend', 'agent', 'postgres', 'redis']:
        parser.add_argument('--' + option + '-image', required=True)
    args = parser.parse_args()
    root = args.root
    assert root.is_absolute() and root.resolve() == root and not root.exists(), 'Use a new real task directory'
    assert args.updater.is_file() and args.compose.is_file()
    assert shutil.disk_usage(root.parent).free > 20 * 1024**3
    root.mkdir(mode=0o700)
    project = 'mc-updater-publisher-' + secrets.token_hex(4)
    process = None; gateway = project + '-gateway'; created_gateway = False
    cases = []
    result = {'project': project, 'passed': False, 'cases': cases, 'productionTouched': False,
              'updaterSha256': pub.file_hash(args.updater), 'publisherSha256': pub.file_hash(Path(__file__).with_name('mengceng-web-publisher.py'))}
    def run(command, **kwargs):
        response = subprocess.run(command, capture_output=True, **kwargs)
        if response.returncode:
            raise RuntimeError('Fixture command failed: ' + repr(command[:4]) + '\n' + response.stderr.decode()[-1500:])
        return response.stdout
    def docker(*parts): return run(['docker', *parts])
    def save(path, value): pub.save_json(path, value)
    def free_port():
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0)); return listener.getsockname()[1]
    web_port, gateway_port = free_port(), free_port()
    assert web_port != gateway_port
    web_url = 'http://127.0.0.1:' + str(web_port)
    origin = 'http://127.0.0.1:' + str(gateway_port)
    cdn, brand = origin + '/cdn/assets/', origin + '/cdn/brand/'
    inventory = {}
    for key in ['old_web', 'new_web', 'backend', 'agent', 'postgres', 'redis']:
        row = json.loads(docker('image', 'inspect', getattr(args, key + '_image')))[0]
        inventory[key] = {'id': row['Id'], 'commit': (row['Config'].get('Labels') or {}).get('org.opencontainers.image.revision')}
    token, password = secrets.token_hex(32), secrets.token_hex(20)
    env = root / 'shared.env'
    env.write_text('\n'.join(['POSTGRES_DB=fixture', 'POSTGRES_USER=fixture', 'POSTGRES_PASSWORD=' + password,
        'DATABASE_URL=postgresql://fixture:' + password + '@postgres:5432/fixture?sslmode=disable',
        'CANVAS_BACKEND_IMAGE=' + inventory['backend']['id'], 'CANVAS_WEB_IMAGE=' + inventory['old_web']['id'],
        'CANVAS_YINGCE_AGENT_IMAGE=' + inventory['agent']['id'], 'CANVAS_IMAGE_TAG=fixture',
        'CANVAS_UPDATER_TOKEN=' + token, 'YINGCE_AGENT_TOKEN=' + token,
        'CANVAS_UPDATER_SOCKET_DIR=' + str(root / 'socket'), 'CANVAS_HTTP_PORT=127.0.0.1:' + str(web_port),
        "FIXTURE_SECRET='keep$literal${unexpanded}'"]) + '\n'); env.chmod(0o600)
    (root / 'socket').mkdir(mode=0o700)
    base = root / 'base.yml'; shutil.copyfile(args.compose, base); base.chmod(0o600)
    overlay = root / 'fixture.json'
    services = {name: {'healthcheck': {'interval': '1s', 'start_period': '1s', 'retries': 60}}
                for name in ['web', 'backend', 'yingce-agent', 'postgres', 'redis']}
    services['postgres']['image'] = inventory['postgres']['id']; services['redis']['image'] = inventory['redis']['id']
    services['backend']['environment'] = {'FIXTURE_SECRET': '${FIXTURE_SECRET}'}
    save(overlay, {'services': services})
    compose = ['docker', 'compose', '--project-name', project, '--project-directory', str(root), '--env-file', str(env), '-f', str(base), '-f', str(overlay)]
    volume_names = [project + '_' + name for name in ['backend-data', 'postgres-data', 'redis-data', 'web-data']]
    save(root / 'owner.json', {'project': project, 'root': str(root), 'volumes': volume_names, 'gateway': gateway})
    def service_ids():
        rows = {}
        for name in ['web', 'backend', 'yingce-agent', 'postgres', 'redis']:
            ident = run(compose + ['ps', '--all', '-q', name]).decode().strip()
            row = json.loads(docker('inspect', ident))[0]
            rows[name] = {'id': row['Id'], 'image': row['Image'], 'startedAt': row['State']['StartedAt']}
        return rows
    def sql(statement):
        return run(compose + ['exec', '-T', 'postgres', 'psql', '-U', 'fixture', '-d', 'fixture', '-At', '-v', 'ON_ERROR_STOP=1', '-c', statement]).decode().strip()
    def write_probe(value):
        assert value in ['original', 'after-publication']
        sql("UPDATE updater_fixture_probe SET value='" + value + "' WHERE id=1")
        run(compose + ['exec', '-T', '--user', 'root', 'backend', 'sh', '-c', 'printf ' + value + ' > /data/updater-fixture-probe'])
    def probe():
        return {'database': sql('SELECT value FROM updater_fixture_probe WHERE id=1'),
                'file': run(compose + ['exec', '-T', '--user', 'root', 'backend', 'cat', '/data/updater-fixture-probe']).decode()}
    def api(method, path, value=None):
        command = ['curl', '--disable', '-fsS', '--max-time', '20', '--unix-socket', str(root / 'updater.sock'), '-X', method,
                   'http://localhost/v1/' + path, '-H', 'Authorization: Bearer ' + token]
        if value is not None: command += ['-H', 'Content-Type: application/json', '--data-binary', json.dumps(value)]
        return json.loads(run(command))
    def wait_operation(expected):
        deadline = time.monotonic() + 180
        while time.monotonic() < deadline:
            status = api('GET', 'status'); phase = status['operation']['phase']
            if phase in ['succeeded', 'rolled_back', 'failed', 'manual_intervention']:
                assert phase == expected, status['operation']; return status
            time.sleep(0.5)
        raise TimeoutError('Updater transaction did not settle')
    def record(name, **facts):
        cases.append({'name': name, 'passed': True, **facts}); save(root / 'results.json', result)
        print('PASS ' + name, flush=True)
    def release(ident, web, based_on=None):
        data = {'format': 1, 'id': ident, 'components': {}}
        for name, key in [('web', web), ('backend', 'backend'), ('yingce-agent', 'agent')]:
            image = inventory[key]; data['components'][name] = {'image': image['id'], 'version': version, 'commit': image['commit']}
        if based_on: data['basedOn'] = based_on
        return data
    def update(ident, expected):
        current = api('GET', 'status')['currentVersion']
        save(root / 'target.json', release(ident, 'new_web', current))
        api('POST', 'check', {}); api('POST', 'update', {'targetVersion': ident})
        return wait_operation(expected)
    try:
        run(compose + ['up', '-d', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '120', 'postgres', 'redis', 'yingce-agent'])
        run(compose + ['run', '--rm', '--no-deps', '--pull', 'never', 'migrate'])
        run(compose + ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '120', 'backend', 'web'])
        with urllib.request.urlopen(web_url + '/api/health/ready', timeout=15) as response: ready = json.load(response)['data']
        assert ready['ready'] and ready['schema']['current'] == 61
        version = ready['build']['version']
        assert ready['build']['commit'] == inventory['backend']['commit']
        save(root / 'from.json', release('baseline', 'old_web'))
        save(root / 'target.json', release('candidate', 'new_web', 'baseline'))
        preview = root / 'artifact-inspection'; preview.mkdir(mode=0o700)
        # Reuse the real adapter extraction/inspection without a public phase.
        extractor = pub.Publisher.__new__(pub.Publisher); extractor.receipt = preview
        extractor.docker = '/usr/bin/docker'; extractor.deadline = time.monotonic() + 120
        roots, artifacts = {}, {}
        stems = ['application', 'brand-auth-entry', 'brand-site', 'auth-form-pending']
        for key in ['old_web', 'new_web']:
            roots[key] = extractor.extract(inventory[key]['id']); artifacts[key] = pub.inspect_artifact(roots[key], stems)
        origin_file, home, html = [root / name for name in ['origin.conf', 'home.conf', 'html.conf']]
        prefix = 'proxy_set_header Accept-Encoding "";\nsub_filter_once off;\nsub_filter \'href="/assets/\' \'href="${mc_static_assets}\';\nsub_filter \'src="/assets/\' \'src="${mc_static_assets}\';\nsub_filter \'href="/brand/\' \'href="${mc_static_brand}\';\nsub_filter \'src="/brand/\' \'src="${mc_static_brand}\';\n'
        oldorigin, oldhome = pub.render_preloads(release('baseline', 'old_web'), artifacts['old_web'], prefix)
        origin_file.write_bytes(oldorigin); home.write_bytes(oldhome); html.write_text(prefix)
        initial_preloads = [origin_file.read_bytes(), home.read_bytes()]
        transforms = [{'from': left, 'to': right} for left, right in [('"/brand/', '"' + brand), ("'/brand/", "'" + brand), ('`/brand/', '`' + brand), ('url(/brand/', 'url(' + brand), ('return`/`+e', 'return`' + cdn + '`+(e.startsWith("assets/")?e.slice(7):e)')]]
        bridge = ''.join('sub_filter ' + pub.quote_nginx(t['from']) + ' ' + pub.quote_nginx(t['to']) + ';\n' for t in transforms)
        gateway_conf = root / 'nginx.conf'
        gateway_conf.write_text('user root; events {} http { access_log off; map $cookie_mc_static_origin $mc_static_assets { default ' + cdn + '; 1 /assets/; } map $cookie_mc_static_origin $mc_static_brand { default ' + brand + '; 1 /brand/; } map $uri $mc_target_entry { default 0; /cdn/' + artifacts['new_web']['entry'] + ' 1; } server { listen 127.0.0.1:' + str(gateway_port) + '; location = / { include ' + str(home) + '; proxy_pass ' + web_url + '/; } location /cdn/assets/ { if (-f ' + str(root) + '/fail-cdn-$mc_target_entry) { return 503; } proxy_pass ' + web_url + '/assets/; proxy_set_header Accept-Encoding ""; sub_filter_once off; sub_filter_types application/javascript text/css; ' + bridge + 'proxy_hide_header Cache-Control; add_header Cache-Control "public, max-age=31536000, immutable"; } location /cdn/brand/ { proxy_pass ' + web_url + '/brand/; proxy_hide_header Cache-Control; add_header Cache-Control "public, max-age=300"; } location /assets/ { proxy_pass ' + web_url + '; } location /brand/ { proxy_pass ' + web_url + '; } location /api/ { proxy_pass ' + web_url + '; } location / { include ' + str(html) + '; proxy_pass ' + web_url + '; } } }')
        command = root / 'nginx-command'
        command.write_text('#!/bin/sh\nif [ "$1" = "-t" ] && [ -f ' + str(root / 'fail-nginx-once') + ' ]; then rm ' + str(root / 'fail-nginx-once') + '; exit 70; fi\nexec /usr/bin/docker exec ' + gateway + ' nginx -c ' + str(gateway_conf) + ' "$@"\n'); command.chmod(0o700)
        docker('run', '-d', '--name', gateway, '--network', 'host', '--no-healthcheck', '--label', 'io.mengceng.updater-publisher=' + project,
               '--label', 'com.docker.compose.project=' + project, '--label', 'com.docker.compose.service=publisher-gateway',
               '-v', str(root) + ':' + str(root) + ':ro', '--entrypoint', 'nginx', inventory['new_web']['id'], '-c', str(gateway_conf), '-g', 'daemon off;')
        created_gateway = True
        config = {'format': 1, 'projectName': project, 'nginxCommand': [str(command)], 'originURL': origin, 'cdnAssetsURL': cdn, 'cdnBrandURL': brand,
                  'originPreloadFile': str(origin_file), 'cdnPreloadFile': str(home), 'protectedFiles': {str(p): pub.file_hash(p) for p in [html, gateway_conf]},
                  'preloadStems': stems, 'cdnTransforms': transforms, 'htmlMarkers': ['<title>'], 'lockFile': str(root / 'publisher.lock'), 'operationTimeout': 120}
        save(root / 'publisher.json', config)
        profile = {'format': 1, 'projectName': project, 'projectDirectory': str(root), 'composeFiles': [str(base), str(overlay)], 'envFile': str(env),
                   'currentRelease': str(root / 'from.json'), 'targetRelease': str(root / 'target.json'),
                   'webPublisher': str(Path(__file__).with_name('mengceng-web-publisher.py')), 'webPublisherSha256': result['publisherSha256']}
        save(root / 'profile.json', profile)
        sql('CREATE TABLE updater_fixture_probe (id bigint PRIMARY KEY, value text NOT NULL)')
        sql("INSERT INTO updater_fixture_probe VALUES (1,'original')"); write_probe('original')
        initial = service_ids(); initial_probe = probe()
        protected = {str(p): pub.file_hash(p) for p in [base, overlay, env, root / 'profile.json', root / 'from.json']}
        environment = {**os.environ, 'CANVAS_UPDATER_CUSTOM_PROFILE': str(root / 'profile.json'), 'CANVAS_UPDATER_STATE_DIR': str(root / 'state'),
            'CANVAS_UPDATER_BACKUP_DIR': str(root / 'backups'), 'CANVAS_UPDATER_SOCKET': str(root / 'updater.sock'), 'CANVAS_UPDATER_TOKEN': token,
            'CANVAS_UPDATER_STABLE_WINDOW': '1s', 'CANVAS_UPDATER_HEALTH_URL': web_url + '/api/health/ready', 'CANVAS_UPDATER_STEP_TIMEOUT': '3m',
            'MENGCENG_WEB_PUBLISHER_CONFIG': str(root / 'publisher.json')}
        log = (root / 'updater.log').open('wb')
        process = subprocess.Popen([str(args.updater)], env=environment, stdout=log, stderr=log); log.close()
        for _ in range(300):
            if process.poll() is not None: raise RuntimeError('Updater exited')
            if (root / 'updater.sock').exists(): break
            time.sleep(0.2)
        assert api('GET', 'status')['connected']
        status = update('web-success', 'succeeded'); assert status['currentVersion'] == 'web-success'
        after = service_ids(); assert all(after[k] == initial[k] for k in ['backend', 'yingce-agent', 'postgres', 'redis'])
        assert probe() == initial_probe
        reports = list((root / 'state').glob('custom-release-*/publication/verification.json')); assert len(reports) == 1
        target_report = pub.strict_json(reports[0]); assert target_report['release'] == 'web-success'
        assert not list((root / 'backups').glob('*.zip'))
        record('complete updater publishes target through real adapter and nginx CDN', htmlCases=len(target_report['html']), assets=len(target_report['assets']), fonts=len(target_report['fonts']), independentServicesUnchanged=True, databaseBackupsNotCreated=True)
        write_probe('after-publication'); live = probe()
        api('POST', 'rollback', {'reason': 'isolated frontend rollback'}); wait_operation('rolled_back')
        assert probe() == live and initial_preloads == [origin_file.read_bytes(), home.read_bytes()]
        record('manual updater rollback restores public delivery and preserves later database/file writes')
        (root / 'fail-cdn-1').touch(mode=0o600)
        update('cdn-failure', 'rolled_back'); assert probe() == live
        assert initial_preloads == [origin_file.read_bytes(), home.read_bytes()]
        (root / 'fail-cdn-1').unlink()
        record('target CDN failure triggers automatic updater rollback to verified old delivery')
        (root / 'fail-nginx-once').touch(mode=0o600)
        update('nginx-failure', 'rolled_back'); assert probe() == live
        assert initial_preloads == [origin_file.read_bytes(), home.read_bytes()]
        record('injected nginx test failure after file installation triggers complete automatic recovery')
        before_drift = service_ids(); original_html = html.read_bytes(); html.write_bytes(original_html + b'# operator edit\n')
        update('routing-drift', 'failed'); assert service_ids() == before_drift and html.read_bytes().endswith(b'# operator edit\n')
        html.write_bytes(original_html)
        record('nginx routing drift blocks full updater before service stop and preserves operator edit')
        assert all(pub.file_hash(Path(p)) == value for p, value in protected.items())
        assert all(service_ids()[k] == initial[k] for k in ['backend', 'yingce-agent', 'postgres', 'redis'])
        record('source configuration component isolation and post-publication data remain intact')
        result['passed'] = True
    except Exception as error:
        result['errorType'] = type(error).__name__
        # No raw Docker output/credentials are written into the public result.
        raise
    finally:
        if process and process.poll() is None:
            process.terminate()
            try: process.wait(timeout=30)
            except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=10)
        result['finishedAt'] = time.time(); save(root / 'results.json', result)
        if result['passed']:
            if created_gateway: docker('rm', '-f', gateway)
            # Compose owns only this new task's named volumes and network.
            run(compose + ['down', '--volumes', '--remove-orphans'])
            for volume in volume_names:
                assert subprocess.run(['docker', 'volume', 'inspect', volume], capture_output=True).returncode != 0
            removed = []
            for parent in [root / 'artifact-inspection', *list((root / 'state').glob('custom-release-*/publication'))]:
                for item in parent.glob('image-*'):
                    if item.is_dir(): shutil.rmtree(item); removed.append(str(item))
                    elif item.is_file(): item.unlink()
            save(root / 'cleanup.json', {'taskContainersAndVolumesRemoved': True, 'extractedArtifactsRemoved': removed, 'smallReceiptsRetained': True})


if __name__ == '__main__': main()
