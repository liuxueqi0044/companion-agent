from datetime import timedelta
from uuid import uuid4
import json
import pytest

from services.product.kernel import ProductKernel
from services.product.models import ProductError
from conftest import turn, policy, planned


def test_opt_in_autonomy_surprise_and_restart_delivery(app, model, clock):
    item, plan = planned(app, model, clock)
    chat = app.turn(item['id'])
    assert 'due_at' not in json.dumps(chat) and 'followup' not in chat
    assert app.home()['unread_count'] == 0
    assert app.tick()['followup'] is None
    clock.advance(minutes=30)
    restarted = ProductKernel(app.root, clock=clock, model=model)
    assert restarted.tick()['followup']['state'] == 'sent'
    inbox = restarted.contact.inbox()
    assert len(inbox) == 1 and inbox[0]['text'] == '今天稍微好一点了吗？'
    assert inbox[0]['source_id'] == item['id']
    assert restarted.contact.explain(inbox[0]['id'])['basis'] == 'opt_in_and_model_reassessment'
    assert restarted.tick()['followup'] is None
    clock.advance(days=1)
    assert restarted.tick()['followup'] is None  # Ignoring the message is not a reason to chase.


def test_disabled_never_creates_automatic_plan(app, model, clock):
    model.decision = {'reply': '听你说。', 'followup': {'topic': 'wellbeing', 'purpose': '关心',
        'due_at': (clock()+timedelta(minutes=1)).isoformat(), 'expires_at': (clock()+timedelta(hours=1)).isoformat()}}
    app.respond(turn(app, capabilities=())['id'])
    assert app.contact.inspect_plans() == []


def test_resolved_context_cancels_instead_of_sending(app, model, clock):
    item, plan = planned(app, model, clock)
    turn(app, text='已经解决了，谢谢', csv_text=None, capabilities=(), conversation=item['conversation_id'])
    model.followup_decision = {'disposition': 'cancel', 'reason': 'resolved'}
    clock.advance(minutes=30)
    assert app.tick()['followup']['state'] == 'cancelled'
    assert model.contexts[-1]['recent_interactions'][-1]['text'] == '已经解决了，谢谢'
    assert app.contact.inbox() == []


def test_context_changes_while_generating_discard_stale_message(app, model, clock):
    item, plan = planned(app, model, clock)
    clock.advance(minutes=30)
    job = app.contact.claim_due()
    turn(app, text='现在没事了', csv_text=None, capabilities=(), conversation=item['conversation_id'])
    result = app.contact.complete(job['id'], job['ticket'], model.followup_decision)
    assert result == {'state': 'pending', 'reason': 'context_changed'}
    assert app.contact.inbox() == []


def test_disable_during_model_generation_is_final(app, model, clock):
    _, plan = planned(app, model, clock)
    clock.advance(minutes=30)
    def disable(context):
        policy(app, proactive_enabled=False)
        return {'disposition': 'send', 'text': '不应送达', 'reason': 'still_relevant'}
    model.reassess = disable
    assert app.tick()['followup']['state'] == 'cancelled'
    assert app.contact.inbox() == []


def test_pause_and_quiet_hours_do_not_generate(app, model, clock):
    _, plan = planned(app, model, clock)
    policy(app, paused_until=(clock()+timedelta(hours=1)).isoformat())
    clock.advance(minutes=30)
    assert app.tick()['followup'] is None
    policy(app, paused_until=None, start_minute=12*60, end_minute=20*60)
    assert app.tick()['followup'] is None
    clock.advance(hours=2)
    assert app.tick()['followup']['state'] == 'sent'


def test_frequency_limit_serializes_two_plans(app, model, clock):
    planned(app, model, clock)
    planned(app, model, clock)
    clock.advance(minutes=30)
    first = app.contact.claim_due()
    assert app.contact.claim_due() is None
    app.contact.complete(first['id'], first['ticket'], model.followup_decision)
    assert app.contact.claim_due() is None
    assert len(app.contact.inbox()) == 1


def test_overnight_contact_window_and_fixed_timezone(app, model, clock):
    planned(app, model, clock)
    policy(app, timezone='UTC+08:00', start_minute=21*60, end_minute=7*60)
    clock.advance(minutes=30)  # 18:30 local, outside the requested overnight window.
    assert app.tick()['followup'] is None
    clock.advance(hours=3)  # 21:30 local.
    assert app.tick()['followup']['state'] == 'sent'


def test_expired_offline_message_not_bulk_replayed(app, model, clock):
    planned(app, model, clock)
    clock.advance(days=2)
    assert app.tick()['followup'] is None
    assert app.contact.inspect_plans()[0]['state'] == 'expired'
    assert app.contact.inspect_plans()[0]['purpose'] == ''
    assert app.contact.inbox() == []


def test_block_topic_cancels_pending_and_prevents_new_plan(app, model, clock):
    planned(app, model, clock)
    app.contact.block_topic('wellbeing')
    app.respond(turn(app, capabilities=())['id'])
    assert len(app.contact.inspect_plans()) == 1
    assert app.contact.inspect_plans()[0]['state'] == 'cancelled'


def test_memory_off_can_use_explicitly_allowed_short_followup(app, model, clock):
    policy(app, memory_enabled=False)
    planned(app, model, clock)
    clock.advance(minutes=30)
    job = app.contact.claim_due()
    assert job['memories'] == [] and job['purpose'] == '跟进今天的近况'
    assert app.contact.complete(job['id'], job['ticket'], model.followup_decision)['state'] == 'sent'
    assert app.memory.list() == []


def test_temporary_conversation_never_plans(app, model, clock):
    planned(app, model, clock)
    item = turn(app, temporary=True, capabilities=())
    app.respond(item['id'])
    assert len(app.contact.inspect_plans()) == 1


def test_generation_failure_needs_explicit_retry_and_old_ticket_fails(app, model, clock):
    planned(app, model, clock)
    clock.advance(minutes=30)
    job = app.contact.claim_due()
    restarted = ProductKernel(app.root, clock=clock, model=model)
    assert restarted.recover()['interrupted_followups'] == 1
    assert restarted.tick()['followup'] is None
    with pytest.raises(ProductError, match='stale_generation'):
        app.contact.complete(job['id'], job['ticket'], model.followup_decision)
    restarted.contact.retry(job['id'])
    assert restarted.tick()['followup']['state'] == 'sent'


def test_deferral_uses_model_time_and_is_bounded(app, model, clock):
    planned(app, model, clock)
    clock.advance(minutes=30)
    for step in range(3):
        model.followup_decision = {'disposition': 'defer', 'due_at': (clock()+timedelta(minutes=10)).isoformat(), 'reason': 'later'}
        result = app.tick()['followup']
        assert result['state'] == ('cancelled' if step == 2 else 'pending')
        clock.advance(minutes=10)
    assert app.contact.inbox() == []


def test_invalid_plan_window_rolls_back_everything(app, model, clock):
    policy(app, proactive_enabled=True)
    model.decision = {'reply': 'x', 'memories': [{'content': '不应落库', 'category': 'work'}],
                      'actions': [{'kind':'csv.audit'}],
                      'followup': {'topic': 'wellbeing', 'purpose': '关心',
                                   'due_at': (clock()+timedelta(days=8)).isoformat(),
                                   'expires_at': (clock()+timedelta(days=9)).isoformat()}}
    item = turn(app)
    assert app.respond(item['id'])['state'] == 'model_failed'
    assert app.memory.list() == [] and app.turn(item['id'])['actions'] == []


def test_one_off_reminder_works_with_proactive_off_without_model(app, clock):
    command_id = str(uuid4())
    due = clock()+timedelta(minutes=1)
    app.contact.remind(command_id, '喝水', due)
    app.contact.remind(command_id, '喝水', due)
    with pytest.raises(ProductError, match='idempotency_conflict'):
        app.contact.remind(command_id, '另一个提醒', due)
    clock.advance(minutes=1)
    assert len(app.tick()['reminders']) == 1
    assert app.tick()['reminders'] == []
    inbox = app.contact.inbox()
    assert len(inbox) == 1 and inbox[0]['kind'] == 'reminder'
    assert not app.home()['policy']['proactive_enabled']
    app.contact.mark_read(inbox[0]['id'])
    assert app.home()['unread_count'] == 0


def test_missed_reminder_truthful_and_cancel_before_delivery(app, clock):
    app.contact.remind(str(uuid4()), '过去的提醒', clock()+timedelta(minutes=1))
    cancelled = str(uuid4())
    app.contact.remind(cancelled, '取消的提醒', clock()+timedelta(minutes=1))
    assert app.contact.cancel_reminder(cancelled)['cancelled']
    clock.advance(hours=1)
    app.tick()
    assert [item['kind'] for item in app.contact.inbox()] == ['missed_reminder']


def test_duplicate_completion_cannot_duplicate_message(app, model, clock):
    planned(app, model, clock)
    clock.advance(minutes=30)
    job = app.contact.claim_due()
    app.contact.complete(job['id'], job['ticket'], model.followup_decision)
    with pytest.raises(ProductError, match='stale_generation'):
        app.contact.complete(job['id'], job['ticket'], model.followup_decision)
    assert len(app.contact.inbox()) == 1


def test_invalid_reassessment_never_emits_message(app, model, clock):
    planned(app, model, clock)
    clock.advance(minutes=30)
    model.followup_decision = {'disposition': 'send', 'text':'x', 'reason': 'still_relevant', 'permission':'unlimited'}
    assert app.tick()['followup']['state'] == 'needs_retry'
    assert app.contact.inbox() == []


def test_reevaluation_budget_limits_calls_even_when_all_cancel(app, model, clock):
    for _ in range(4): planned(app,model,clock)
    clock.advance(minutes=30)
    model.followup_decision = {'disposition':'cancel','reason':'not_useful'}
    calls = len(model.contexts)
    for _ in range(3):
        assert app.tick()['followup']['state'] == 'cancelled'
    assert app.tick()['followup'] is None
    assert len(model.contexts) - calls == 3


def test_topic_unblock_only_allows_future_plans(app, model, clock):
    planned(app,model,clock)
    app.contact.block_topic('wellbeing')
    app.contact.unblock_topic('wellbeing')
    assert app.contact.inspect_plans()[0]['state'] == 'cancelled'
    app.respond(turn(app,capabilities=())['id'])
    assert sorted(p['state'] for p in app.contact.inspect_plans()) == ['cancelled','pending']


def test_two_local_runners_cannot_claim_same_plan(app, model, clock):
    from concurrent.futures import ThreadPoolExecutor
    planned(app,model,clock)
    clock.advance(minutes=30)
    other = ProductKernel(app.root,clock=clock,model=model)
    with ThreadPoolExecutor(max_workers=2) as pool:
        jobs = list(pool.map(lambda service:service.claim_due(),[app.contact,other.contact]))
    assert sum(job is not None for job in jobs) == 1
