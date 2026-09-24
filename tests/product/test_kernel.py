from uuid import uuid4
import json
from pathlib import Path
import subprocess
import sys
import pytest

from services.product.kernel import ProductKernel
from services.product.models import ProductError
from conftest import CSV, turn, policy


def test_defaults_and_real_csv_result_survive_restart(app, clock):
    before = app.home()
    assert before['policy']['memory_enabled'] and not before['policy']['proactive_enabled']
    item = turn(app)
    assert app.respond(item['id'])['state'] == 'actions_ready'
    sent = app.execute(item['id'])
    task = sent['actions'][0]['task']
    assert task['status'] == 'queued'
    # Real Python CSV/Decimal/SQLite execution, in a fresh subprocess with an explicit import root.
    source = Path(__file__).resolve().parents[2]
    code = "from pathlib import Path;import sys;sys.path.insert(0,sys.argv[1]);from services.product.kernel import ProductKernel;a=ProductKernel(Path(sys.argv[2]));print(a.workbench.run_next().status)"
    child = subprocess.run([sys.executable, '-I', '-B', '-c', code, str(source), str(app.root)],
                           capture_output=True, timeout=20)
    assert child.returncode == 0 and child.stdout.strip() == b'completed' and not child.stderr
    restarted = ProductKernel(app.root, clock=clock)
    assert restarted.home()['profile']['profile_id'] == before['profile']['profile_id']
    loaded = restarted.turn(item['id'])
    assert loaded['actions'][0]['task']['status'] == 'completed'
    assert restarted.workbench.result({'task_id': task['task_id']}).metadata['total'] == '6'
    assert restarted.sync_task_messages() == 1
    assert restarted.sync_task_messages() == 0
    assert restarted.contact.inbox()[0]['kind'] == 'task'


def test_idempotency_and_same_action_replay(app):
    request = {'command_id': str(uuid4()), 'conversation_id': str(uuid4()), 'text': '检查', 'csv_text': CSV}
    first = app.submit_turn(request, capabilities=['csv.audit'])
    assert app.submit_turn(request, capabilities=['csv.audit'])['id'] == first['id']
    with pytest.raises(ProductError, match='idempotency_conflict'):
        app.submit_turn({**request, 'text': '变了'}, capabilities=['csv.audit'])
    app.respond(first['id'])
    one = app.execute(first['id'])['actions'][0]['task']['task_id']
    assert app.execute(first['id'])['actions'][0]['task']['task_id'] == one
    assert len(app.workbench.list({}).items) == 1


def test_model_cannot_self_authorize_or_fabricate_completion(app, model):
    item = turn(app, capabilities=())
    assert app.respond(item['id'])['error'] == 'permission_denied'
    assert app.workbench.list({}).items == []
    model.decision = {'reply': '全部完成了', 'actions': [{'kind': 'csv.audit'}]}
    allowed = turn(app)
    app.respond(allowed['id'])
    assert app.execute(allowed['id'])['actions'][0]['task']['status'] == 'queued'


@pytest.mark.parametrize('decision', [
    {'reply': 'x', 'actions': [{'kind': 'shell', 'command': 'anything'}]},
    {'reply': 'x', 'permissions': ['all']},
    {'reply': 'x', 'actions': [{'kind': 'csv.audit', 'csv_text': 'injected'}]},
    {'reply': 'x', 'actions': [{'kind': 'csv.audit'}, {'kind': 'csv.audit'}]},
    {'reply': ''},
    {'reply': 'x', 'provider_summary': 'fabricated model-claimed provider metadata'},
])
def test_bad_model_output_is_atomic(app, model, decision):
    model.decision = decision
    item = turn(app)
    assert app.respond(item['id'])['state'] == 'model_failed'
    assert app.workbench.list({}).items == []
    assert app.memory.list() == []


def test_late_response_after_revoke_cannot_act(app):
    item = turn(app)
    context = app.begin(item['id'])
    app.revoke(item['id'])
    with pytest.raises(ProductError, match='stale_generation'):
        app.accept(item['id'], context['ticket'], {'reply': 'x', 'actions': [{'kind': 'csv.audit'}]})
    assert app.workbench.list({}).items == []


def test_revocation_between_proposal_and_execute(app):
    item = turn(app)
    app.respond(item['id'])
    app.revoke(item['id'])
    with pytest.raises(ProductError, match='permission_denied'):
        app.execute(item['id'])
    assert app.workbench.list({}).items == []


def test_lost_receipt_uses_original_action_id(app):
    item = turn(app)
    app.respond(item['id'])
    real = app.workbench.submit
    def lost(value):
        real(value)
        raise ConnectionError('PRIVATE: never emit raw exceptions')
    app.workbench.submit = lost
    unknown = app.execute(item['id'])
    assert unknown['state'] == 'outcome_unknown'
    assert 'PRIVATE' not in json.dumps(unknown)
    app.workbench.submit = real
    replayed = app.execute(item['id'])
    assert replayed['actions'][0]['task']['status'] == 'queued'
    assert len(app.workbench.list({}).items) == 1


def test_restart_invalidates_model_ticket(app, clock):
    item = turn(app)
    context = app.begin(item['id'])
    restarted = ProductKernel(app.root, clock=clock)
    assert restarted.recover()['interrupted_model_turns'] == 1
    with pytest.raises(ProductError, match='stale_generation'):
        app.accept(item['id'], context['ticket'], {'reply': 'late'})
    assert restarted.turn(item['id'])['state'] == 'model_failed'


def test_unconfigured_model_truthful_and_keeps_user_input(app):
    disconnected = ProductKernel(app.root)
    item = turn(disconnected)
    result = disconnected.respond(item['id'])
    assert result['error'] == 'model_not_configured' and result['text'] == item['text']


def test_profile_action_and_memory_switch_remain_separate(app, model):
    model.decision = {'reply': '以后叫我Mira。', 'actions': [{'kind': 'profile.change', 'changes': {'ai_name': 'Mira'}}]}
    item = turn(app, capabilities=('profile.change',))
    app.respond(item['id'])
    app.execute(item['id'])
    policy(app, memory_enabled=False)
    assert app.home()['profile']['preferences']['ai_name'] == 'Mira'


def test_real_task_cancel_uses_actual_receipt(app):
    item = turn(app)
    app.respond(item['id'])
    task_id = app.execute(item['id'])['actions'][0]['task']['task_id']
    app.workbench.cancel({'command_id': str(uuid4()), 'task_id': task_id})
    assert app.turn(item['id'])['actions'][0]['task']['status'] == 'cancelled'


def test_events_pagination_and_no_private_text(app):
    item = turn(app, text='private document name')
    app.respond(item['id'])
    app.execute(item['id'])
    first = app.events(limit=2)
    rest = app.events(after=first[-1]['seq'])
    assert first and rest and first[-1]['seq'] < rest[0]['seq']
    assert 'private document name' not in json.dumps(first + rest)


def test_process_crash_between_business_commit_and_journal_commit(app):
    item = turn(app)
    app.respond(item['id'])
    source = Path(__file__).resolve().parents[2]
    script = '''import sys,os
from pathlib import Path
sys.path.insert(0,sys.argv[1])
from services.product.kernel import ProductKernel
a=ProductKernel(Path(sys.argv[2]))
real=a.workbench.submit
def crash(value):
    real(value)
    os._exit(23)
a.workbench.submit=crash
a.execute(sys.argv[3])
'''
    child = subprocess.run([sys.executable,'-I','-B','-c',script,str(source),str(app.root),item['id']],capture_output=True,timeout=20)
    assert child.returncode == 23 and not child.stderr
    assert len(app.workbench.list({}).items) == 1
    # Replay the same persisted command; do not claim cross-database atomicity.
    recovered = app.execute(item['id'])
    assert recovered['actions'][0]['task']['status'] == 'queued'
    assert len(app.workbench.list({}).items) == 1


def test_profile_revision_change_rejects_old_model_context(app, model):
    item = turn(app,capabilities=('profile.change',))
    context = app.begin(item['id'])
    app.workbench.profile.change({'command_id':str(uuid4()),'expected_revision':1,'changes':{'ai_name':'新名字'}})
    response = app.accept(item['id'],context['ticket'],{'reply':'old','actions':[{'kind':'profile.change','changes':{'ai_name':'旧名字'}}]})
    assert response['error'] == 'context_changed'
    assert app.home()['profile']['preferences']['ai_name'] == '新名字'


def test_provider_summary_is_independent_trusted_metadata(app, model):
    from services.product.ports import ProviderReply
    model.decision = ProviderReply({'reply':'可以。'},'供应商实际公开的测试摘要')
    item = turn(app,capabilities=())
    assert app.respond(item['id'])['provider_summary'] == '供应商实际公开的测试摘要'
