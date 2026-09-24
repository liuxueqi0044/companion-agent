from datetime import datetime, timedelta, timezone
from uuid import uuid4
import pytest

from services.product.kernel import ProductKernel

CSV = 'item,unit,qty,unit_price,currency\n笔,支,2,3,CNY\n'


class Clock:
    def __init__(self): self.value = datetime(2026, 9, 24, 10, tzinfo=timezone.utc)
    def __call__(self): return self.value
    def advance(self, **parts): self.value += timedelta(**parts)


class ScriptedModel:
    def __init__(self):
        self.contexts = []
        self.decision = {'reply': '我来核对材料。', 'actions': [{'kind': 'csv.audit'}]}
        self.followup_decision = {'disposition': 'send', 'text': '今天稍微好一点了吗？', 'reason': 'still_relevant'}
    def respond(self, context):
        self.contexts.append(context)
        return self.decision
    def reassess(self, context):
        self.contexts.append(context)
        return self.followup_decision


@pytest.fixture
def clock(): return Clock()


@pytest.fixture
def model(): return ScriptedModel()


@pytest.fixture
def app(tmp_path, clock, model):
    value = ProductKernel(tmp_path / 'fresh', clock=clock, model=model)
    value.bootstrap()
    return value


def turn(app, *, text='核对材料', csv_text=CSV, temporary=False, capabilities=('csv.audit',), conversation=None):
    return app.submit_turn({'command_id': str(uuid4()), 'conversation_id': conversation or str(uuid4()),
                            'text': text, 'csv_text': csv_text, 'temporary': temporary}, capabilities=capabilities)


def policy(app, **changes):
    current = app.store.read_policy()
    return app.memory.configure(current.revision, {**current.model_dump(mode='json'), **changes})


def planned(app, model, clock, *, conversation=None):
    policy(app, proactive_enabled=True)
    model.decision = {'reply': '听起来今天很不容易，愿意和我说说吗？',
                      'followup': {'topic': 'wellbeing', 'purpose': '跟进今天的近况',
                                   'due_at': (clock() + timedelta(minutes=30)).isoformat(),
                                   'expires_at': (clock() + timedelta(hours=4)).isoformat()}}
    item = turn(app, text='今天有点难受', csv_text=None, capabilities=(), conversation=conversation)
    app.respond(item['id'])
    return item, app.contact.inspect_plans()[-1]
