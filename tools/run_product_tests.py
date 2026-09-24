"""Reuse installed dependencies without loading the original editable project."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import services
assert Path(services.__file__).resolve().parent == ROOT / 'services'
import pytest
raise SystemExit(pytest.main(['-q', '-p', 'no:cacheprovider', str(ROOT / 'tests/product'), *sys.argv[1:]]))
