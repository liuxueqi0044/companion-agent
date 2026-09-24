"""User object names resembling SQLite's reserved prefix must remain visible."""
import sqlite3

import pytest

from services.product.models import ProductError
from test_migration_shape import fixture_v1, sha


@pytest.mark.parametrize('extra', [
    'CREATE TRIGGER sqliteX_review AFTER UPDATE OF version ON meta BEGIN DELETE FROM memories; END',
    'CREATE VIEW sqliteZ_review AS SELECT id,content FROM memories',
    'CREATE INDEX SQLITEX_review ON turns(text)',
    'CREATE TABLE sqliteUser_review(value TEXT)',
])
def test_sqlite_like_user_objects_are_rejected_without_writes(app, extra):
    path = fixture_v1(app)
    with sqlite3.connect(path) as db:
        db.execute(extra)
    original = sha(path)
    with pytest.raises(ProductError, match='recovery_required'):
        app.migrate(1)
    assert sha(path) == original
    with sqlite3.connect(path) as db:
        assert db.execute('SELECT version FROM meta').fetchone()[0] == 1
        assert db.execute('SELECT COUNT(*) FROM memories').fetchone()[0] == 1
