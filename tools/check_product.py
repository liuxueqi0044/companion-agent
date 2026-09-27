"""Current product validation, independent of the historical donor snapshot."""
import ast
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from services.product.schema import schema_bytes

files = list((ROOT / 'services').rglob('*.py')) + list((ROOT / 'tools').glob('*.py'))
for file in files:
    ast.parse(file.read_text(encoding='utf-8-sig'), filename=str(file))
matches = (ROOT / 'packages/contracts/product-core/schema.json').read_bytes() == schema_bytes()
print(json.dumps({'python_syntax_files': len(files), 'schema_matches_source': matches}))
raise SystemExit(0 if matches else 1)
