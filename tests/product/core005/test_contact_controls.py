"""The Node protocol cannot outlive the user's latest persisted controls."""
from datetime import timedelta
from uuid import uuid4
import json

import pytest

from conftest import planned, policy, turn
from services.product.models import ProductError


@pytest.mark.parametrize('change', ['disable', 'pause', 'cancel', 'block', 'forget',
                                    'new_input', 'expired'])
def test_in_flight_reassessment_obeys_current_controls(app, model, clock, change):
    memory = app.memory.add('Fictional context', 'preferences') if change == 'forget' else None
    source, plan = planned(app, model, clock)
    clock.advance(minutes=30)
    job = app.contact.claim_due()
    if change == 'disable':
        policy(app, proactive_enabled=False)
    elif change == 'pause':
        policy(app, paused_until=(clock() + timedelta(hours=1)).isoformat())
    elif change == 'cancel':
        app.contact.cancel(plan['id'])
    elif change == 'block':
        app.contact.block_topic('wellbeing')
    elif change == 'forget':
        app.memory.forget(memory['id'], memory['revision'])
    elif change == 'new_input':
        turn(app, text='Situation changed', csv_text=None, capabilities=(),
             conversation=source['conversation_id'])
    else:
        clock.advance(hours=5)
    payload = {'id': job['id'], 'ticket': job['ticket'], 'decision': model.followup_decision}
    if change in ('new_input', 'expired'):
        result = app.contact.complete_bound(payload)
        assert result['state'] == ('pending' if change == 'new_input' else 'expired')
    else:
        with pytest.raises(ProductError, match='stale_generation'):
            app.contact.complete_bound(payload)
    receipt = app.contact.read_plan({'id': job['id']})
    assert receipt['message_id'] is None
    assert app.contact.inbox() == []


def test_no_automatic_followup_chase_and_private_normal_projections(app, model, clock):
    source, plan = planned(app, model, clock)
    text = json.dumps({'home': app.home(), 'turn': app.turn(source['id'])}, ensure_ascii=False)
    assert plan['due_at'] not in text and plan['purpose'] not in text
    clock.advance(minutes=30)
    job = app.contact.claim_due()
    sent = app.contact.complete_bound({'id': job['id'], 'ticket': job['ticket'],
                                       'decision': model.followup_decision})
    assert sent['state'] == 'sent'
    assert app.contact.claim_due() is None
    app.contact.mark_read(sent['message_id'])
    assert app.home()['unread_count'] == 0
    assert app.contact.explain(sent['message_id'])['basis'] == 'opt_in_and_model_reassessment'
    clock.advance(days=1)
    assert app.contact.claim_due() is None
    assert len(app.contact.inbox()) == 1


def test_message_and_evaluation_limits_preserve_other_plans(app, model, clock):
    planned(app, model, clock)
    planned(app, model, clock)
    policy(app, daily_limit=1, daily_evaluation_limit=1)
    clock.advance(minutes=30)
    first = app.contact.claim_due()
    assert first is not None
    assert app.contact.claim_due() is None
    app.contact.complete_bound({'id': first['id'], 'ticket': first['ticket'],
                                'decision': model.followup_decision})
    assert app.contact.claim_due() is None
    assert len(app.contact.inbox()) == 1
    assert sorted(row['state'] for row in app.contact.inspect_plans()) == ['pending', 'sent']


def test_explicit_reminder_survives_proactive_revocation(app, model, clock):
    _, plan = planned(app, model, clock)
    reminder = app.contact.remind(str(uuid4()), 'Fictional explicit reminder',
                                  clock() + timedelta(minutes=1))
    policy(app, proactive_enabled=False)
    clock.advance(minutes=30)
    assert app.contact.claim_due() is None
    ids = app.contact.deliver_reminders()
    assert len(ids) == 1
    assert app.contact.read_reminder({'id': reminder['id']})['state'] == 'missed'
    assert app.contact.inbox()[0]['id'] == ids[0]
    assert app.contact.explain(ids[0])['basis'] == 'user_requested_work'
