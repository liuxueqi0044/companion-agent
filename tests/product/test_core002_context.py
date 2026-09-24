"""CORE-002 context regression, using only fresh local test roots."""
from datetime import timedelta
from uuid import uuid4
from pathlib import Path
import sqlite3

import pytest

from conftest import policy, turn
from services.product.kernel import ProductKernel
from services.product.entry import dispatch
from services.product.models import Policy, ProductError


def test_existing_second_turn_reply_and_memory_invalidate_claimed_followup(app, clock):
    policy(app, proactive_enabled=True)
    first = turn(app, text='今天有点难受', csv_text=None, capabilities=())
    c = app.begin(first['id'])
    app.accept(first['id'], c['ticket'], {'reply': '我在听。', 'followup': {
        'topic': 'wellbeing', 'purpose': '稍后关心',
        'due_at': (clock() + timedelta(minutes=1)).isoformat(),
        'expires_at': (clock() + timedelta(hours=2)).isoformat()}})
    second = turn(app, conversation=first['conversation_id'], text='又想到一件事',
                  csv_text=None, capabilities=())
    c2 = app.begin(second['id'])
    clock.advance(minutes=2)
    job = app.contact.claim_due()
    app.accept(second['id'], c2['ticket'], {'reply': '已经解决了。', 'memories': [
        {'category': 'preferences', 'content': '喜欢简短答复'}]})
    assert app.contact.complete(job['id'], job['ticket'], {
        'disposition': 'send', 'text': '迟到的旧消息', 'reason': 'still_relevant'}) == {
            'state': 'pending', 'reason': 'context_changed'}
    assert app.contact.inbox() == []


def test_history_filter_before_limit_and_no_future_turn(app):
    conversation = str(uuid4())
    ids = []
    for index in range(24):
        item = turn(app, conversation=conversation, text=f'input-{index}', csv_text=None,
                    capabilities=(), temporary=index % 5 == 0)
        ids.append(item['id'])
    with app.store.tx(True) as db:
        db.execute('INSERT INTO excluded_sources VALUES(?)', (ids[1],))
    context = app.begin(ids[23])
    expected = [f'input-{i}' for i in range(23) if i % 5 != 0 and i != 1][-12:]
    assert [row['text'] for row in context['history']] == expected
    with pytest.raises(ProductError, match='superseded_turn'):
        app.begin(ids[22])


def test_ordinary_generation_stale_and_unrelated_changes_do_not_reject(app, clock):
    first = turn(app, text='第一条', csv_text=None, capabilities=())
    old = app.begin(first['id'])
    clock.advance(hours=1)
    app.contact.inbox()
    turn(app, text='别的会话', csv_text=None, capabilities=())
    assert app.accept(first['id'], old['ticket'], {'reply': '有效'})['state'] == 'responded'
    same = turn(app, conversation=first['conversation_id'], csv_text=None, capabilities=())
    stale = app.begin(same['id'])
    turn(app, conversation=first['conversation_id'], csv_text=None, capabilities=())
    answer = app.accept(same['id'], stale['ticket'], {'reply': '旧', 'memories': [
        {'category': 'work', 'content': '不应落库'}]})
    assert answer['error'] == 'context_changed' and app.memory.list() == []


def test_memory_change_invalidates_ordinary_generation(app):
    item = turn(app, csv_text=None, capabilities=())
    context = app.begin(item['id'])
    app.memory.add('喜欢简洁回答')
    assert app.accept(item['id'], context['ticket'], {'reply': '旧'})['error'] == 'context_changed'


def _replace_with_frozen_v1(app):
    schema = (Path(__file__).resolve().parents[2] / 'docs/handoff/core-002/v1-schema.sql').read_text(encoding='utf-8')
    profile_id = app.workbench.profile.read().profile_id
    app.store.path.unlink()
    with sqlite3.connect(app.store.path) as db:
        db.executescript(schema)
        db.execute('INSERT INTO meta VALUES(1,1,?,?)', (profile_id, Policy().model_dump_json()))
        db.execute('INSERT INTO experience_head VALUES(1,0)')
        db.commit()


def test_explicit_v1_migration_and_replay(app):
    _replace_with_frozen_v1(app)
    with sqlite3.connect(app.store.path) as db:
        item = str(uuid4())
        conversation = str(uuid4())
        action = str(uuid4())
        memory = str(uuid4())
        plan = str(uuid4())
        message = str(uuid4())
        db.execute("""INSERT INTO turns(id,request_hash,conversation_id,text,temporary,grants_json,
            profile_revision,policy_revision,state,ticket,created_at) VALUES(?,?,?, ?,0,'[]',1,1,'generating',?,?)""",
            (item, 'original-hash', conversation, '保留正文', str(uuid4()), '2026-09-24T10:00:00+00:00'))
        db.execute('INSERT INTO reminders VALUES(?,?,?,?,?)',
                   (str(uuid4()), 'original-reminder-hash', '喝水', '2026-09-24T11:00:00+00:00', 'pending'))
        db.execute("INSERT INTO actions(id,turn_id,ordinal,kind,payload_json,state) VALUES(?,?,0,'csv.audit','{}','ready')",
                   (action, item))
        db.execute("INSERT INTO memories(id,source_id,category,content,revision) VALUES(?,?,'preferences','简短回答',1)",
                   (memory, item))
        db.execute("""INSERT INTO followups(id,source_id,topic,purpose,due_at,expires_at,state,ticket,
            policy_revision,attempts) VALUES(?,?,'wellbeing','关心',?,?,'evaluating',?,1,1)""",
            (plan, item, '2026-09-24T11:00:00+00:00', '2026-09-24T12:00:00+00:00', str(uuid4())))
        db.execute("INSERT INTO inbox(id,dedupe_key,kind,text,created_at) VALUES(?,'old-message','task','旧消息',?)",
                   (message, '2026-09-24T10:00:00+00:00'))
        db.execute("INSERT INTO experiences(revision,package_revision,source_hash,artifact_hash,created_at) VALUES(1,'trusted','source','artifact',?)",
                   ('2026-09-24T10:00:00+00:00',))
        db.execute('UPDATE experience_head SET revision=1')
        db.commit()
    with pytest.raises(ProductError, match='migration_required'):
        app.home()
    assert dispatch(app, 'runtime.migrate', {'expected_version': 1}) == {'state': 'migrated', 'version': 2}
    assert dispatch(app, 'runtime.migrate', {'expected_version': 1}) == {'state': 'already_current', 'version': 2}
    with app.store.tx() as db:
        saved = db.execute('SELECT * FROM turns WHERE id=?', (item,)).fetchone()
        assert saved['text'] == '保留正文' and saved['request_hash'] == 'original-hash'
        assert saved['state'] == 'model_failed' and saved['ticket'] is None
        reminder = db.execute('SELECT * FROM reminders').fetchone()
        assert reminder['revision'] == 1 and reminder['request_hash'] == 'original-reminder-hash'
        assert db.execute('SELECT state FROM actions WHERE id=?', (action,)).fetchone()[0] == 'ready'
        assert db.execute('SELECT content FROM memories WHERE id=?', (memory,)).fetchone()[0] == '简短回答'
        old_plan = db.execute('SELECT state,ticket FROM followups WHERE id=?', (plan,)).fetchone()
        assert old_plan['state'] == 'needs_retry' and old_plan['ticket'] is None
        assert db.execute('SELECT text FROM inbox WHERE id=?', (message,)).fetchone()[0] == '旧消息'
        assert db.execute('SELECT revision FROM experience_head').fetchone()[0] == 1
    assert ProductKernel(app.root).home()['profile']['profile_id'] == app.workbench.profile.read().profile_id


def test_v1_migration_rolls_back_and_rejects_malformed(app):
    _replace_with_frozen_v1(app)
    def fail(index):
        if index == 1:
            raise RuntimeError('injected_migration_interruption')
    with pytest.raises(RuntimeError):
        app.store.migrate(app.workbench.profile.read().profile_id, 1, _fault=fail)
    with sqlite3.connect(app.store.path) as db:
        assert db.execute('SELECT version FROM meta').fetchone()[0] == 1
        assert 'context_signature' not in [row[1] for row in db.execute('PRAGMA table_info(turns)')]
        db.execute('ALTER TABLE turns ADD COLUMN unexpected TEXT')
        db.commit()
    with pytest.raises(ProductError, match='recovery_required'):
        app.migrate(1)
    with sqlite3.connect(app.store.path) as db:
        assert db.execute('SELECT version FROM meta').fetchone()[0] == 1


def test_unknown_version_and_broken_v1_rejected_without_upgrade(app):
    _replace_with_frozen_v1(app)
    with sqlite3.connect(app.store.path) as db:
        db.execute('UPDATE meta SET version=3')
        db.commit()
    with pytest.raises(ProductError, match='recovery_required'):
        app.migrate(1)
    with sqlite3.connect(app.store.path) as db:
        assert db.execute('SELECT version FROM meta').fetchone()[0] == 3
        db.execute('UPDATE meta SET version=1')
        db.execute('DROP TABLE experiences')
        db.commit()
    with pytest.raises(ProductError, match='recovery_required'):
        app.migrate(1)
    with sqlite3.connect(app.store.path) as db:
        assert db.execute('SELECT version FROM meta').fetchone()[0] == 1
        assert 'context_signature' not in [row[1] for row in db.execute('PRAGMA table_info(turns)')]
