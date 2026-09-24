"""Read-only CORE-006 check; reuse the frozen CORE-002 inventory helpers."""
import importlib.util
import json
import os
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
spec = importlib.util.spec_from_file_location('frozen_core002_scope', HERE.parent / 'core-002/check_scope.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


def main():
    try:
        scope = json.loads((HERE / 'scope.json').read_text(encoding='utf-8'))
        if os.path.normcase(str(ROOT)) != os.path.normcase(str(Path(scope['workspace']))):
            raise ValueError('wrong_workspace')
        for item in (HERE / 'baseline.json', HERE / 'baseline.sha256'):
            if item.is_symlink() or item.is_junction():
                raise ValueError('unsafe_baseline')
        raw = (HERE / 'baseline.json').read_bytes()
        if helper.sha(raw) != (HERE / 'baseline.sha256').read_text(encoding='ascii').strip():
            raise ValueError('baseline_hash_mismatch')
        baseline = json.loads(raw)
        if baseline['batch'] != 'CORE-006':
            raise ValueError('wrong_baseline')
        expected = baseline['files']
        current, unsafe = helper.inventory(ROOT, scope)
        modified = sorted(p for p in expected.keys() & current.keys() if expected[p] != current[p])
        added = sorted(current.keys() - expected.keys())
        missing = sorted(expected.keys() - current.keys())
        outside = [{'kind': kind, 'path': p}
                   for kind, paths in [('modified', modified), ('added', added), ('missing', missing)]
                   for p in paths if not helper.allowed(p, kind, scope)]
        outside += [{'kind': 'unsafe_path', 'path': p} for p in unsafe]
        print(json.dumps({'batch': 'CORE-006', 'result': 'FAIL' if outside else 'PASS',
                          'baseline_sha256': helper.sha(raw), 'baseline_files': len(expected),
                          'counts': {'modified': len(modified), 'added': len(added), 'missing': len(missing)},
                          'modified': modified, 'added': added, 'missing': missing, 'outside': outside},
                         ensure_ascii=False, indent=2))
        return 1 if outside else 0
    except Exception as error:
        print(json.dumps({'batch': 'CORE-006', 'result': 'FAIL', 'error': type(error).__name__,
                          'detail': str(error)}, ensure_ascii=False))
        return 2


if __name__ == '__main__':
    sys.exit(main())
