import json
from uuid import uuid4
import pytest
from services.product.entry import handle


def request(app, action, payload=None):
    body = {'version':'product-core/1','request_id':str(uuid4()),'action':action,'payload':payload or {}}
    result = json.loads(handle(json.dumps(body).encode(), app))
    assert result['request_id'] == body['request_id']
    return result


def test_fixed_entry_rejects_ambient_root_and_unsupported_action(app):
    assert request(app,'bootstrap',{'root':'C:/elsewhere'})['error']['code'] == 'invalid_request'
    assert request(app,'shell.run',{'command':'no'})['error']['code'] == 'unsupported_action'
    assert request(app,'home')['result']['policy']['memory_enabled'] is True


@pytest.mark.parametrize('raw', [b'{"action":"home","action":"bootstrap"}', b'\xff', b'null', b'{', b'{"x":NaN}'])
def test_malformed_input_has_bounded_sanitized_error(app, raw):
    result = json.loads(handle(raw, app))
    assert not result['ok'] and result['result'] is None
    assert 'Traceback' not in json.dumps(result)


def test_payload_types_and_policy_update(app):
    p = request(app,'policy.read')['result']
    updated = request(app,'policy.replace',{'expected_revision':p['revision'],'policy':{**p,'proactive_enabled':True}})
    assert updated['ok'] and updated['result']['revision'] == 2
    assert request(app,'inbox.list',{'limit':True})['error']['code'] == 'invalid_request'
    assert request(app,'inbox.list',{'limit':101})['error']['code'] == 'invalid_request'


def test_corrupt_database_is_not_silently_reinitialized(app):
    import sqlite3
    with sqlite3.connect(app.store.path) as db:
        db.execute('UPDATE meta SET version=99')
    assert request(app,'home')['error']['code'] == 'recovery_required'
    assert request(app,'bootstrap')['error']['code'] == 'recovery_required'
