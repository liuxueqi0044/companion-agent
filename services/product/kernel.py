"""A durable application facade; models suggest, existing tools execute and report truth."""
from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
from uuid import uuid4

from services.desktop_bridge.entry import create_app as create_workbench, _guard_root
from services.local_tasks.models import LocalTaskError, bounded_text
from services.personal_ai.models import PersonalAIError

from .contact import ContactService
from .context import cursor, is_latest_turn, turn_context
from .conversation import ConversationBrowser
from .memory import ManagedMemory
from .models import FailGenerationRequest, ModelDecision, ProductError, StopTurnRequest, UserTurn, validate
from .ports import ProviderReply, UnconfiguredModel
from .store import ProductStore, canonical, digest, guard, stamp


class ProductKernel:
    def __init__(self, root: Path, *, clock=None, model=None):
        self.root = guard(root)
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.model = model or UnconfiguredModel()
        self.workbench = create_workbench(self.root)
        self.store = ProductStore(self.root)
        self.memory = ManagedMemory(self.store, self.clock)
        self.contact = ContactService(self.store, self.clock)
        self.conversations = ConversationBrowser(self.store)

    def bootstrap(self):
        guard(self.root)
        self.root.mkdir(parents=True, exist_ok=True)
        _guard_root(self.root, create=False)
        profile = self.workbench.bootstrap()
        self.store.bootstrap(profile.profile_id)
        return self.home()

    def migrate(self, expected_version):
        return self.store.migrate(self.workbench.profile.read().profile_id, expected_version)

    def home(self):
        profile = self.workbench.profile.read()
        policy = self.store.read_policy()
        with self.store.tx() as db:
            stored_identity = db.execute('SELECT profile_id FROM meta WHERE singleton=1').fetchone()[0]
            if stored_identity != profile.profile_id:
                raise ProductError('identity_mismatch')
            unread = db.execute('SELECT COUNT(*) FROM inbox WHERE read=0').fetchone()[0]
            current = db.execute('SELECT revision FROM experience_head WHERE singleton=1').fetchone()[0]
        return {'schema_version': 'product-core/1', 'profile': profile.model_dump(mode='json'),
                'policy': policy.model_dump(mode='json'), 'unread_count': unread,
                'experience_revision': current,
                'model_status': 'not_configured' if isinstance(self.model, UnconfiguredModel) else 'adapter_available',
                'runtime': 'local_device', 'native_isolation': 'not_run'}

    def submit_turn(self, value, *, capabilities=()):
        """Capabilities come from the trusted host's user-intent/approval boundary, never model output."""
        request = validate(UserTurn, value)
        if not isinstance(capabilities, (tuple, list)) or any(item not in ('csv.audit', 'profile.change') for item in capabilities):
            raise ProductError('invalid_capability')
        grants = sorted(set(capabilities))
        if 'csv.audit' in grants and request.csv_text is None:
            raise ProductError('missing_material')
        profile = self.workbench.profile.read()
        fingerprint = digest({'request': request.model_dump(mode='json'), 'grants': grants})
        with self.store.tx(True) as db:
            prior = db.execute('SELECT * FROM turns WHERE id=?', (request.command_id,)).fetchone()
            if prior:
                if prior['request_hash'] != fingerprint:
                    raise ProductError('idempotency_conflict')
            else:
                policy = self.store.policy(db)
                db.execute('''INSERT INTO turns(id,request_hash,conversation_id,text,csv_text,temporary,
                    grants_json,profile_revision,policy_revision,state,created_at) VALUES(?,?,?,?,?,?,?,?,?,'queued',?)''',
                           (request.command_id, fingerprint, request.conversation_id, request.text, request.csv_text,
                            int(request.temporary), canonical(grants), profile.revision, policy.revision, stamp(self.clock())))
                self.store.event(db, request.command_id, 'interaction.submitted', self.clock())
        return self.turn(request.command_id)

    def begin(self, turn_id):
        profile = self.workbench.profile.read()
        with self.store.tx(True) as db:
            turn = self._turn(db, turn_id)
            if not is_latest_turn(db, turn):
                raise ProductError('superseded_turn')
            if turn['state'] not in ('queued', 'model_failed'):
                raise ProductError('invalid_transition')
            policy = self.store.policy(db)
            ticket = str(uuid4())
            context, signature = turn_context(db, turn, policy, profile)
            db.execute("""UPDATE turns SET state='generating',ticket=?,policy_revision=?,profile_revision=?,
                       context_signature=?,context_cursor=?,error=NULL WHERE id=?""",
                       (ticket, policy.revision, profile.revision, signature,
                        cursor(db, turn['conversation_id']), turn_id))
            self.store.event(db, turn_id, 'model.started', self.clock())
            return {'turn_id': turn_id, 'ticket': ticket, **context, 'now': stamp(self.clock())}

    @staticmethod
    def _turn(db, turn_id):
        row = db.execute('SELECT * FROM turns WHERE id=?', (turn_id,)).fetchone()
        if row is None:
            raise ProductError('not_found')
        return row

    def accept(self, turn_id, ticket, value, *, provider_summary=None):
        decision = validate(ModelDecision, value)
        if provider_summary is not None:
            try:
                bounded_text(provider_summary, 16 * 1024)
            except (TypeError, ValueError, AttributeError) as exc:
                raise ProductError('invalid_provider_metadata') from exc
        with self.store.tx(True) as db:
            turn = self._turn(db, turn_id)
            if turn['state'] != 'generating' or turn['ticket'] != ticket:
                raise ProductError('stale_generation')
            if not is_latest_turn(db, turn):
                db.execute("UPDATE turns SET state='model_failed',ticket=NULL,error='context_changed' WHERE id=?", (turn_id,))
                return {'id': turn_id, 'state': 'model_failed', 'error': 'context_changed'}
            policy = self.store.policy(db)
            current_profile = self.workbench.profile.read()
            _, signature = turn_context(db, turn, policy, current_profile)
            if (policy.revision != turn['policy_revision'] or current_profile.revision != turn['profile_revision']
                    or signature != turn['context_signature']):
                db.execute("UPDATE turns SET state='model_failed',ticket=NULL,error='context_changed' WHERE id=?", (turn_id,))
                return {'id': turn_id, 'state': 'model_failed', 'error': 'context_changed'}
            grants = json.loads(turn['grants_json'])
            for action in decision.actions:
                if action.kind not in grants:
                    raise ProductError('permission_denied')
                if action.kind == 'csv.audit' and turn['csv_text'] is None:
                    raise ProductError('missing_material')
            # One transaction accepts the entire structured output or nothing.
            for ordinal, action in enumerate(decision.actions):
                db.execute("INSERT INTO actions(id,turn_id,ordinal,kind,payload_json,state) VALUES(?,?,?,?,?,'ready')",
                           (str(uuid4()), turn_id, ordinal, action.kind, action.model_dump_json(exclude_unset=True)))
            ManagedMemory.accept_suggestions(db, policy, turn, decision.memories)
            ContactService.propose(db, policy, turn, decision.followup, self.clock())
            db.execute('UPDATE turns SET state=?,ticket=NULL,reply=?,summary=? WHERE id=?',
                       ('actions_ready' if decision.actions else 'responded', decision.reply, provider_summary, turn_id))
            self.store.event(db, turn_id, 'model.responded', self.clock())
        return self.turn(turn_id)

    def fail_generation(self, value):
        """End only the generation identified by this ticket; never sweep other work."""
        request = validate(FailGenerationRequest, value)
        with self.store.tx(True) as db:
            turn = self._turn(db, request.turn_id)
            if turn['state'] != 'generating' or turn['ticket'] != request.ticket:
                raise ProductError('stale_generation')
            db.execute("UPDATE turns SET state='model_failed',ticket=NULL,error=? WHERE id=?",
                       (request.reason, request.turn_id))
            self.store.event(db, request.turn_id, 'model.failed', self.clock())
            return {'id': request.turn_id, 'state': 'model_failed', 'error': request.reason}

    def respond(self, turn_id):
        context = self.begin(turn_id)
        try:
            value = self.model.respond(context)
            return (self.accept(turn_id, context['ticket'], value.decision, provider_summary=value.displayable_summary)
                    if isinstance(value, ProviderReply) else self.accept(turn_id, context['ticket'], value))
        except Exception as exc:
            code = exc.code if isinstance(exc, ProductError) else 'model_failed'
            with self.store.tx(True) as db:
                db.execute("UPDATE turns SET state='model_failed',ticket=NULL,error=? WHERE id=? AND state='generating' AND ticket=?",
                           (code, turn_id, context['ticket']))
            return self.turn(turn_id)

    def execute(self, turn_id):
        """Only bounded existing local services. Stable action IDs survive partial commits/crashes."""
        with self.store.tx(True) as db:
            turn = self._turn(db, turn_id)
            if turn['state'] == 'cancelled':
                raise ProductError('permission_denied')
            grants = json.loads(turn['grants_json'])
            for row in db.execute('SELECT * FROM actions WHERE turn_id=? ORDER BY ordinal', (turn_id,)).fetchall():
                if row['state'] not in ('ready', 'outcome_unknown'):
                    continue
                if row['kind'] not in grants:
                    db.execute("UPDATE actions SET state='blocked',error='permission_revoked' WHERE id=?", (row['id'],))
                    continue
                self.store.event(db, turn_id, 'action.started', self.clock(), row['id'])
                try:
                    if row['kind'] == 'csv.audit':
                        result = self.workbench.submit({'command_id': row['id'], 'requirement_text': turn['text'], 'csv_text': turn['csv_text']})
                    else:
                        payload = json.loads(row['payload_json'])
                        result = self.workbench.profile.change({'command_id': row['id'], 'expected_revision': turn['profile_revision'], 'changes': payload['changes']})
                    db.execute("UPDATE actions SET state='accepted',result_json=?,error=NULL WHERE id=?", (result.model_dump_json(), row['id']))
                    self.store.event(db, turn_id, 'action.accepted', self.clock(), row['id'])
                except (LocalTaskError, PersonalAIError) as exc:
                    db.execute("UPDATE actions SET state='failed',error=? WHERE id=?", (exc.code, row['id']))
                    self.store.event(db, turn_id, 'action.failed', self.clock(), row['id'])
                except Exception:
                    # The external DB may have committed. A host must explicitly reconcile/replay this ID.
                    db.execute("UPDATE actions SET state='outcome_unknown',error='receipt_unknown' WHERE id=?", (row['id'],))
                    self.store.event(db, turn_id, 'action.outcome_unknown', self.clock(), row['id'])
                    break
            states = [row[0] for row in db.execute('SELECT state FROM actions WHERE turn_id=?', (turn_id,))]
            state = 'outcome_unknown' if 'outcome_unknown' in states else 'actions_recorded'
            if states:
                db.execute('UPDATE turns SET state=? WHERE id=?', (state, turn_id))
        return self.turn(turn_id)

    def revoke(self, turn_id):
        with self.store.tx(True) as db:
            self._turn(db, turn_id)
            self._revoke_db(db, turn_id)
            self.store.event(db, turn_id, 'interaction.cancelled', self.clock())
        # Previously submitted tasks remain visible; cancellation uses the actual task service.
        return self.turn(turn_id)

    @staticmethod
    def _revoke_db(db, turn_id):
        db.execute("UPDATE turns SET grants_json='[]',ticket=NULL,state='cancelled' WHERE id=?", (turn_id,))
        db.execute("UPDATE actions SET state='blocked',error='permission_revoked' WHERE turn_id=? AND state IN ('ready','outcome_unknown')", (turn_id,))
        db.execute("UPDATE followups SET state='cancelled',ticket=NULL,purpose='',reason='source_cancelled' WHERE source_id=? AND state IN ('pending','evaluating','needs_retry')", (turn_id,))

    def stop(self, value):
        """Durable permission revocation followed by idempotent cross-DB cancellation.

        A task cancel receipt means request/status only; it does not prove a worker exited.
        """
        request = validate(StopTurnRequest, value)
        with self.store.tx(True) as db:
            self._turn(db, request.turn_id)
            prior = db.execute('SELECT turn_id FROM stop_commands WHERE command_id=?',
                               (request.command_id,)).fetchone()
            if prior and prior['turn_id'] != request.turn_id:
                raise ProductError('idempotency_conflict')
            alias = db.execute('SELECT * FROM stop_aliases WHERE command_id=?',
                               (request.command_id,)).fetchone()
            if alias and alias['turn_id'] != request.turn_id:
                raise ProductError('idempotency_conflict')
            existing = db.execute('SELECT command_id FROM stop_commands WHERE turn_id=?',
                                  (request.turn_id,)).fetchone()
            effective_command = existing['command_id'] if existing else request.command_id
            if not existing:
                if alias:
                    raise ProductError('idempotency_conflict')
                db.execute('INSERT INTO stop_commands VALUES(?,?,?)',
                           (effective_command, request.turn_id, stamp(self.clock())))
                # Freeze known references before revocation changes action states. Any
                # unrecorded external submit remains unknown under its original action ID.
                for action in db.execute("""SELECT * FROM actions WHERE turn_id=? AND kind='csv.audit'
                                          AND state IN ('ready','outcome_unknown','accepted','blocked') ORDER BY ordinal""",
                                         (request.turn_id,)).fetchall():
                    task_id = None
                    if action['result_json']:
                        try:
                            task_id = json.loads(action['result_json'])['task']['task_id']
                        except (ValueError, KeyError, TypeError):
                            pass
                    db.execute('INSERT INTO stop_tasks VALUES(?,?,?,?,?,NULL)',
                               (effective_command, action['id'], task_id, str(uuid4()),
                                'cancel_pending' if task_id else 'needs_reconciliation'))
                self._revoke_db(db, request.turn_id)
                self.store.event(db, request.turn_id, 'interaction.stop_requested', self.clock())
            elif not prior and not alias:
                db.execute('INSERT INTO stop_aliases VALUES(?,?,?)',
                           (request.command_id, request.turn_id, effective_command))
        results = []
        with self.store.tx() as db:
            tasks = [dict(row) for row in db.execute('SELECT * FROM stop_tasks WHERE command_id=? ORDER BY action_id',
                                                     (effective_command,))]
        for task in tasks:
            item = {'action_id': task['action_id'], 'task_id': task['task_id'],
                    'cancel_command_id': task['cancel_command_id']}
            if task['task_id'] is None:
                item.update(cancel_requested=False, task_status='unknown', needs_reconciliation=True)
                results.append(item)
                continue
            receipt = json.loads(task['receipt_json']) if task['receipt_json'] else None
            if task['state'] != 'cancel_recorded':
                try:
                    receipt = self.workbench.cancel({'task_id': task['task_id'],
                                                     'command_id': task['cancel_command_id']}).model_dump(mode='json')
                    with self.store.tx(True) as db:
                        db.execute("UPDATE stop_tasks SET state='cancel_recorded',receipt_json=? WHERE command_id=? AND action_id=?",
                                   (canonical(receipt), effective_command, task['action_id']))
                except Exception:
                    # The task DB may have committed. Reopen and retry this same command ID.
                    receipt = None
            try:
                snapshot = self.workbench.get({'task_id': task['task_id']}).model_dump(mode='json')
                task_status = snapshot['status']
            except Exception:
                task_status = 'unknown'
            item.update(cancel_requested=receipt is not None, task_status=task_status,
                        cancel_receipt=receipt, needs_reconciliation=receipt is None)
            results.append(item)
        return {'turn_id': request.turn_id, 'command_id': effective_command,
                'permission_revoked': True, 'tasks': results,
                'worker_exited': None}

    def turn(self, turn_id):
        with self.store.tx() as db:
            turn = self._turn(db, turn_id)
            actions = []
            for row in db.execute('SELECT * FROM actions WHERE turn_id=? ORDER BY ordinal', (turn_id,)):
                item = {'id': row['id'], 'kind': row['kind'], 'state': row['state'], 'error': row['error']}
                if row['result_json']:
                    result = json.loads(row['result_json'])
                    if row['kind'] == 'csv.audit':
                        task_id = result['task']['task_id']
                        snapshot = self.workbench.get({'task_id': task_id})
                        item.update(task=snapshot.model_dump(mode='json'),
                                    events=self.workbench.events({'task_id': task_id}).model_dump(mode='json'))
                    else:
                        item['result'] = result
                actions.append(item)
            # Deliberately omit internal proactive schedules, tickets and grants from normal chat.
            return {'id': turn_id, 'conversation_id': turn['conversation_id'], 'text': turn['text'],
                    'state': turn['state'], 'reply': turn['reply'], 'error': turn['error'],
                    'provider_summary': turn['summary'], 'actions': actions,
                    'completion_source': 'tool_receipts',
                    'temporary': bool(turn['temporary'])}

    def events(self, after=0, limit=100):
        if type(after) is not int or after < 0 or type(limit) is not int or not 1 <= limit <= 200:
            raise ProductError('invalid_request')
        with self.store.tx() as db:
            return [dict(row) for row in db.execute('SELECT * FROM events WHERE seq>? ORDER BY seq LIMIT ?', (after, limit))]

    def recover(self):
        with self.store.tx(True) as db:
            count = db.execute("UPDATE turns SET state='model_failed',ticket=NULL,error='interrupted' WHERE state='generating'").rowcount
        return {'interrupted_model_turns': count, 'interrupted_followups': self.contact.recover()}

    def tick(self):
        """Called by the trusted local host, not installed as an OS/cloud scheduled task."""
        reminders = self.contact.deliver_reminders()
        job = self.contact.claim_due()
        if job is None:
            return {'reminders': reminders, 'followup': None}
        try:
            decision = self.model.reassess(job)
            result = self.contact.complete(job['id'], job['ticket'], decision)
        except Exception:
            result = self.contact.fail(job['id'], job['ticket'])
        return {'reminders': reminders, 'followup': result}

    def sync_task_messages(self):
        with self.store.tx(True) as db:
            count = 0
            for row in db.execute("SELECT turn_id,result_json FROM actions WHERE kind='csv.audit' AND state='accepted'").fetchall():
                task_id = json.loads(row['result_json'])['task']['task_id']
                task = self.workbench.get({'task_id': task_id})
                if task.status not in ('completed', 'failed', 'cancelled', 'interrupted'):
                    continue
                count += db.execute('INSERT OR IGNORE INTO inbox(id,dedupe_key,kind,text,source_id,reference_id,created_at) VALUES(?,?,?,?,?,?,?)',
                           (str(uuid4()), 'task:' + task.current_attempt_id + ':' + task.status, 'task',
                            '本地材料核对：' + task.status, row['turn_id'], task_id, stamp(self.clock()))).rowcount
            return count
