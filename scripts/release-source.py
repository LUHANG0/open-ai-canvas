#!/usr/bin/env python3
"""Export an exact Git HEAD snapshot, or verify an extracted release against it.

The manifest must be produced locally from Git, never regenerated from the
candidate being checked. Keep deployment overlays outside the source directory.
"""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile


def digest(data):
    return hashlib.sha256(data).hexdigest()


def export(repo, output):
    repo, output = Path(repo).resolve(), Path(output).resolve()
    status = subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=all'], cwd=repo)
    if status.strip():
        raise ValueError('Working tree must be clean, including untracked files')
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip()
    archive = subprocess.check_output(['git', 'archive', '--format=tar', commit], cwd=repo)
    entries = []
    with tarfile.open(fileobj=io.BytesIO(archive)) as tf:
        for member in tf:
            if member.isdir():
                continue
            if not (member.isfile() or member.issym()):
                raise ValueError('Unsupported Git entry: ' + member.name)
            data = member.linkname.encode() if member.issym() else tf.extractfile(member).read()
            entries.append({'path': member.name, 'kind': 'symlink' if member.issym() else 'file',
                            'sha256': digest(data), 'executable': bool(member.mode & 0o111) if member.isfile() else False})
    # export-ignore/export-subst must never silently change the release input.
    tracked = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', '-z', commit], cwd=repo).decode().split('\0')
    if set(filter(None, tracked)) != {e['path'] for e in entries}:
        raise ValueError('Archive excludes tracked entries; resolve export-ignore/submodules first')
    proc = subprocess.Popen(['git', 'cat-file', '--batch'], cwd=repo, stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    try:
        for e in entries:
            proc.stdin.write((commit + ':' + e['path'] + '\n').encode()); proc.stdin.flush()
            header = proc.stdout.readline().split()
            if len(header) != 3 or header[1] != b'blob':
                raise ValueError('Not a Git blob: ' + e['path'])
            data = proc.stdout.read(int(header[2])); proc.stdout.read(1)
            if digest(data) != e['sha256']:
                raise ValueError('Archive transforms tracked content: ' + e['path'])
    finally:
        proc.stdin.close(); proc.stdout.close(); proc.wait()
    output.mkdir(parents=True, exist_ok=False)
    (output / 'source.tar').write_bytes(archive)
    manifest = {'format': 1, 'commit': commit, 'archiveSha256': digest(archive), 'files': entries}
    (output / 'source-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return {'commit': commit, 'files': len(entries), 'archiveSha256': manifest['archiveSha256']}


def verify(source, manifest_path):
    source = Path(source).resolve()
    manifest = json.loads(Path(manifest_path).read_text())
    if manifest.get('format') != 1:
        raise ValueError('Unsupported manifest format')
    expected = {r['path']: r for r in manifest['files']}
    if len(expected) != len(manifest['files']):
        raise ValueError('Duplicate paths in manifest')
    for name in expected:
        path = Path(name)
        if path.is_absolute() or '..' in path.parts or name != path.as_posix():
            raise ValueError('Unsafe manifest path: ' + name)
    actual = {}
    for parent, dirs, files in os.walk(source, followlinks=False):
        for name in list(dirs):
            f = Path(parent) / name
            if f.is_symlink():
                actual[f.relative_to(source).as_posix()] = f; dirs.remove(name)
        for name in files:
            f = Path(parent) / name; actual[f.relative_to(source).as_posix()] = f
    missing, extra = sorted(expected.keys() - actual.keys()), sorted(actual.keys() - expected.keys())
    changed = []
    for name in expected.keys() & actual.keys():
        f, row = actual[name], expected[name]
        kind = 'symlink' if f.is_symlink() else 'file'
        data = os.readlink(f).encode() if f.is_symlink() else f.read_bytes()
        executable = bool(f.stat().st_mode & 0o111) if kind == 'file' else False
        if kind != row['kind'] or digest(data) != row['sha256'] or executable != row['executable']:
            changed.append(name)
    return {'commit': manifest['commit'], 'passed': not (missing or extra or changed),
            'files': len(expected), 'missing': missing, 'extra': extra, 'changed': sorted(changed)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    ex = commands.add_parser('export'); ex.add_argument('--repo', default='.'); ex.add_argument('--output', required=True)
    check = commands.add_parser('verify'); check.add_argument('--source', required=True); check.add_argument('--manifest', required=True)
    args = parser.parse_args()
    try:
        result = export(args.repo, args.output) if args.command == 'export' else verify(args.source, args.manifest)
        print(json.dumps(result, ensure_ascii=False))
        raise SystemExit(0 if result.get('passed', True) else 1)
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(1, str(error) + '\n')
