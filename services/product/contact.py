"""Persistent, model-timed follow-ups. No schedule announcement in conversation projections."""
from __future__ import annotations

from datetime import datetime, timedelta
import json
import re
from uuid import uuid4

from .memory import ManagedMemory
from .context import contact_context, cursor
from .models import (ContactCompleteRequest, ContactFailGenerationRequest, ContactIdRequest,
                     FollowUpDecision, ProductError, ReminderCreateRequest,
                     ReminderIdRequest, ReminderListRequest, ReminderReviseRequest,
                     validate, resolve_timezone)
from .store import ProductStore, stamp, digest


class ContactService:
    def __init__(self, store: ProductStore, clock):
        self.store, self.clock = store, clock

    @staticmethod
    def can_contact(policy, now):
        if not policy.proactive_enabled or (policy.paused_until and now < policy.paused_until):
            return False
        local = now.astimezone(resolve_timezone(policy.timezone))
        minute = local.hour * 60 + local.minute
        start, end = policy.start_minute, policy.end_minute
        return start <= minute < end if start < end else minute >= start or minute < end

    @staticmethod
    def daily_count(db, policy, now):
        today = now.astimezone(resolve_timezone(policy.timezone)).date()
        # Bounded by records in the last 48 hours, accommodating UTC offsets and DST.
        rows = db.execute("SELECT created_at FROM inbox WHERE kind='proactive' AND created_at>=?",
                          (stamp(now - timedelta(hours=48)),))
        return sum(datetime.fromisoformat(row[0]).astimezone(resolve_timezone(policy.timezone)).date() == today for row in rows)

    @staticmethod
    def evaluation_count(db, policy, now):
        today = now.astimezone(resolve_timezone(policy.timezone)).date()
        rows = db.execute("SELECT occurred_at FROM events WHERE kind='contact.evaluating' AND occurred_at>=?",
                          (stamp(now-timedelta(hours=48)),))
        return sum(datetime.fromisoformat(row[0]).astimezone(resolve_timezone(policy.timezone)).date() == today for row in rows)

    @staticmethod
    def propose(db, policy, turn, suggestion, now):
        if suggestion is None:
            return
        if (not policy.proactive_enabled or turn['temporary'] or suggestion.topic not in policy.topics
                or db.execute('SELECT 1 FROM blocked_topics WHERE topic=?', (suggestion.topic,)).fetchone()
                or db.execute('SELECT 1 FROM excluded_sources WHERE source_id=?', (turn['id'],)).fetchone()):
            return
        if not now < suggestion.due_at < suggestion.expires_at <= now + timedelta(days=7):
            raise ProductError('invalid_followup_window')
        db.execute('''INSERT INTO followups(id,source_id,topic,purpose,due_at,expires_at,state,policy_revision)
                      VALUES(?,?,?,?,?,?,'pending',?)''',
                   (str(uuid4()), turn['id'], suggestion.topic, suggestion.purpose,
                    stamp(suggestion.due_at), stamp(suggestion.expires_at), policy.revision))

    def controls(self):
        """User-requested management only; never injected as a chat scheduling receipt."""
        with self.store.tx() as db:
            return {'policy': self.store.policy(db).model_dump(mode='json'),
                    'blocked_topics': [row[0] for row in db.execute('SELECT topic FROM blocked_topics ORDER BY topic')]}

    def inspect_plans(self):
        with self.store.tx() as db:
            return [dict(row) for row in db.execute(
                'SELECT id,source_id,topic,purpose,due_at,expires_at,state,reason FROM followups ORDER BY due_at DESC LIMIT 100')]

    def cancel(self, plan_id):
        with self.store.tx(True) as db:
            row = db.execute('SELECT state FROM followups WHERE id=?', (plan_id,)).fetchone()
            if row is None:
                raise ProductError('not_found')
            if row[0] not in ('sent', 'cancelled', 'expired'):
                db.execute("UPDATE followups SET state='cancelled',ticket=NULL,reason='user_cancelled',purpose='' WHERE id=?", (plan_id,))
            return {'id': plan_id, 'state': db.execute('SELECT state FROM followups WHERE id=?', (plan_id,)).fetchone()[0]}

    def block_topic(self, topic):
        if topic not in ('work', 'daily', 'wellbeing'):
            raise ProductError('invalid_request')
        with self.store.tx(True) as db:
            db.execute('INSERT OR IGNORE INTO blocked_topics VALUES(?)', (topic,))
            db.execute("UPDATE followups SET state='cancelled',ticket=NULL,reason='topic_blocked',purpose='' WHERE topic=? AND state IN ('pending','evaluating','needs_retry')", (topic,))
        return self.controls()

    def unblock_topic(self, topic):
        if topic not in ('work', 'daily', 'wellbeing'):
            raise ProductError('invalid_request')
        with self.store.tx(True) as db:
            db.execute('DELETE FROM blocked_topics WHERE topic=?', (topic,))
        return self.controls()  # Old cancelled plans remain cancelled.

    def claim_due(self):
        now = self.clock()
        with self.store.tx(True) as db:
            db.execute("UPDATE followups SET state='expired',ticket=NULL,reason='expired',purpose='' WHERE state IN ('pending','evaluating','needs_retry') AND expires_at<=?", (stamp(now),))
            policy = self.store.policy(db)
            if (not self.can_contact(policy, now) or self.daily_count(db, policy, now) >= policy.daily_limit
                    or self.evaluation_count(db, policy, now) >= policy.daily_evaluation_limit):
                return None
            # Only one in-flight automatic generation per device/profile.
            if db.execute("SELECT 1 FROM followups WHERE state='evaluating'").fetchone():
                return None
            row = db.execute("SELECT * FROM followups WHERE state='pending' AND due_at<=? ORDER BY due_at,id LIMIT 1", (stamp(now),)).fetchone()
            if row is None:
                return None
            if row['attempts'] >= 3:
                db.execute("UPDATE followups SET state='cancelled',ticket=NULL,purpose='',reason='reevaluation_limit' WHERE id=?",
                           (row['id'],))
                return None
            source = db.execute('SELECT * FROM turns WHERE id=?', (row['source_id'],)).fetchone()
            if row['topic'] not in policy.topics or db.execute('SELECT 1 FROM blocked_topics WHERE topic=?', (row['topic'],)).fetchone():
                db.execute("UPDATE followups SET state='cancelled',reason='scope_changed',purpose='' WHERE id=?", (row['id'],))
                return None
            ticket = str(uuid4())
            self.store.event(db, None, 'contact.evaluating', now, row['id'])
            context, signature = contact_context(db, row, policy)
            db.execute("""UPDATE followups SET state='evaluating',ticket=?,policy_revision=?,context_cursor=?,
                       context_signature=?,attempts=attempts+1 WHERE id=?""",
                       (ticket, policy.revision, cursor(db, source['conversation_id']), signature, row['id']))
            return {'id': row['id'], 'ticket': ticket, **context, 'now': stamp(now)}

    def complete(self, plan_id, ticket, value):
        decision = validate(FollowUpDecision, value)
        now = self.clock()
        with self.store.tx(True) as db:
            row = db.execute('SELECT * FROM followups WHERE id=?', (plan_id,)).fetchone()
            if row is None or row['state'] != 'evaluating' or row['ticket'] != ticket:
                raise ProductError('stale_generation')
            policy = self.store.policy(db)
            conversation = db.execute('SELECT conversation_id FROM turns WHERE id=?', (row['source_id'],)).fetchone()[0]
            _, signature = contact_context(db, row, policy)
            if (policy.revision != row['policy_revision'] or cursor(db, conversation) != row['context_cursor']
                    or signature != row['context_signature']):
                db.execute("UPDATE followups SET state='pending',ticket=NULL,reason='context_changed' WHERE id=?", (plan_id,))
                return {'state': 'pending', 'reason': 'context_changed'}
            if stamp(now) >= row['expires_at']:
                db.execute("UPDATE followups SET state='expired',ticket=NULL,purpose='',reason='expired' WHERE id=?", (plan_id,))
                return {'state': 'expired'}
            if not self.can_contact(policy, now) or self.daily_count(db, policy, now) >= policy.daily_limit:
                db.execute("UPDATE followups SET state='pending',ticket=NULL,reason='delivery_window' WHERE id=?", (plan_id,))
                return {'state': 'pending', 'reason': 'delivery_window'}
            if decision.disposition == 'defer':
                if not now < decision.due_at < datetime.fromisoformat(row['expires_at']):
                    raise ProductError('invalid_followup_window')
                if row['attempts'] >= 3:
                    db.execute("UPDATE followups SET state='cancelled',ticket=NULL,purpose='',reason='reevaluation_limit' WHERE id=?", (plan_id,))
                    return {'state': 'cancelled'}
                db.execute("UPDATE followups SET state='pending',ticket=NULL,due_at=?,reason=? WHERE id=?", (stamp(decision.due_at), decision.reason, plan_id))
                return {'state': 'pending'}
            if decision.disposition == 'cancel':
                db.execute("UPDATE followups SET state='cancelled',ticket=NULL,purpose='',reason=? WHERE id=?", (decision.reason, plan_id))
                return {'state': 'cancelled'}
            message_id = str(uuid4())
            db.execute('INSERT INTO inbox(id,dedupe_key,kind,text,source_id,reference_id,created_at) VALUES(?,?,?,?,?,?,?)',
                       (message_id, 'followup:' + plan_id, 'proactive', decision.text, row['source_id'], plan_id, stamp(now)))
            db.execute("UPDATE followups SET state='sent',ticket=NULL,purpose='',reason=? WHERE id=?", (decision.reason, plan_id))
            self.store.event(db, None, 'contact.delivered', now, message_id)
            return {'state': 'sent', 'message_id': message_id}

    def read_plan(self, value):
        """A small durable receipt, never the unsent plan or generation context."""
        request = validate(ContactIdRequest, value)
        with self.store.tx() as db:
            row = db.execute('SELECT id,state,reason FROM followups WHERE id=?', (request.id,)).fetchone()
            if row is None:
                raise ProductError('not_found')
            if row['state'] not in ('pending', 'evaluating', 'needs_retry', 'sent',
                                    'cancelled', 'expired'):
                raise ProductError('recovery_required')
            messages = db.execute('''SELECT id FROM inbox WHERE kind='proactive' AND reference_id=?
                                  AND dedupe_key=? LIMIT 2''',
                                  (request.id, 'followup:' + request.id)).fetchall()
            if len(messages) != (1 if row['state'] == 'sent' else 0):
                raise ProductError('recovery_required')
            reason = row['reason']
            if reason is not None and not re.fullmatch(r'[a-z][a-z0-9_]{0,63}', reason):
                raise ProductError('recovery_required')
            return {'id': request.id, 'state': row['state'], 'reason': reason,
                    'message_id': messages[0]['id'] if messages else None}

    def complete_bound(self, value):
        request = validate(ContactCompleteRequest, value)
        committed = self.complete(request.id, request.ticket, request.decision)
        receipt = self.read_plan({'id': request.id})
        if 'reason' in committed:
            expected_reason = committed['reason']
        elif committed['state'] == 'expired':
            expected_reason = 'expired'
        elif committed['state'] == 'cancelled' and request.decision.disposition == 'defer':
            expected_reason = 'reevaluation_limit'
        else:
            expected_reason = request.decision.reason
        if receipt['state'] != committed['state'] or (committed.get('message_id') is not None
                and receipt['message_id'] != committed['message_id']) or receipt['reason'] != expected_reason:
            raise ProductError('outcome_unknown')
        return receipt

    def fail_generation(self, value):
        request = validate(ContactFailGenerationRequest, value)
        with self.store.tx(True) as db:
            row = db.execute('SELECT state,ticket FROM followups WHERE id=?', (request.id,)).fetchone()
            if row is None or row['state'] != 'evaluating' or row['ticket'] != request.ticket:
                raise ProductError('stale_generation')
            db.execute("UPDATE followups SET state='needs_retry',ticket=NULL,reason=? WHERE id=?",
                       (request.reason, request.id))
            return {'id': request.id, 'state': 'needs_retry', 'reason': request.reason,
                    'message_id': None}

    def fail(self, plan_id, ticket):
        with self.store.tx(True) as db:
            db.execute("UPDATE followups SET state='needs_retry',ticket=NULL,reason='model_unavailable' WHERE id=? AND ticket=? AND state='evaluating'", (plan_id, ticket))
            row = db.execute('SELECT state,reason FROM followups WHERE id=?', (plan_id,)).fetchone()
            return dict(row) if row else {'state': 'not_found'}

    def recover(self):
        """Explicit host restart recovery. Invalidates old generation tickets; no blind retries."""
        with self.store.tx(True) as db:
            return db.execute("UPDATE followups SET state='needs_retry',ticket=NULL,reason='interrupted' WHERE state='evaluating'").rowcount

    def retry(self, plan_id):
        with self.store.tx(True) as db:
            row = db.execute('SELECT * FROM followups WHERE id=?', (plan_id,)).fetchone()
            if row is None or row['state'] != 'needs_retry' or row['attempts'] >= 3:
                raise ProductError('invalid_transition')
            db.execute("UPDATE followups SET state='pending',ticket=NULL WHERE id=?", (plan_id,))

    def remind(self, command_id, text, due_at):
        request = validate(ReminderCreateRequest, {'command_id': command_id, 'text': text,
                                                   'due_at': due_at.isoformat() if isinstance(due_at, datetime) else due_at})
        body = {'text': request.text, 'due_at': stamp(request.due_at)}
        with self.store.tx(True) as db:
            prior = db.execute('SELECT * FROM reminders WHERE id=?', (request.command_id,)).fetchone()
            if prior:
                if prior['request_hash'] != digest(body):
                    raise ProductError('idempotency_conflict')
                return self._reminder(prior)
            if request.due_at <= self.clock():
                raise ProductError('invalid_reminder_time')
            db.execute("INSERT INTO reminders(id,request_hash,text,due_at,state,revision) VALUES(?,?,?,?,'pending',1)",
                       (request.command_id, digest(body), request.text, stamp(request.due_at)))
            return self._reminder(db.execute('SELECT * FROM reminders WHERE id=?', (request.command_id,)).fetchone())

    @staticmethod
    def _reminder(row):
        return {key: row[key] for key in ('id', 'text', 'due_at', 'state', 'revision')}

    def read_reminder(self, value):
        request = validate(ReminderIdRequest, value)
        with self.store.tx() as db:
            row = db.execute('SELECT * FROM reminders WHERE id=?', (request.id,)).fetchone()
            if row is None:
                raise ProductError('not_found')
            return self._reminder(row)

    def list_reminders(self, value):
        request = validate(ReminderListRequest, value)
        with self.store.tx() as db:
            rows = db.execute('''SELECT rowid AS cursor,* FROM reminders
                WHERE (? IS NULL OR rowid<?) ORDER BY rowid DESC LIMIT ?''',
                (request.before, request.before, request.limit + 1)).fetchall()
            more = len(rows) > request.limit
            items = [{'cursor': row['cursor'], **self._reminder(row)} for row in rows[:request.limit]]
            return {'items': items, 'next_before': items[-1]['cursor'] if more else None}

    def revise_reminder(self, value):
        request = validate(ReminderReviseRequest, value)
        body = request.model_dump(mode='json', exclude_none=True)
        fingerprint = digest(body)
        with self.store.tx(True) as db:
            prior = db.execute('SELECT * FROM reminder_commands WHERE command_id=?',
                               (request.command_id,)).fetchone()
            if prior:
                if prior['request_hash'] != fingerprint:
                    raise ProductError('idempotency_conflict')
                return json.loads(prior['receipt_json'])
            row = db.execute('SELECT * FROM reminders WHERE id=?', (request.id,)).fetchone()
            if row is None:
                raise ProductError('not_found')
            if row['revision'] != request.expected_revision:
                raise ProductError('revision_conflict')
            if row['state'] != 'pending':
                raise ProductError('invalid_transition')
            if request.operation == 'update':
                if request.due_at <= self.clock():
                    raise ProductError('invalid_reminder_time')
                db.execute('UPDATE reminders SET text=?,due_at=?,revision=revision+1 WHERE id=?',
                           (request.text, stamp(request.due_at), request.id))
            else:
                db.execute("UPDATE reminders SET state='cancelled',revision=revision+1 WHERE id=?", (request.id,))
            receipt = self._reminder(db.execute('SELECT * FROM reminders WHERE id=?', (request.id,)).fetchone())
            db.execute('INSERT INTO reminder_commands VALUES(?,?,?,?)',
                       (request.command_id, fingerprint, request.id, json.dumps(receipt, ensure_ascii=False)))
            return receipt

    def deliver_reminders(self):
        now = self.clock()
        delivered = []
        with self.store.tx(True) as db:
            for row in db.execute("SELECT * FROM reminders WHERE state='pending' AND due_at<=? ORDER BY due_at LIMIT 100", (stamp(now),)).fetchall():
                missed = now - datetime.fromisoformat(row['due_at']) > timedelta(minutes=5)
                message_id = str(uuid4())
                db.execute('INSERT INTO inbox(id,dedupe_key,kind,text,reference_id,created_at) VALUES(?,?,?,?,?,?)',
                           (message_id, 'reminder:' + row['id'], 'missed_reminder' if missed else 'reminder', row['text'], row['id'], stamp(now)))
                db.execute('UPDATE reminders SET state=?,revision=revision+1 WHERE id=?',
                           ('missed' if missed else 'delivered', row['id']))
                delivered.append(message_id)
        return delivered

    def cancel_reminder(self, reminder_id):
        request = validate(ReminderIdRequest, {'id': reminder_id})
        with self.store.tx(True) as db:
            count = db.execute("UPDATE reminders SET state='cancelled',revision=revision+1 WHERE id=? AND state='pending'",
                               (request.id,)).rowcount
            return {'cancelled': count == 1}

    def inbox(self, after_row=0, limit=50):
        if type(after_row) is not int or after_row < 0 or type(limit) is not int or not 1 <= limit <= 100:
            raise ProductError('invalid_request')
        with self.store.tx() as db:
            return [dict(row) for row in db.execute('SELECT rowid AS cursor,* FROM inbox WHERE rowid>? ORDER BY rowid LIMIT ?', (after_row, limit))]

    def mark_read(self, message_id):
        with self.store.tx(True) as db:
            db.execute('UPDATE inbox SET read=1 WHERE id=?', (message_id,))

    def explain(self, message_id):
        with self.store.tx() as db:
            row = db.execute('SELECT * FROM inbox WHERE id=?', (message_id,)).fetchone()
            if row is None:
                raise ProductError('not_found')
            return {'kind': row['kind'], 'source_id': row['source_id'], 'reference_id': row['reference_id'],
                    'basis': 'opt_in_and_model_reassessment' if row['kind'] == 'proactive' else 'user_requested_work'}
