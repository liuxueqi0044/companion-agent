"""Read-only verification of copied-source integrity, schema and product syntax."""
import ast
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from services.product.schema import schema_bytes


def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    snapshot = json.loads((ROOT/'docs/development/source-snapshot.json').read_text(encoding='utf-8'))
    original = Path(snapshot['source_root'])
    original_drift, unexpected_copied_changes = [], []
    for item in snapshot['files']:
        relative = item['path']
        if sha(original/relative) != item['sha256']:
            original_drift.append(relative)
        if sha(ROOT/relative) != item['sha256'] and relative != '.gitignore':
            unexpected_copied_changes.append(relative)
    syntax = list((ROOT/'services/product').glob('*.py')) + list((ROOT/'tests/product').glob('*.py'))
    syntax += list((ROOT/'tools').glob('*product*.py'))
    for file in syntax:
        ast.parse(file.read_text(encoding='utf-8'),filename=str(file))
    schema_ok = (ROOT/'packages/contracts/product-core/schema.json').read_bytes() == schema_bytes()
    result = {'original_source_snapshot_files':len(snapshot['files']), 'original_source_drift':original_drift,
              'unexpected_copied_source_changes':unexpected_copied_changes, 'python_syntax_files':len(syntax),
              'schema_matches_source':schema_ok,
              'result':'PASS' if not original_drift and not unexpected_copied_changes and schema_ok else 'FAIL'}
    print(json.dumps(result,ensure_ascii=False,indent=2))
    return 0 if result['result']=='PASS' else 1


if __name__ == '__main__': raise SystemExit(main())
