"""Standalone development entry. The root is fixed, never selected by request JSON."""
from pathlib import Path
import sys

WORKSPACE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKSPACE))
import services
if Path(services.__file__).resolve().parent != WORKSPACE / 'services':
    raise RuntimeError('wrong_import_root')

from services.product.entry import handle
from services.product.kernel import ProductKernel

if __name__ == '__main__':
    app = ProductKernel(WORKSPACE / '.product-data')
    sys.stdout.buffer.write(handle(sys.stdin.buffer.read(384 * 1024 + 1), app))
