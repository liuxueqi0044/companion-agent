"""One managed local MemoryPort. No second semantic/vector memory runtime."""
from __future__ import annotations

from typing import Protocol
from uuid import uuid4

from .models import MemorySuggestion, Policy, ProductError, validate
from .store import ProductStore


class MemoryPort(Protocol):
    def retrieve(self) -> list[dict]: ...
    def list(self) -> list[dict]: ...


class ManagedMemory:
    def __init__(self, store: ProductStore, clock):
        self.store, self.clock = store, clock

    @staticmethod
    def _bump(db, policy):
        current = policy.model_copy(update={'revision': policy.revision + 1})
        db.execute('UPDATE meta SET policy_json=? WHERE singleton=1', (current.model_dump_json(),))
        return current

    def configure(self, expected_revision: int, value):
        requested = validate(Policy, value)
        with self.store.tx(True) as db:
            current = self.store.policy(db)
            if type(expected_revision) is not int or expected_revision != current.revision or requested.revision != expected_revision:
                raise ProductError('revision_conflict')
            updated = requested.model_copy(update={'revision': current.revision + 1})
            db.execute('UPDATE meta SET policy_json=? WHERE singleton=1', (updated.model_dump_json(),))
            # A rule change never lets old queued/model output become newly authorized.
            if (not updated.proactive_enabled or (current.memory_enabled and not updated.memory_enabled)
                    or set(current.topics) - set(updated.topics)
                    or set(current.memory_categories) - set(updated.memory_categories)):
                db.execute("UPDATE followups SET state='cancelled',ticket=NULL,reason='policy_changed',purpose='' WHERE state IN ('pending','evaluating','needs_retry')")
            else:
                db.execute("UPDATE followups SET state='pending',ticket=NULL,reason='policy_changed' WHERE state='evaluating'")
            self.store.event(db, None, 'policy.changed', self.clock())
            return updated

    @staticmethod
    def context(db, policy):
        if not policy.memory_enabled or not policy.memory_categories:
            return []
        placeholders = ','.join('?' for _ in policy.memory_categories)
        return [dict(row) for row in db.execute(
            'SELECT id,source_id,category,content,revision FROM memories WHERE deleted=0 AND category IN ('
            + placeholders + ') ORDER BY rowid DESC LIMIT 48', policy.memory_categories)]

    def retrieve(self):
        with self.store.tx() as db:
            return self.context(db, self.store.policy(db))

    def list(self, limit=200, before=None):
        if type(limit) is not int or not 1 <= limit <= 200 or (before is not None and (type(before) is not int or before <= 0)):
            raise ProductError('invalid_request')
        with self.store.tx() as db:
            return [dict(row) for row in db.execute(
                'SELECT rowid AS cursor,id,source_id,category,content,revision FROM memories WHERE deleted=0 AND (? IS NULL OR rowid<?) ORDER BY rowid DESC LIMIT ?',
                (before, before, limit))]

    def clear(self, expected_policy_revision):
        with self.store.tx(True) as db:
            policy = self.store.policy(db)
            if type(expected_policy_revision) is not int or policy.revision != expected_policy_revision:
                raise ProductError('revision_conflict')
            db.execute('INSERT OR IGNORE INTO excluded_sources SELECT DISTINCT source_id FROM memories')
            # Remove content while keeping per-source tombstones to block automatic relearning.
            db.execute('DELETE FROM memories')
            self._bump(db, policy)
            db.execute("UPDATE followups SET state='cancelled',ticket=NULL,reason='memory_cleared',purpose='' WHERE state IN ('pending','evaluating','needs_retry')")
            self.store.event(db, None, 'memory.cleared', self.clock())
            return {'cleared': True, 'policy_revision': policy.revision + 1}

    def add(self, content: str, category='preferences'):
        value = validate(MemorySuggestion, {'content': content, 'category': category})
        entry_id = str(uuid4())
        with self.store.tx(True) as db:
            db.execute('INSERT INTO memories(id,source_id,category,content,revision) VALUES(?,?,?,?,1)',
                       (entry_id, 'manual:' + entry_id, value.category, value.content))
            self._bump(db, self.store.policy(db))
            self.store.event(db, None, 'memory.added', self.clock(), entry_id)
        return {'id': entry_id, 'revision': 1}

    def edit(self, entry_id: str, expected_revision: int, content: str):
        with self.store.tx(True) as db:
            row = db.execute('SELECT * FROM memories WHERE id=? AND deleted=0', (entry_id,)).fetchone()
            if row is None:
                raise ProductError('not_found')
            if type(expected_revision) is not int or row['revision'] != expected_revision:
                raise ProductError('revision_conflict')
            value = validate(MemorySuggestion, {'category': row['category'], 'content': content})
            db.execute('UPDATE memories SET content=?,revision=revision+1 WHERE id=?', (value.content, entry_id))
            self._bump(db, self.store.policy(db))
            # Pending plans may have been derived from a prior model context containing this record.
            db.execute("UPDATE followups SET state='cancelled',ticket=NULL,reason='memory_changed',purpose='' WHERE state IN ('pending','evaluating','needs_retry')")
            self.store.event(db, None, 'memory.edited', self.clock(), entry_id)
            return {'id': entry_id, 'revision': expected_revision + 1}

    def forget(self, entry_id: str, expected_revision: int):
        with self.store.tx(True) as db:
            row = db.execute('SELECT * FROM memories WHERE id=?', (entry_id,)).fetchone()
            if row is None:
                raise ProductError('not_found')
            if row['deleted']:
                return {'id': entry_id, 'deleted': True}
            if type(expected_revision) is not int or row['revision'] != expected_revision:
                raise ProductError('revision_conflict')
            db.execute('DELETE FROM memories WHERE source_id=? AND deleted=1', (row['source_id'],))
            db.execute("UPDATE memories SET content='',deleted=1,revision=revision+1 WHERE id=?", (entry_id,))
            db.execute('INSERT OR IGNORE INTO excluded_sources VALUES(?)', (row['source_id'],))
            self._bump(db, self.store.policy(db))
            db.execute("UPDATE followups SET state='cancelled',ticket=NULL,reason='memory_forgotten',purpose='' WHERE state IN ('pending','evaluating','needs_retry')")
            self.store.event(db, None, 'memory.forgotten', self.clock(), entry_id)
            return {'id': entry_id, 'deleted': True}

    @staticmethod
    def accept_suggestions(db, policy, turn, suggestions):
        if not policy.memory_enabled or turn['temporary'] or db.execute(
                'SELECT 1 FROM excluded_sources WHERE source_id=?', (turn['id'],)).fetchone():
            return
        for item in suggestions:
            if item.category not in policy.memory_categories:
                continue
            db.execute('INSERT OR IGNORE INTO memories(id,source_id,category,content,revision) VALUES(?,?,?,?,1)',
                       (str(uuid4()), turn['id'], item.category, item.content))
