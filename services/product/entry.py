"""A trusted-host stdio adapter; deliberately not a network/public renderer API."""
from __future__ import annotations

from datetime import datetime
import json
import re

from pydantic import Field
from services.local_tasks.models import LocalTaskError
from services.personal_ai.models import PersonalAIError

from .experience import ExperienceService
from .kernel import ProductKernel
from .models import ID, Model, ProductError, validate
from .store import canonical


class Envelope(Model):
    version: str
    request_id: ID
    action: str
    payload: dict = Field(default_factory=dict)


def exact(payload, required, optional=()):
    if set(payload) - set(required) - set(optional) or set(required) - set(payload):
        raise ProductError('invalid_request')


def dispatch(app, action, p, *, reviewed_packages=()):
    no_payload = {'bootstrap', 'home', 'policy.read', 'contact.controls', 'contact.inspect',
                  'contact.tick', 'contact.claim', 'reminder.deliver-due',
                  'runtime.recover', 'worker.run-next', 'worker.recover', 'tasks.sync', 'experience.history'}
    if action in no_payload:
        exact(p, ())
    if action == 'bootstrap': return app.bootstrap()
    if action == 'runtime.migrate':
        exact(p, ('expected_version',))
        return app.migrate(p['expected_version'])
    if action == 'home': return app.home()
    if action == 'conversation.list': return app.conversations.list(p)
    if action == 'conversation.turns': return app.conversations.turns(p)
    if action == 'policy.read': return app.store.read_policy().model_dump(mode='json')
    if action == 'policy.replace':
        exact(p, ('expected_revision', 'policy'))
        return app.memory.configure(p['expected_revision'], p['policy']).model_dump(mode='json')
    if action == 'turn.submit':
        exact(p, ('turn',), ('capabilities',))
        return app.submit_turn(p['turn'], capabilities=p.get('capabilities', ()))
    if action in ('turn.begin', 'turn.respond', 'turn.execute', 'turn.read', 'turn.revoke'):
        exact(p, ('turn_id',))
        return {'turn.begin': app.begin, 'turn.respond': app.respond, 'turn.execute': app.execute,
                'turn.read': app.turn, 'turn.revoke': app.revoke}[action](p['turn_id'])
    if action == 'turn.stop':
        exact(p, ('turn_id', 'command_id'))
        return app.stop(p)
    if action == 'turn.fail-generation':
        exact(p, ('turn_id', 'ticket', 'reason'))
        return app.fail_generation(p)
    if action == 'turn.accept':
        exact(p, ('turn_id', 'ticket', 'decision'), ('provider_summary',))
        return app.accept(p['turn_id'], p['ticket'], p['decision'], provider_summary=p.get('provider_summary'))
    if action == 'memory.list':
        exact(p, (), ('limit', 'before'))
        return app.memory.list(p.get('limit', 200), p.get('before'))
    if action == 'memory.clear':
        exact(p, ('expected_policy_revision',))
        return app.memory.clear(p['expected_policy_revision'])
    if action == 'memory.add':
        exact(p, ('content',), ('category',))
        return app.memory.add(p['content'], p.get('category', 'preferences'))
    if action == 'memory.edit':
        exact(p, ('id', 'expected_revision', 'content'))
        return app.memory.edit(p['id'], p['expected_revision'], p['content'])
    if action == 'memory.forget':
        exact(p, ('id', 'expected_revision'))
        return app.memory.forget(p['id'], p['expected_revision'])
    if action == 'contact.controls': return app.contact.controls()
    if action == 'contact.inspect': return app.contact.inspect_plans()
    if action == 'contact.cancel':
        exact(p, ('id',))
        return app.contact.cancel(p['id'])
    if action == 'contact.block-topic':
        exact(p, ('topic',))
        return app.contact.block_topic(p['topic'])
    if action == 'contact.unblock-topic':
        exact(p, ('topic',))
        return app.contact.unblock_topic(p['topic'])
    if action == 'contact.tick': return app.tick()
    if action == 'contact.claim': return app.contact.claim_due()
    if action == 'contact.complete':
        exact(p, ('id', 'ticket', 'decision'))
        return app.contact.complete_bound(p)
    if action == 'contact.fail-generation':
        exact(p, ('id', 'ticket', 'reason'))
        return app.contact.fail_generation(p)
    if action == 'contact.read':
        exact(p, ('id',))
        return app.contact.read_plan(p)
    if action == 'reminder.deliver-due': return app.contact.deliver_reminders()
    if action == 'reminder.create':
        exact(p, ('command_id', 'text', 'due_at'))
        return app.contact.remind(p['command_id'], p['text'], p['due_at'])
    if action == 'reminder.read': return app.contact.read_reminder(p)
    if action == 'reminder.list': return app.contact.list_reminders(p)
    if action == 'reminder.revise': return app.contact.revise_reminder(p)
    if action == 'reminder.cancel':
        exact(p, ('id',))
        return app.contact.cancel_reminder(p['id'])
    if action == 'inbox.list':
        exact(p, (), ('after', 'limit'))
        return app.contact.inbox(p.get('after', 0), p.get('limit', 50))
    if action == 'inbox.read':
        exact(p, ('id',))
        app.contact.mark_read(p['id'])
        return {'read': True}
    if action == 'inbox.explain':
        exact(p, ('id',))
        return app.contact.explain(p['id'])
    if action == 'events':
        exact(p, (), ('after', 'limit'))
        return app.events(p.get('after', 0), p.get('limit', 100))
    if action == 'runtime.recover': return app.recover()
    if action == 'worker.run-next':
        task = app.workbench.run_next()
        app.sync_task_messages()
        return task.model_dump(mode='json') if task else None
    if action == 'worker.recover': return [task.model_dump(mode='json') for task in app.workbench.recover()]
    if action == 'tasks.sync': return {'new_messages': app.sync_task_messages()}
    if action in ('task.get', 'task.result', 'task.events', 'task.cancel', 'task.retry'):
        return {'task.get': app.workbench.get, 'task.result': app.workbench.result, 'task.events': app.workbench.events,
                'task.cancel': app.workbench.cancel, 'task.retry': app.workbench.retry}[action](p).model_dump(mode='json')
    experience = ExperienceService(app.store, app.clock, reviewed_packages=reviewed_packages)
    if action == 'experience.history': return experience.history()
    if action == 'experience.activate':
        exact(p, ('package_revision', 'expected_revision'))
        return experience.activate(p['package_revision'], p['expected_revision'])
    if action == 'experience.restore':
        exact(p, ('target_revision', 'expected_revision'))
        return experience.restore(p['target_revision'], p['expected_revision'])
    raise ProductError('unsupported_action')


def unique_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ProductError('invalid_request')
        result[key] = value
    return result


def handle(raw: bytes, app, *, reviewed_packages=()):
    request_id = None
    try:
        if len(raw) > 384 * 1024:
            raise ProductError('request_too_large')
        value = json.loads(raw.decode('utf-8', errors='strict'), object_pairs_hook=unique_pairs,
                           parse_constant=lambda _: (_ for _ in ()).throw(ProductError('invalid_request')))
        envelope = validate(Envelope, value)
        request_id = envelope.request_id
        if envelope.version != 'product-core/1':
            raise ProductError('unsupported_version')
        result = dispatch(app, envelope.action, envelope.payload, reviewed_packages=reviewed_packages)
        reply = {'version': 'product-core/1', 'request_id': request_id, 'ok': True, 'result': result, 'error': None}
    except Exception as exc:
        code = (exc.code if isinstance(exc, (ProductError, LocalTaskError, PersonalAIError)) else
                'invalid_request' if isinstance(exc, (ValueError, TypeError, UnicodeError, RecursionError)) else 'internal_error')
        if not re.fullmatch(r'[a-z][a-z0-9_]{0,63}', code): code = 'internal_error'
        reply = {'version': 'product-core/1', 'request_id': request_id, 'ok': False, 'result': None, 'error': {'code': code}}
    data = (canonical(reply) + '\n').encode('utf-8')
    if len(data) > 1024 * 1024:
        return (canonical({'version': 'product-core/1', 'request_id': request_id, 'ok': False,
                           'result': None, 'error': {'code': 'response_too_large'}}) + '\n').encode()
    return data
