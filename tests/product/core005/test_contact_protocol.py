import json
from datetime import timedelta
from uuid import uuid4

import pytest

from conftest import planned, policy, turn
from services.product.entry import handle
from services.product.models import ProductError


def wire(app, action, payload):
    request = {'version': 'product-core/1', 'request_id': str(uuid4()),
               'action': action, 'payload': payload}
    return json.loads(handle(json.dumps(request).encode('utf-8'), app))


def events(app):
    with app.store.tx() as db:
        return db.execute('SELECT COUNT(*) FROM events').fetchone()[0]


def due_plan(app, model, clock):
    item, plan = planned(app, model, clock)
    clock.advance(minutes=30)
    return item, plan, app.contact.claim_due()


def test_stable_send_receipt_is_durable_and_read_is_private(app, model, clock):
    _, plan, job = due_plan(app, model, clock)
    assert job['id'] == plan['id']
    assert wire(app, 'contact.claim', {})['result'] is None  # One evaluating plan.
    receipt = wire(app, 'contact.complete', {'id': job['id'], 'ticket': job['ticket'],
        'decision': model.followup_decision})
    assert receipt['ok']
    result = receipt['result']
    assert result['id'] == job['id'] and result['state'] == 'sent'
    assert result['message_id'] == app.contact.inbox()[0]['id']
    assert result['reason'] == 'still_relevant'
    assert wire(app, 'contact.read', {'id': job['id']})['result'] == result
    assert set(result) == {'id', 'state', 'reason', 'message_id'}
    assert wire(app, 'contact.complete', {'id': job['id'], 'ticket': job['ticket'],
        'decision': model.followup_decision})['error'] == {'code': 'stale_generation'}
    assert len(app.contact.inbox()) == 1


def test_failure_only_closes_matching_ticket_and_rejects_shapes(app, model, clock):
    _, plan, first = due_plan(app, model, clock)
    before = events(app)
    for payload in [
        {'id': first['id'], 'ticket': str(uuid4()), 'reason': 'provider_timeout'},
        {'id': first['id'], 'ticket': first['ticket'], 'reason': 'private error'},
        {'id': first['id'], 'ticket': first['ticket'], 'reason': 'provider_failed', 'extra': 1},
        {'id': 'bad', 'ticket': first['ticket'], 'reason': 'provider_failed'},
    ]:
        expected = 'stale_generation' if payload['ticket'] != first['ticket'] else 'invalid_request'
        assert wire(app, 'contact.fail-generation', payload)['error'] == {'code': expected}
    assert events(app) == before
    failed = wire(app, 'contact.fail-generation', {'id': first['id'],
        'ticket': first['ticket'], 'reason': 'provider_timeout'})
    assert failed['result'] == {'id': plan['id'], 'state': 'needs_retry',
                                 'reason': 'provider_timeout', 'message_id': None}
    app.contact.retry(plan['id'])
    second = app.contact.claim_due()
    assert second['ticket'] != first['ticket']
    assert wire(app, 'contact.fail-generation', {'id': first['id'],
        'ticket': first['ticket'], 'reason': 'provider_aborted'})['error'] == {'code': 'stale_generation'}
    assert app.contact.read_plan({'id': plan['id']})['state'] == 'evaluating'
    app.contact.cancel(plan['id'])
    assert wire(app, 'contact.fail-generation', {'id': second['id'],
        'ticket': second['ticket'], 'reason': 'provider_aborted'})['error'] == {'code': 'stale_generation'}
    assert app.contact.inbox() == []


def test_invalid_complete_fields_leave_evaluating_unchanged(app, model, clock):
    _, _, job = due_plan(app, model, clock)
    before = events(app)
    for payload in [
        {'id': job['id'], 'ticket': job['ticket'],
         'decision': {'disposition': 'send', 'text': 'Hello', 'reason': 'still_relevant',
                      'permission': 'all'}},
        {'id': job['id'], 'ticket': job['ticket'], 'decision': model.followup_decision,
         'extra': 1},
        {'id': job['id'], 'ticket': 'bad', 'decision': model.followup_decision},
    ]:
        assert wire(app, 'contact.complete', payload)['error'] == {'code': 'invalid_request'}
    assert events(app) == before
    assert app.contact.read_plan({'id': job['id']})['state'] == 'evaluating'
    assert app.contact.inbox() == []


@pytest.mark.parametrize('branch', ['defer', 'cancel', 'context_changed', 'expired'])
def test_non_send_branches_have_no_message(app, model, clock, branch):
    item, plan, job = due_plan(app, model, clock)
    decision = model.followup_decision
    if branch == 'defer':
        decision = {'disposition': 'defer', 'due_at': (clock()+timedelta(minutes=10)).isoformat(),
                    'reason': 'later'}
    elif branch == 'cancel':
        decision = {'disposition': 'cancel', 'reason': 'not_useful'}
    elif branch == 'context_changed':
        turn(app, conversation=item['conversation_id'], csv_text=None, capabilities=())
    else:
        clock.advance(hours=5)
    receipt = wire(app, 'contact.complete', {'id': job['id'], 'ticket': job['ticket'],
                                              'decision': decision})
    assert receipt['ok'], receipt
    value = receipt['result']
    assert value['id'] == plan['id'] and value['message_id'] is None
    assert value['state'] == {'defer': 'pending', 'cancel': 'cancelled',
                              'context_changed': 'pending', 'expired': 'expired'}[branch]
    assert value['reason'] == {'defer': 'later', 'cancel': 'not_useful',
                               'context_changed': 'context_changed', 'expired': 'expired'}[branch]
    assert app.contact.inbox() == []


def test_bound_complete_refuses_a_same_state_but_changed_reason_readback(app, model, clock, monkeypatch):
    _, _, job = due_plan(app, model, clock)
    read = app.contact.read_plan
    monkeypatch.setattr(app.contact, 'read_plan', lambda value: {
        **read(value), 'reason': 'concurrent_change'})
    with pytest.raises(ProductError, match='outcome_unknown'):
        app.contact.complete_bound({'id': job['id'], 'ticket': job['ticket'],
                                     'decision': model.followup_decision})
    assert len(app.contact.inbox()) == 1  # Committed send is still a real fact.


def test_delivery_window_and_invalid_decision_roll_back(app, model, clock):
    policy(app, proactive_enabled=True, start_minute=9*60, end_minute=11*60)
    model.decision = {'reply': 'Okay', 'followup': {'topic': 'work', 'purpose': 'Check in',
        'due_at': (clock()+timedelta(minutes=30)).isoformat(),
        'expires_at': (clock()+timedelta(days=2)).isoformat()}}
    item = turn(app, csv_text=None, capabilities=())
    app.respond(item['id'])
    clock.advance(minutes=30)
    job = app.contact.claim_due()
    assert job
    original_events = events(app)
    invalid = {'disposition': 'defer', 'due_at': (clock()-timedelta(minutes=1)).isoformat(),
               'reason': 'later'}
    assert wire(app, 'contact.complete', {'id': job['id'], 'ticket': job['ticket'],
        'decision': invalid})['error'] == {'code': 'invalid_followup_window'}
    assert app.contact.read_plan({'id': job['id']})['state'] == 'evaluating'
    assert events(app) == original_events
    clock.advance(hours=1)
    result = wire(app, 'contact.complete', {'id': job['id'], 'ticket': job['ticket'],
        'decision': {'disposition': 'send', 'text': 'Hello', 'reason': 'still_relevant'}})
    assert result['result']['state'] == 'pending'
    assert result['result']['reason'] == 'delivery_window'
    assert app.contact.inbox() == []


def test_explicit_reminder_delivery_is_independent_of_model_and_switch(app, clock):
    reminder = app.contact.remind(str(uuid4()), 'User-requested reminder', clock()+timedelta(minutes=1))
    clock.advance(minutes=1)
    sent = wire(app, 'reminder.deliver-due', {})
    assert sent['ok'] and len(sent['result']) == 1
    assert wire(app, 'reminder.deliver-due', {})['result'] == []
    assert app.contact.read_reminder({'id': reminder['id']})['state'] == 'delivered'
    assert app.contact.inbox()[0]['id'] == sent['result'][0]
    assert wire(app, 'reminder.deliver-due', {'extra': 1})['error'] == {'code': 'invalid_request'}
