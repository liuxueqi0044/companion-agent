"""Migration preflight against independent, fresh frozen-v1 fixtures."""
import hashlib
from pathlib import Path
import sqlite3
from uuid import uuid4

import pytest

from services.product.models import Policy, ProductError


FROZEN_V1 = Path(__file__).resolve().parents[3] / 'docs/handoff/core-002/v1-schema.sql'


def fixture_v1(app):
    original_profile = app.workbench.profile.read().profile_id
    app.store.path.unlink()
    with sqlite3.connect(app.store.path) as db:
        db.executescript(FROZEN_V1.read_text(encoding='utf-8'))
        db.execute('INSERT INTO meta VALUES(1,1,?,?)', (original_profile, Policy().model_dump_json()))
        db.execute('INSERT INTO experience_head VALUES(1,0)')
        db.execute("INSERT INTO memories(id,source_id,category,content,revision) VALUES(?,?,'work','保留记忆',1)",
                   (str(uuid4()), 'manual:' + str(uuid4())))
        db.commit()
    return app.store.path


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


@pytest.mark.parametrize('extra', [
    """CREATE TRIGGER destroy_memory AFTER UPDATE OF version ON meta
       BEGIN DELETE FROM memories; END;""",
    "CREATE VIEW unexpected_view AS SELECT id,content FROM memories;",
])
def test_trigger_and_view_are_rejected_before_any_write(app, extra):
    path = fixture_v1(app)
    with sqlite3.connect(path) as db:
        db.execute(extra)
        db.commit()
    before = sha(path)
    with pytest.raises(ProductError, match='recovery_required'):
        app.migrate(1)
    assert sha(path) == before
    with sqlite3.connect(path) as db:
        assert db.execute('SELECT version FROM meta').fetchone()[0] == 1
        assert db.execute('SELECT COUNT(*) FROM memories').fetchone()[0] == 1


@pytest.mark.parametrize('change,code', [
    ('DROP TABLE experiences', 'recovery_required'),
    ('ALTER TABLE turns ADD COLUMN unexpected TEXT', 'recovery_required'),
    ('CREATE INDEX unexpected_turn_index ON turns(text)', 'recovery_required'),
    ('UPDATE meta SET profile_id=\'00000000-0000-4000-8000-000000000000\'', 'identity_mismatch'),
    ('UPDATE meta SET version=3', 'recovery_required'),
])
def test_independent_malformed_v1_rejected_without_rewrite(app, change, code):
    path = fixture_v1(app)
    with sqlite3.connect(path) as db:
        db.execute(change)
        db.commit()
    before = sha(path)
    with pytest.raises(ProductError, match=code):
        app.migrate(1)
    assert sha(path) == before


def test_corrupt_v1_file_is_not_rebuilt(app):
    path = fixture_v1(app)
    path.write_bytes(b'broken-database-fixture')
    before = sha(path)
    with pytest.raises(ProductError, match='recovery_required'):
        app.migrate(1)
    assert sha(path) == before


def test_interrupted_migration_keeps_rows_references_and_all_v2_objects_absent(app):
    path = fixture_v1(app)
    with sqlite3.connect(path) as db:
        turn_id, action_id = str(uuid4()), str(uuid4())
        db.execute("""INSERT INTO turns(id,request_hash,conversation_id,text,temporary,grants_json,
            profile_revision,policy_revision,state,created_at) VALUES(?,?,?,'原输入',0,'[]',1,1,'queued',?)""",
            (turn_id, 'source-hash', str(uuid4()), '2026-09-24T10:00:00+00:00'))
        db.execute("INSERT INTO actions(id,turn_id,ordinal,kind,payload_json,state) VALUES(?,?,0,'csv.audit','{}','ready')",
                   (action_id, turn_id))
        db.commit()
    def interrupted(index):
        if index == 6:
            raise RuntimeError('controlled-interruption')
    with pytest.raises(RuntimeError, match='controlled-interruption'):
        app.store.migrate(app.workbench.profile.read().profile_id, 1, _fault=interrupted)
    with sqlite3.connect(path) as db:
        assert db.execute('SELECT version FROM meta').fetchone()[0] == 1
        assert db.execute('SELECT text FROM turns WHERE id=?', (turn_id,)).fetchone()[0] == '原输入'
        assert db.execute('SELECT turn_id FROM actions WHERE id=?', (action_id,)).fetchone()[0] == turn_id
        assert db.execute('SELECT COUNT(*) FROM memories').fetchone()[0] == 1
        for table in ('reminder_commands','stop_commands','stop_aliases','stop_tasks'):
            assert db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone() is None
        assert 'context_signature' not in [row[1] for row in db.execute('PRAGMA table_info(turns)')]
        assert 'revision' not in [row[1] for row in db.execute('PRAGMA table_info(reminders)')]
    assert app.migrate(1) == {'state':'migrated','version':2}
    assert app.migrate(1) == {'state':'already_current','version':2}
    with app.store.tx() as db:
        assert db.execute('SELECT turn_id FROM actions WHERE id=?', (action_id,)).fetchone()[0] == turn_id
        assert db.execute('SELECT COUNT(*) FROM memories').fetchone()[0] == 1
