import base64
import io
import json
import zipfile
from datetime import timedelta
from uuid import uuid4

import pytest

from services.product.entry import dispatch
from services.product.models import ProductError


def proposal(app, *, actions=None, grants=('artifact.create', 'reminder.create')):
    t = app.submit_turn({'command_id': str(uuid4()), 'conversation_id': str(uuid4()), 'text': '保存一份周报'}, capabilities=grants)
    c = app.begin(t['id'])
    app.accept(t['id'], c['ticket'], {'reply': '正在整理。', 'actions': actions or [
        {'kind': 'artifact.create', 'title': '工作周报', 'files': [{'path': 'notes.md', 'content': '# 本周\n完成核对。'},
         {'path': 'src/helper.py', 'content': 'raise RuntimeError("must never execute")'}]}]})
    return t


def test_artifact_real_receipt_replay_and_zip(app):
    t = proposal(app)
    first = app.execute(t['id'])
    assert app.execute(t['id']) == first
    a = first['actions'][0]
    assert a['state'] == 'accepted' and a['artifact']['title'] == '工作周报'
    assert 'content' not in json.dumps(a)
    request = {'turn_id': t['id'], 'action_id': a['id']}
    downloaded = dispatch(app, 'artifact.download', request)
    assert dispatch(app, 'artifact.download', request) == downloaded
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(downloaded['base64']))) as archive:
        assert archive.read('notes.md').decode() == '# 本周\n完成核对。'
        assert 'raise RuntimeError' in archive.read('src/helper.py').decode()
    assert not list(app.root.rglob('helper.py'))
    with pytest.raises(ProductError, match='artifact_not_found'):
        dispatch(app, 'artifact.read', {**request, 'turn_id': str(uuid4())})


@pytest.mark.parametrize('name', ['../secret.txt', 'CON.txt', 'folder/AuX.md', '/etc/file.txt', 'notes.exe', 'a\\x.py', 'a:b.txt'])
def test_artifact_path_rejected_before_any_action(app, name):
    with pytest.raises(ProductError, match='invalid_request'):
        proposal(app, actions=[{'kind': 'artifact.create', 'title': 'test', 'files': [{'path': name, 'content': 'hi'}]}])


def test_grant_and_cancellation_are_enforced(app):
    with pytest.raises(ProductError, match='permission_denied'):
        proposal(app, grants=())
    t = proposal(app)
    app.revoke(t['id'])
    with pytest.raises(ProductError, match='permission_denied'):
        app.execute(t['id'])


def test_corrupt_artifact_is_not_exported(app):
    t = proposal(app); a = app.execute(t['id'])['actions'][0]
    with app.store.tx(True) as db:
        raw = json.loads(db.execute('SELECT result_json FROM actions WHERE id=?', (a['id'],)).fetchone()[0])
        raw['files'][0]['content'] = 'modified'
        db.execute('UPDATE actions SET result_json=? WHERE id=?', (json.dumps(raw), a['id']))
    with pytest.raises(ProductError, match='artifact_corrupt'):
        dispatch(app, 'artifact.download', {'turn_id': t['id'], 'action_id': a['id']})


def test_natural_language_reminder_same_transaction_and_delivery(app, clock):
    due = (clock() + timedelta(minutes=10)).isoformat()
    t = proposal(app, actions=[{'kind': 'reminder.create', 'text': '喝水', 'due_at': due}])
    a = app.execute(t['id'])['actions'][0]
    assert a['reminder']['state'] == 'pending'
    assert app.execute(t['id'])['actions'] == [a]
    clock.advance(minutes=11)
    assert len(app.contact.deliver_reminders()) == 1
    assert app.contact.deliver_reminders() == []
    assert app.turn(t['id'])['actions'][0]['reminder']['state'] == 'delivered'


def test_stale_reminder_rejects_whole_decision(app, clock):
    with pytest.raises(ProductError, match='invalid_reminder_time'):
        proposal(app, actions=[{'kind': 'reminder.create', 'text': 'old', 'due_at': (clock()-timedelta(minutes=1)).isoformat()}])
    assert app.contact.list_reminders({})['items'] == []
