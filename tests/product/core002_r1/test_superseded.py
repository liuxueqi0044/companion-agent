import json
from datetime import timedelta
from uuid import uuid4

import pytest

from conftest import CSV, policy, turn
from services.product.entry import handle
from services.product.kernel import ProductKernel
from services.product.models import ProductError


def test_stale_then_retry_old_turn_never_recovers_permission(app, clock):
    policy(app, proactive_enabled=True)
    old = turn(app, text='旧材料', csv_text=CSV)
    context = app.begin(old['id'])
    turn(app, conversation=old['conversation_id'], text='更新的需求', csv_text=None,
         capabilities=(), temporary=True)
    late = {'reply': '旧决定', 'actions': [{'kind': 'csv.audit'}],
            'memories': [{'category': 'work', 'content': '不应保存'}],
            'followup': {'topic': 'work', 'purpose': '旧材料后续',
                         'due_at': (clock()+timedelta(minutes=2)).isoformat(),
                         'expires_at': (clock()+timedelta(hours=1)).isoformat()}}
    assert app.accept(old['id'], context['ticket'], late)['error'] == 'context_changed'
    with pytest.raises(ProductError, match='superseded_turn'):
        app.begin(old['id'])
    assert app.execute(old['id'])['actions'] == []
    assert app.workbench.list({}).items == []
    assert app.memory.list() == []
    assert app.contact.inspect_plans() == []


def test_superseded_before_first_begin_and_after_reopen_stdio(app, clock):
    old = turn(app, csv_text=None, capabilities=())
    turn(app, conversation=old['conversation_id'], csv_text=None, capabilities=())
    with pytest.raises(ProductError, match='superseded_turn'):
        app.begin(old['id'])
    reopened = ProductKernel(app.root, clock=clock)
    reopened.recover()
    raw = json.dumps({'version': 'product-core/1', 'request_id': str(uuid4()),
                      'action': 'turn.begin', 'payload': {'turn_id': old['id']}}).encode()
    result = json.loads(handle(raw, reopened))
    assert result['ok'] is False and result['error'] == {'code': 'superseded_turn'}
    with reopened.store.tx() as db:
        row = db.execute('SELECT state,ticket FROM turns WHERE id=?', (old['id'],)).fetchone()
        assert row['state'] == 'queued' and row['ticket'] is None


def test_latest_turn_retry_and_other_conversation_remain_legal(app, clock):
    latest = turn(app, csv_text=None, capabilities=())
    first = app.begin(latest['id'])
    with app.store.tx(True) as db:
        db.execute("UPDATE turns SET state='model_failed',ticket=NULL,error='model_not_configured' WHERE id=?",
                   (latest['id'],))
    turn(app, csv_text=None, capabilities=())  # Different conversation.
    clock.advance(hours=2)
    retry = app.begin(latest['id'])
    assert retry['ticket'] != first['ticket']
    assert app.accept(latest['id'], retry['ticket'], {'reply': '有效的新尝试'})['state'] == 'responded'
