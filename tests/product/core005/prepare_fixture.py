"""Offline test-only setup through public ProductKernel operations and an injected past clock."""
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys
from uuid import uuid4

workspace, root = map(lambda value: Path(value).resolve(), sys.argv[1:3])
count = int(sys.argv[3]) if len(sys.argv) > 3 else 1
if not 1 <= count <= 5:
    raise SystemExit('invalid_fixture_count')
sys.path.insert(0, str(workspace))
import services
assert Path(services.__file__).resolve().parent == workspace / 'services', 'wrong_import_root'
from services.product.kernel import ProductKernel

now = datetime.now(timezone.utc)
past = now - timedelta(minutes=10)
app = ProductKernel(root, clock=lambda: past)
app.bootstrap()
policy = app.store.read_policy()
minute = now.hour * 60 + now.minute
updated = app.memory.configure(policy.revision, {**policy.model_dump(mode='json'),
    'proactive_enabled': True, 'start_minute': (minute - 30) % 1440,
    'end_minute': (minute + 30) % 1440, 'daily_limit': 5,
    'daily_evaluation_limit': 5})
plans = []
for number in range(count):
    turn_id, conversation_id = str(uuid4()), str(uuid4())
    app.submit_turn({'command_id': turn_id, 'conversation_id': conversation_id,
        'text': f'Fictional conversation {number}', 'csv_text': None}, capabilities=())
    begun = app.begin(turn_id)
    app.accept(turn_id, begun['ticket'], {'reply': 'Okay.', 'followup': {
        'topic': 'work', 'purpose': f'Fictional follow-up {number}',
        'due_at': (now - timedelta(minutes=5) + timedelta(seconds=number)).isoformat(),
        'expires_at': (now + timedelta(hours=6)).isoformat()}})
    plans.append({'id': app.contact.inspect_plans()[0]['id'], 'source_id': turn_id})
reminder_id = str(uuid4())
app.contact.remind(reminder_id, 'Fictional user-requested reminder',
                   now - timedelta(minutes=3))
print(json.dumps({'plans': plans, 'reminder_id': reminder_id,
                  'profile_id': app.home()['profile']['profile_id'],
                  'policy_revision': updated.revision}, ensure_ascii=False))
