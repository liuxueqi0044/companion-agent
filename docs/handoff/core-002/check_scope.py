"""Read-only CORE-002 scope comparison. Never refreshes or repairs the baseline."""
from __future__ import annotations

import fnmatch
import hashlib
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent


def sha(data):
    return hashlib.sha256(data).hexdigest()


def inventory(root, scope):
    files, unsafe = {}, []
    ignored = set(scope['ignored_directory_names'])
    excluded = set(scope['baseline_self_exclusions'])

    def visit(directory):
        for item in sorted(directory.iterdir(), key=lambda p: p.name):
            relative = item.relative_to(root).as_posix()
            # Inspect links before filtering or descending. Never hash through a junction.
            if item.is_symlink() or item.is_junction():
                unsafe.append(relative)
                continue
            if item.is_dir():
                if item.name not in ignored:
                    visit(item)
            elif relative not in excluded:
                raw = item.read_bytes()
                files[relative] = {'sha256': sha(raw), 'bytes': len(raw)}

    visit(root)
    return files, unsafe


def allowed(path, kind, scope):
    if kind == 'missing':
        return False
    if path in scope['writable_existing_and_new_files']:
        return True
    if any(path.startswith(p) for p in scope['writable_existing_and_new_prefixes']):
        return True
    if kind != 'added':
        return False
    if any(path.startswith(p) for p in scope['new_only_prefixes']):
        return True
    parts = path.split('/')
    return len(parts) >= 3 and parts[0] == scope['runtime_parent'] and any(
        fnmatch.fnmatchcase(parts[1], pattern)
        for pattern in scope['new_runtime_directory_patterns'])


def main():
    try:
        scope = json.loads((HERE/'scope.json').read_text(encoding='utf-8'))
        if os.path.normcase(str(ROOT)) != os.path.normcase(str(Path(scope['workspace']))):
            raise ValueError('wrong_workspace')
        baseline_path = HERE/'baseline.json'
        checksum_path = HERE/'baseline.sha256'
        for file in (baseline_path, checksum_path):
            if file.is_symlink() or file.is_junction():
                raise ValueError('unsafe_baseline')
        raw = baseline_path.read_bytes()
        if sha(raw) != checksum_path.read_text(encoding='ascii').strip():
            raise ValueError('baseline_hash_mismatch')
        baseline = json.loads(raw)
        if baseline['batch'] != 'CORE-002':
            raise ValueError('wrong_baseline')
        expected = baseline['files']
        current, unsafe = inventory(ROOT, scope)
        modified = sorted(p for p in expected.keys() & current.keys() if expected[p] != current[p])
        added = sorted(current.keys() - expected.keys())
        missing = sorted(expected.keys() - current.keys())
        outside = [{'kind': kind, 'path': path}
                   for kind, paths in [('modified', modified), ('added', added), ('missing', missing)]
                   for path in paths if not allowed(path, kind, scope)]
        outside += [{'kind': 'unsafe_path', 'path': path} for path in unsafe]
        report = {
            'batch': 'CORE-002', 'baseline_sha256': sha(raw), 'baseline_files': len(expected),
            'result': 'FAIL' if outside else 'PASS',
            'counts': {'modified': len(modified), 'added': len(added), 'missing': len(missing)},
            'modified': modified, 'added': added, 'missing': missing, 'outside': outside,
        }
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 1 if outside else 0
    except Exception as error:
        # No partial PASS if a file cannot be read or the baseline is not verifiable.
        print(json.dumps({'batch': 'CORE-002', 'result': 'FAIL',
                          'error': type(error).__name__, 'detail': str(error)}, ensure_ascii=False))
        return 2


if __name__ == '__main__':
    sys.exit(main())
