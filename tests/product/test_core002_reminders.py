from datetime import timedelta
from uuid import uuid4
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest

from services.product.kernel import ProductKernel
from services.product.models import ProductError


def test_create_reopen_update_then_deliver_new_text_once(app, clock):
    command = str(uuid4())
    original_due = clock() + timedelta(minutes=1)
    created = app.contact.remind(command, '旧文字', original_due)
    assert created['revision'] == 1 and created['state'] == 'pending'
    reopened = ProductKernel(app.root, clock=clock)
    assert reopened.contact.list_reminders({})['items'][0]['id'] == command
    revised = reopened.contact.revise_reminder({
        'command_id': str(uuid4()), 'id': command, 'expected_revision': 1,
        'operation': 'update', 'text': '新文字',
        'due_at': (clock() + timedelta(minutes=10)).isoformat()})
    assert revised['revision'] == 2 and revised['text'] == '新文字'
    assert app.contact.remind(command, '旧文字', original_due)['text'] == '新文字'
    clock.advance(minutes=2)
    assert reopened.contact.deliver_reminders() == []
    clock.advance(minutes=8)
    assert len(reopened.contact.deliver_reminders()) == 1
    assert reopened.contact.deliver_reminders() == []
    assert reopened.contact.inbox()[0]['text'] == '新文字'
    assert reopened.contact.read_reminder({'id': command})['revision'] == 3
    assert not reopened.home()['policy']['proactive_enabled']


def test_revise_replay_before_cas_and_terminal_conflicts(app, clock):
    rid = str(uuid4())
    app.contact.remind(rid, 'A', clock() + timedelta(minutes=1))
    req = {'command_id': str(uuid4()), 'id': rid, 'expected_revision': 1,
           'operation': 'update', 'text': 'B', 'due_at': (clock()+timedelta(minutes=2)).isoformat()}
    first = app.contact.revise_reminder(req)
    assert app.contact.revise_reminder(req) == first
    with pytest.raises(ProductError, match='idempotency_conflict'):
        app.contact.revise_reminder({**req, 'text': 'C'})
    with pytest.raises(ProductError, match='revision_conflict'):
        app.contact.revise_reminder({**req, 'command_id': str(uuid4())})
    clock.advance(minutes=2)
    app.contact.deliver_reminders()
    assert app.contact.revise_reminder(req) == first  # Lost receipt after later delivery.
    with pytest.raises(ProductError, match='invalid_transition'):
        app.contact.revise_reminder({**req, 'command_id': str(uuid4()), 'expected_revision': 3})


def test_cancel_and_invalid_shapes(app, clock):
    rid = str(uuid4())
    app.contact.remind(rid, 'A', clock() + timedelta(minutes=10))
    req = {'command_id': str(uuid4()), 'id': rid, 'expected_revision': 1, 'operation': 'cancel'}
    assert app.contact.revise_reminder(req)['revision'] == 2
    assert app.contact.revise_reminder(req)['state'] == 'cancelled'
    assert not app.contact.cancel_reminder(rid)['cancelled']
    clock.advance(hours=1)
    assert app.contact.deliver_reminders() == []
    for bad in ({**req, 'command_id': str(uuid4()), 'text': None},
                {**req, 'command_id': str(uuid4()), 'operation': 'update', 'text': 'x'},
                {**req, 'command_id': str(uuid4()), 'operation': 'update', 'text': 'x', 'due_at': '2026-09-24T11:00:00+08:00'},
                {**req, 'command_id': str(uuid4()), 'expected_revision': True}):
        with pytest.raises(ProductError, match='invalid_request'):
            app.contact.revise_reminder(bad)
    assert app.contact.list_reminders({'limit': 1})['items'][0]['id'] == rid


def test_update_and_delivery_race_has_one_serial_order(app, clock):
    rid = str(uuid4())
    app.contact.remind(rid, '旧文字', clock() + timedelta(minutes=1))
    clock.advance(minutes=1)
    barrier = Barrier(2)
    command = {'command_id': str(uuid4()), 'id': rid, 'expected_revision': 1,
               'operation': 'update', 'text': '新文字',
               'due_at': (clock() + timedelta(minutes=10)).isoformat()}
    def update():
        barrier.wait()
        try:
            return ('updated', app.contact.revise_reminder(command))
        except ProductError as exc:
            return ('rejected', exc.code)
    def deliver():
        barrier.wait()
        return app.contact.deliver_reminders()
    with ThreadPoolExecutor(max_workers=2) as pool:
        u = pool.submit(update)
        d = pool.submit(deliver)
        outcome, messages = u.result(timeout=10), d.result(timeout=10)
    inbox = app.contact.inbox()
    if outcome[0] == 'updated':
        assert messages == [] and inbox == []
        assert app.contact.read_reminder({'id': rid})['text'] == '新文字'
    else:
        assert outcome[1] in ('revision_conflict', 'invalid_transition')
        assert len(messages) == 1 and len(inbox) == 1 and inbox[0]['text'] == '旧文字'
