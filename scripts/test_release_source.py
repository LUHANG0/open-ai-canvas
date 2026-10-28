import importlib.util
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('release_source', Path(__file__).with_name('release-source.py'))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseSourceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.repo = self.root / 'repo'; self.repo.mkdir()
        self.git('init', '-q')
        self.git('config', 'user.email', 'fixture@example.invalid')
        self.git('config', 'user.name', 'Fixture')
        (self.repo / 'file.txt').write_text('original\n')
        (self.repo / 'run.sh').write_text('#!/bin/sh\n'); (self.repo / 'run.sh').chmod(0o755)
        (self.repo / 'link').symlink_to('file.txt')
        self.git('add', '.'); self.git('commit', '-qm', 'fixture')

    def tearDown(self):
        self.temp.cleanup()

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.repo)

    def candidate(self):
        output = self.root / 'export'
        release.export(self.repo, output)
        source = self.root / 'source'; source.mkdir()
        with tarfile.open(output / 'source.tar') as tf:
            tf.extractall(source)  # Archive contains only this test's fixed Git fixture.
        return source, output / 'source-manifest.json'

    def test_exact_snapshot_and_drift(self):
        source, manifest = self.candidate()
        self.assertTrue(release.verify(source, manifest)['passed'])
        (source / 'file.txt').write_text('edited')
        (source / 'run.sh').unlink()
        (source / 'extra').write_text('untracked overlay')
        result = release.verify(source, manifest)
        self.assertFalse(result['passed'])
        self.assertEqual(result['changed'], ['file.txt'])
        self.assertEqual(result['missing'], ['run.sh'])
        self.assertEqual(result['extra'], ['extra'])

    def test_mode_and_link_drift(self):
        source, manifest = self.candidate()
        (source / 'run.sh').chmod(0o644)
        (source / 'link').unlink(); (source / 'link').symlink_to('run.sh')
        self.assertEqual(release.verify(source, manifest)['changed'], ['link', 'run.sh'])

    def test_dirty_tree_rejected(self):
        (self.repo / 'untracked').write_text('pending')
        with self.assertRaisesRegex(ValueError, 'clean'):
            release.export(self.repo, self.root / 'export')

    def test_export_ignore_rejected(self):
        (self.repo / '.gitattributes').write_text('file.txt export-ignore\n')
        self.git('add', '.'); self.git('commit', '-qm', 'attributes')
        with self.assertRaisesRegex(ValueError, 'excludes'):
            release.export(self.repo, self.root / 'export')

    def test_missing_root_fails(self):
        source, manifest = self.candidate()
        self.assertFalse(release.verify(self.root / 'absent', manifest)['passed'])


if __name__ == '__main__':
    unittest.main()
