import copy
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('publisher', Path(__file__).with_name('mengceng-web-publisher.py'))
pub = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pub)


def manifest(name='old', commit='a', image='1'):
    return {'format': 1, 'id': name, 'components': {
        service: {'image': 'sha256:' + image * 64, 'commit': commit * 40, 'version': name}
        for service in ('web', 'backend', 'yingce-agent')}}


def artifact(root, suffix='aaaaaaaa'):
    files = {
        'index.html': '<head></head><script type="module" crossorigin src="/assets/index-' + suffix + '.js"></script>',
        'assets/index-' + suffix + '.js': 'import"./application-' + suffix + '.js";',
        'assets/application-' + suffix + '.js': 'import{a}from"./shared-12345678.js";import"./theme-12345678.css";export const b="/brand/logo.svg";',
        'assets/application-' + suffix + '.css': '@font-face{src:url(/brand/fonts/test.woff2)}',
        'assets/shared-12345678.js': 'export const a=1;',
        'assets/theme-12345678.css': 'body{color:black}',
        'brand/fonts/test.woff2': 'fixture-font',
    }
    for name, body in files.items():
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(body)
    return pub.inspect_artifact(root, ['application'])


class PublisherTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        self.receipt = self.root / 'receipt'; self.receipt.mkdir(mode=0o700)
        self.old = manifest(); self.new = manifest('new', 'b', '2'); self.new['basedOn'] = 'old'
        for name, value in [('old', self.old), ('new', self.new)]:
            pub.save_json(self.root / (name + '.json'), value)
        self.active = [self.root / 'origin.conf', self.root / 'home.conf']
        self.active[0].write_text('# old origin\n')
        self.active[1].write_text('sub_filter_once off;\n# ${mc_static_assets}\nset $mc_preload_0 "old";\n')
        protected = self.root / 'routing.conf'; protected.write_text('# routing\n')
        command = self.root / 'command'; command.write_text('#!/bin/sh\nexit 0\n'); command.chmod(0o700)
        self.config = {'format': 1, 'projectName': 'publisher-fixture', 'nginxCommand': [str(command)],
            'originURL': 'http://127.0.0.1:12345', 'cdnAssetsURL': 'http://127.0.0.1:12345/cdn/assets/',
            'cdnBrandURL': 'http://127.0.0.1:12345/cdn/brand/',
            'originPreloadFile': str(self.active[0]), 'cdnPreloadFile': str(self.active[1]),
            'protectedFiles': {str(protected): pub.file_hash(protected)}, 'preloadStems': ['application'],
            'cdnTransforms': [{'from': 'url(/brand/', 'to': 'url(http://127.0.0.1:12345/cdn/brand/'}],
            'htmlMarkers': [], 'lockFile': str(self.root / 'publisher.lock'), 'dockerPath': str(command), 'curlPath': str(command)}
        self.config_path = self.root / 'config.json'; pub.save_json(self.config_path, self.config)
        self.p = self.publisher()

    def tearDown(self):
        self.temp.cleanup()

    def publisher(self):
        return pub.Publisher(self.config_path, self.root / 'old.json', self.root / 'new.json', self.receipt)

    def fixture_plan(self):
        artifacts = {}
        for side, suffix in [('from', 'aaaaaaaa'), ('to', 'bbbbbbbb')]:
            root = self.receipt / side; root.mkdir(mode=0o700)
            artifacts[side] = artifact(root, suffix); artifacts[side]['directory'] = side
        hashes = {}
        for i, path in enumerate(self.active):
            for side, body in [('before', path.read_bytes()), ('next', b'# next\n')]:
                name = side + '-' + str(i) + '.conf'
                pub.atomic_write(self.receipt / name, body); hashes[name] = pub.file_hash(self.receipt / name)
        plan = {'format': 1, 'inputs': self.p.input_hashes, 'artifacts': artifacts, 'receiptFiles': hashes, 'modes': [0o644, 0o644]}
        pub.save_json(self.receipt / 'plan.json', plan)
        return plan

    def test_manifest_rejects_mutable_images_and_short_commit(self):
        for field, value in [('image', 'nginx:latest'), ('commit', 'a1234'), ('version', 'bad\n')]:
            with self.subTest(field=field):
                release = copy.deepcopy(self.old); release['components']['web'][field] = value
                with self.assertRaises(pub.PublicationError): pub.validate_release(release)

    def test_manifest_ancestry(self):
        self.new['basedOn'] = 'different'; pub.save_json(self.root / 'new.json', self.new)
        with self.assertRaisesRegex(pub.PublicationError, 'ancestry'): self.publisher()

    def test_duplicate_json(self):
        path = self.root / 'duplicate'; path.write_text('{"format":1,"format":2}')
        with self.assertRaisesRegex(pub.PublicationError, 'Duplicate'): pub.strict_json(path)

    def test_asset_path_rejects_traversal_and_unsafe_names(self):
        for name in ['../x', 'a/../x', '/absolute', './a', 'a//b', 'a b', 'a?query', 'a\\b', 'a\n']:
            with self.subTest(name=name), self.assertRaises(pub.PublicationError): pub.asset_path(name)

    def test_host_paths_reject_symlinks_and_writable_file(self):
        link = self.root / 'link'; link.symlink_to(self.config_path)
        with self.assertRaises(pub.PublicationError): pub.real_path(str(link))
        self.config_path.chmod(0o666)
        with self.assertRaises(pub.PublicationError): pub.real_path(str(self.config_path))

    def test_public_urls_reject_credentials_and_remote_http(self):
        for url in ['http://example.com', 'https://a:secret@example.com', 'https://example.com/?token=secret']:
            self.config['originURL'] = url; pub.save_json(self.config_path, self.config)
            with self.subTest(url=url), self.assertRaises(pub.PublicationError): self.publisher()

    def test_preload_graph_static_imports_css_and_existing_exclusion(self):
        info = artifact(self.root / 'build')
        self.assertEqual(info['preloads'], ['assets/application-aaaaaaaa.css', 'assets/application-aaaaaaaa.js', 'assets/shared-12345678.js', 'assets/theme-12345678.css'])
        self.assertNotIn(info['entry'], info['preloads'])

    def test_missing_dependency_or_html_asset_fails(self):
        for name in ['assets/shared-12345678.js', 'assets/index-aaaaaaaa.js']:
            with self.subTest(name=name):
                root = self.root / name.replace('/', '-'); artifact(root); (root / name).unlink()
                with self.assertRaises(pub.PublicationError): pub.inspect_artifact(root, ['application'])

    def test_symlink_artifact_fails(self):
        root = self.root / 'build'; artifact(root); (root / 'link').symlink_to('index.html')
        with self.assertRaises(pub.PublicationError): pub.inspect_artifact(root, ['application'])

    def test_wrong_module_layout_fails_closed(self):
        root = self.root / 'build'; artifact(root)
        (root / 'index.html').write_text('<script type="module" src="/assets/index-aaaaaaaa.js"></script>')
        with self.assertRaisesRegex(pub.PublicationError, 'layout'): pub.inspect_artifact(root, ['application'])

    def test_nginx_quote_and_chunk_boundaries(self):
        self.assertEqual(pub.quote_nginx("a'b\\c"), "'a\\'b\\\\c'")
        with self.assertRaises(pub.PublicationError): pub.quote_nginx('a\nb')
        info = {'entry': 'assets/index-aaaaaaaa.js', 'preloads': ['assets/chunk-' + str(i) + '.js' for i in range(90)]}
        prefix = '# preserve exact prefix\n'
        origin, cdn = pub.render_preloads(self.new, info, prefix)
        self.assertTrue(cdn.startswith(prefix.encode()))
        self.assertIn(b'${mc_preload_1}', cdn)
        self.assertIn(b'${mc_static_assets}chunk-89.js', cdn)
        self.assertIn(b'href="/assets/chunk-89.js"', origin)

    def test_plan_pins_inputs_receipts_and_artifacts(self):
        self.fixture_plan(); self.p.load_plan()
        (self.receipt / 'next-0.conf').write_text('tampered')
        with self.assertRaisesRegex(pub.PublicationError, 'receipt changed'): self.p.load_plan()

    def test_frozen_artifact_drift_fails(self):
        self.fixture_plan(); (self.receipt / 'to/assets/shared-12345678.js').write_text('tampered')
        with self.assertRaisesRegex(pub.PublicationError, 'Frozen artifact changed'): self.p.load_plan()

    def test_config_and_routing_drift_fail(self):
        self.fixture_plan()
        routing = Path(next(iter(self.config['protectedFiles']))); routing.write_text('# changed')
        with self.assertRaisesRegex(pub.PublicationError, 'routing changed'): self.p.load_plan()
        routing.write_text('# routing\n'); self.config['workers'] = 2; pub.save_json(self.config_path, self.config)
        with self.assertRaisesRegex(pub.PublicationError, 'configuration changed'): self.p.load_plan()
        with self.assertRaisesRegex(pub.PublicationError, 'inputs differ'): self.publisher().load_plan()

    def test_partial_write_restores_and_rollback_is_idempotent(self):
        plan = self.fixture_plan(); real_write = pub.atomic_write
        def interrupt(path, body, mode=0o600):
            if Path(path) == self.active[1]: raise OSError('simulated second write failure')
            real_write(path, body, mode)
        with patch.object(pub, 'atomic_write', side_effect=interrupt), self.assertRaises(OSError):
            self.p.install(plan, 'next')
        self.assertEqual(self.active[0].read_bytes(), b'# next\n')
        with patch.object(self.p, 'run', return_value=b'') as run:
            self.p.install(plan, 'before'); self.p.install(plan, 'before')
            self.assertEqual(run.call_count, 4)
        self.assertEqual(self.active[0].read_bytes(), (self.receipt / 'before-0.conf').read_bytes())

    def test_nginx_failure_preserves_recovery_then_restores(self):
        plan = self.fixture_plan()
        with patch.object(self.p, 'run', side_effect=pub.PublicationError('nginx test failed')), self.assertRaises(pub.PublicationError):
            self.p.install(plan, 'next')
        with patch.object(self.p, 'run', return_value=b''): self.p.install(plan, 'before')
        self.assertEqual(self.active[1].read_bytes(), (self.receipt / 'before-1.conf').read_bytes())

    def test_operator_edits_are_never_overwritten(self):
        plan = self.fixture_plan(); self.active[1].write_text('# operator edit')
        with self.assertRaisesRegex(pub.PublicationError, 'drift'): self.p.install(plan, 'before')
        self.assertEqual(self.active[1].read_text(), '# operator edit')

    def test_extract_rejects_tar_traversal_links_and_duplicate_files(self):
        for kind in ['traversal', 'symlink', 'hardlink', 'duplicate']:
            with self.subTest(kind=kind), tempfile.TemporaryDirectory(dir=self.root) as temp:
                self.p.receipt = Path(temp)
                archive = io.BytesIO()
                with tarfile.open(fileobj=archive, mode='w') as tf:
                    entry = tarfile.TarInfo('../escape' if kind == 'traversal' else 'index.html')
                    if kind in ('symlink', 'hardlink'):
                        entry.type = tarfile.SYMTYPE if kind == 'symlink' else tarfile.LNKTYPE; entry.linkname = '../escape'
                        tf.addfile(entry)
                    else:
                        entry.size = 1; tf.addfile(entry, io.BytesIO(b'x'))
                        if kind == 'duplicate': tf.addfile(entry, io.BytesIO(b'x'))
                def run(args, output=None, **kwargs):
                    if 'cp' in args: output.write(archive.getvalue()); return None
                    return b'fixture-container'
                space = type('Space', (), {'f_bavail': 100 * 1024**3, 'f_frsize': 1})()
                with patch.object(self.p, 'run', side_effect=run) as command, patch.object(pub.os, 'statvfs', return_value=space):
                    with self.assertRaises((pub.PublicationError, FileExistsError)): self.p.extract('sha256:' + '1' * 64)
                    self.assertEqual(command.call_args.args[0][-2:], ['rm', 'fixture-container'])
                self.assertFalse((self.root / 'escape').exists())

    def test_incomplete_extraction_is_not_reused(self):
        target = self.receipt / ('image-' + '1' * 64); target.mkdir()
        with self.assertRaisesRegex(pub.PublicationError, 'Interrupted'): self.p.extract('sha256:' + '1' * 64)

    def test_insufficient_disk_does_not_create_container(self):
        space = type('Space', (), {'f_bavail': 10, 'f_frsize': 1})()
        with patch.object(self.p, 'run') as command, patch.object(pub.os, 'statvfs', return_value=space):
            with self.assertRaisesRegex(pub.PublicationError, 'disk'): self.p.extract('sha256:' + '1' * 64)
            command.assert_not_called()

    def test_asset_bytes_cache_mime_and_trusted_rewrite(self):
        plan = self.fixture_plan(); info = plan['artifacts']['to']; name = 'assets/application-bbbbbbbb.css'
        original = (self.receipt / info['directory'] / name).read_bytes()
        rewritten = original.replace(b'url(/brand/', b'url(http://127.0.0.1:12345/cdn/brand/')
        good = {'cache-control': 'public, max-age=31536000, immutable', 'content-type': 'text/css'}
        for body, headers, error in [(rewritten, good, None), (original, good, 'bytes'), (rewritten, {**good, 'cache-control': 'no-store'}, 'cache'), (rewritten, {**good, 'content-type': 'text/html'}, 'MIME')]:
            with self.subTest(error=error), patch.object(self.p, 'fetch', side_effect=[(original, good), (body, headers)]):
                if error:
                    with self.assertRaisesRegex(pub.PublicationError, error): self.p.verify_assets(info, [name])
                else: self.assertEqual(len(self.p.verify_assets(info, [name])), 1)

    def test_font_bytes_must_match_both_origin_and_cdn(self):
        plan = self.fixture_plan(); info = plan['artifacts']['to']
        with patch.object(self.p, 'fetch', return_value=(b'fixture-font', {'cache-control': 'max-age=300'})):
            self.assertEqual(len(self.p.verify_fonts(info, info['preloads'])), 1)
        with patch.object(self.p, 'fetch', return_value=(b'corrupt', {'cache-control': 'max-age=300'})):
            with self.assertRaisesRegex(pub.PublicationError, 'font bytes'): self.p.verify_fonts(info, info['preloads'])

    def test_fallback_assets_require_javascript_mime_and_positive_cache_lifetime(self):
        for headers in [{'cache-control': 'immutable, max-age=1', 'content-type': 'text/html'},
                        {'cache-control': 'immutable, max-age=0', 'content-type': 'text/javascript'}]:
            with self.subTest(headers=headers), self.assertRaises(pub.PublicationError):
                pub.verify_asset_headers('assets/example.js', headers, 'Origin')

    def test_html_cdn_fallback_cache_and_ssi(self):
        plan = self.fixture_plan(); info = plan['artifacts']['to']
        def fetch(url, fallback=False):
            base = '/assets/' if fallback else self.config['cdnAssetsURL']
            return ('<head>marker</head><script type="module" src="' + base + info['entry'][7:] + '"></script>' + ''.join('<link href="' + base + n[7:] + '">' for n in info['preloads'])).encode(), {'cache-control': 'no-cache'}
        with patch.object(self.p, 'fetch', side_effect=fetch): self.assertEqual(len(self.p.verify_html(info, True)), 4)
        for text, headers in [(b'[an error occurred while processing this directive]', {'cache-control': 'no-cache'}), (b'<script type="module" src="wrong"></script>', {'cache-control': 'no-cache'})]:
            with patch.object(self.p, 'fetch', return_value=(text, headers)), self.assertRaises(pub.PublicationError): self.p.verify_html(info, True)

    def test_image_commit_and_live_container_health_are_required(self):
        image = 'sha256:' + '1' * 64
        def run(args, **kwargs):
            if 'image' in args: return json.dumps([{'Id': image, 'Config': {'Labels': {'org.opencontainers.image.revision': 'b' * 40}}}]).encode()
            return b''
        with patch.object(self.p, 'run', side_effect=run), self.assertRaisesRegex(pub.PublicationError, 'commit mismatch'): self.p.image(self.old)
        with patch.object(self.p, 'run', return_value=b''), self.assertRaisesRegex(pub.PublicationError, 'one running'): self.p.running_web(self.old)

    def test_collision_blocks_preflight_before_active_writes(self):
        oldroot = self.receipt / 'oldroot'; newroot = self.receipt / 'newroot'
        artifact(oldroot); artifact(newroot, 'bbbbbbbb'); (newroot / 'assets/shared-12345678.js').write_text('different')
        before = [p.read_bytes() for p in self.active]
        with patch.object(self.p, 'run', return_value=str(self.active[1]).encode()), patch.object(self.p, 'running_web'), patch.object(self.p, 'image', return_value='image'), patch.object(self.p, 'extract', side_effect=[oldroot, newroot]):
            with self.assertRaisesRegex(pub.PublicationError, 'Immutable asset'): self.p.preflight()
        self.assertEqual([p.read_bytes() for p in self.active], before)
        self.assertFalse((self.receipt / 'plan.json').exists())


if __name__ == '__main__':
    unittest.main()
