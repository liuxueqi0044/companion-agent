import json
from uuid import uuid4

import pytest

from conftest import turn
from services.product.entry import handle
from services.product.models import ProductError


def _events(app):
    with app.store.tx() as db:
        return db.execute('SELECT COUNT(*) FROM events').fetchone()[0]


def _wire(app, payload):
    raw = json.dumps({'version': 'product-core/1', 'request_id': str(uuid4()),
                      'action': 'turn.fail-generation', 'payload': payload}).encode()
    return json.loads(handle(raw, app))


def test_failure_is_ticket_bound_atomic_and_retryable(app):
    first = turn(app)
    other = turn(app)
    begun = app.begin(first['id'])
    before = _events(app)
    wrong = {**{'turn_id': first['id'], 'ticket': str(uuid4())}, 'reason': 'provider_timeout'}
    assert _wire(app, wrong)['error'] == {'code': 'stale_generation'}
    assert _events(app) == before
    assert app.turn(first['id'])['state'] == 'generating'
    reply = _wire(app, {'turn_id': first['id'], 'ticket': begun['ticket'], 'reason': 'provider_timeout'})
    assert reply['ok'] and reply['result'] == {'id': first['id'], 'state': 'model_failed',
                                                'error': 'provider_timeout'}
    with app.store.tx() as db:
        assert db.execute('SELECT ticket FROM turns WHERE id=?', (first['id'],)).fetchone()[0] is None
    assert _events(app) == before + 1
    before = _events(app)
    assert _wire(app, {'turn_id': first['id'], 'ticket': begun['ticket'],
                       'reason': 'provider_failed'})['error'] == {'code': 'stale_generation'}
    assert _events(app) == before
    assert app.turn(other['id'])['state'] == 'queued'
    restarted = app.begin(first['id'])
    assert restarted['ticket'] != begun['ticket']
    assert _wire(app, {'turn_id': first['id'], 'ticket': begun['ticket'],
                       'reason': 'provider_aborted'})['error'] == {'code': 'stale_generation'}
    assert app.turn(first['id'])['state'] == 'generating'
    app.accept(first['id'], restarted['ticket'], {'reply': 'ready'})
    before = _events(app)
    assert _wire(app, {'turn_id': first['id'], 'ticket': restarted['ticket'],
                       'reason': 'provider_failed'})['error'] == {'code': 'stale_generation'}
    assert _events(app) == before
    assert app.turn(first['id'])['state'] == 'responded'


def test_stopped_and_malformed_failures_do_not_write(app):
    item = turn(app)
    context = app.begin(item['id'])
    before = _events(app)
    for payload in [
        {'turn_id': item['id'], 'ticket': context['ticket'], 'reason': 'private exception text'},
        {'turn_id': item['id'], 'ticket': context['ticket'], 'reason': 'provider_failed', 'extra': 1},
        {'turn_id': item['id'], 'ticket': 4, 'reason': 'provider_failed'},
        {'turn_id': 'bad', 'ticket': context['ticket'], 'reason': 'provider_failed'},
    ]:
        assert _wire(app, payload)['error'] == {'code': 'invalid_request'}
    assert _events(app) == before
    app.stop({'turn_id': item['id'], 'command_id': str(uuid4())})
    before = _events(app)
    assert _wire(app, {'turn_id': item['id'], 'ticket': context['ticket'],
                       'reason': 'provider_aborted'})['error'] == {'code': 'stale_generation'}
    assert _events(app) == before
    assert app.turn(item['id'])['state'] == 'cancelled'
