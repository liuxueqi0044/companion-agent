"""Single local journal for product state. Task/profile databases keep their authorities."""
from __future__ import annotations

from contextlib import contextmanager, closing
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import sqlite3

from .models import Policy, ProductError

V1_SCHEMA = '''
CREATE TABLE meta(singleton INTEGER PRIMARY KEY CHECK(singleton=1), version INTEGER NOT NULL,
 profile_id TEXT NOT NULL, policy_json TEXT NOT NULL);
CREATE TABLE turns(id TEXT PRIMARY KEY, request_hash TEXT NOT NULL, conversation_id TEXT NOT NULL,
 text TEXT NOT NULL, csv_text TEXT, temporary INTEGER NOT NULL, grants_json TEXT NOT NULL,
 profile_revision INTEGER NOT NULL, policy_revision INTEGER NOT NULL, state TEXT NOT NULL,
 ticket TEXT, reply TEXT, summary TEXT, error TEXT, created_at TEXT NOT NULL);
CREATE TABLE actions(id TEXT PRIMARY KEY, turn_id TEXT NOT NULL REFERENCES turns(id),
 ordinal INTEGER NOT NULL, kind TEXT NOT NULL, payload_json TEXT NOT NULL,
 state TEXT NOT NULL, result_json TEXT, error TEXT, UNIQUE(turn_id,ordinal));
CREATE TABLE memories(id TEXT PRIMARY KEY, source_id TEXT NOT NULL, category TEXT NOT NULL,
 content TEXT NOT NULL, revision INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
 UNIQUE(source_id,category,content));
CREATE TABLE excluded_sources(source_id TEXT PRIMARY KEY);
CREATE TABLE followups(id TEXT PRIMARY KEY, source_id TEXT NOT NULL UNIQUE REFERENCES turns(id),
 topic TEXT NOT NULL, purpose TEXT NOT NULL, due_at TEXT NOT NULL, expires_at TEXT NOT NULL,
 state TEXT NOT NULL, ticket TEXT, policy_revision INTEGER NOT NULL, reason TEXT,
 attempts INTEGER NOT NULL DEFAULT 0, context_cursor INTEGER);
CREATE TABLE blocked_topics(topic TEXT PRIMARY KEY);
CREATE TABLE inbox(id TEXT PRIMARY KEY, dedupe_key TEXT NOT NULL UNIQUE, kind TEXT NOT NULL,
 text TEXT NOT NULL, source_id TEXT, reference_id TEXT, created_at TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0);
CREATE TABLE reminders(id TEXT PRIMARY KEY, request_hash TEXT NOT NULL, text TEXT NOT NULL,
 due_at TEXT NOT NULL, state TEXT NOT NULL);
CREATE TABLE events(seq INTEGER PRIMARY KEY AUTOINCREMENT, turn_id TEXT, kind TEXT NOT NULL,
 reference_id TEXT, occurred_at TEXT NOT NULL);
CREATE TABLE experiences(revision INTEGER PRIMARY KEY AUTOINCREMENT, package_revision TEXT NOT NULL,
 source_hash TEXT NOT NULL, artifact_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE experience_head(singleton INTEGER PRIMARY KEY CHECK(singleton=1), revision INTEGER NOT NULL);
CREATE INDEX pending_followups ON followups(state,due_at);
CREATE INDEX conversation_turns ON turns(conversation_id,created_at);
'''

# The wire contract remains product-core/1. These additions are the single v2
# storage transition for CORE-002; v1 is retained solely for structural checks.
V2_ALTERS = (
    'ALTER TABLE turns ADD COLUMN context_signature TEXT',
    'ALTER TABLE turns ADD COLUMN context_cursor INTEGER',
    'ALTER TABLE followups ADD COLUMN context_signature TEXT',
    'ALTER TABLE reminders ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0)',
    '''CREATE TABLE reminder_commands(command_id TEXT PRIMARY KEY, request_hash TEXT NOT NULL,
       reminder_id TEXT NOT NULL, receipt_json TEXT NOT NULL)''',
    '''CREATE TABLE stop_commands(command_id TEXT PRIMARY KEY, turn_id TEXT NOT NULL UNIQUE REFERENCES turns(id),
       created_at TEXT NOT NULL)''',
    '''CREATE TABLE stop_aliases(command_id TEXT PRIMARY KEY, turn_id TEXT NOT NULL REFERENCES turns(id),
       primary_command_id TEXT NOT NULL REFERENCES stop_commands(command_id))''',
    '''CREATE TABLE stop_tasks(command_id TEXT NOT NULL REFERENCES stop_commands(command_id),
       action_id TEXT NOT NULL REFERENCES actions(id), task_id TEXT,
       cancel_command_id TEXT NOT NULL, state TEXT NOT NULL, receipt_json TEXT,
       PRIMARY KEY(command_id,action_id))''',
)


def _v1_shape(db):
    # GLOB keeps '_' literal. LIKE 'sqlite_%' also hides legal user objects
    # such as sqliteX_extra, whose migration triggers must be rejected.
    return {(row['type'], row['name']): row['sql'] for row in db.execute(
        "SELECT type,name,sql FROM sqlite_master WHERE type IN ('table','index','trigger','view') AND name NOT GLOB 'sqlite_*'")}


def _expected_v1_shape():
    with closing(sqlite3.connect(':memory:')) as db:
        db.row_factory = sqlite3.Row
        db.executescript(V1_SCHEMA)
        return _v1_shape(db)


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def stamp(now: datetime):
    if now.tzinfo is None or now.utcoffset().total_seconds() != 0:
        raise ProductError('invalid_clock')
    return now.isoformat(timespec='microseconds')


def guard(path: Path):
    """Reject symlinks/junctions on existing components. Not an OS sandbox."""
    path = Path(path).absolute()
    current = Path(path.anchor)
    for segment in path.parts[1:]:
        current /= segment
        if os.path.lexists(current):
            if current.is_symlink() or current.is_junction():
                raise ProductError('unsafe_path')
    return path


class ProductStore:
    def __init__(self, root: Path):
        self.root = guard(root)
        self.path = self.root / 'product.sqlite3'

    def _connect(self):
        guard(self.path)
        for suffix in ('-journal', '-wal', '-shm'):
            guard(Path(str(self.path) + suffix))
        if not self.path.is_file():
            raise ProductError('not_initialized')
        connection = sqlite3.connect(self.path.as_uri() + '?mode=rw', uri=True,
                                     isolation_level=None, timeout=5)
        connection.row_factory = sqlite3.Row
        connection.execute('PRAGMA foreign_keys=ON')
        return connection

    def bootstrap(self, profile_id: str):
        guard(self.path)
        if not self.path.exists():
            # Creation is explicit; existing corrupt files never get recreated.
            self.root.mkdir(parents=True, exist_ok=True)
            with closing(sqlite3.connect(self.path)) as db:
                if db.execute('SELECT COUNT(*) FROM sqlite_master').fetchone()[0] == 0:
                    db.executescript('BEGIN IMMEDIATE;\n' + V1_SCHEMA)
                    for statement in V2_ALTERS:
                        db.execute(statement)
                    db.execute('INSERT INTO meta VALUES(1,2,?,?)', (profile_id, Policy().model_dump_json()))
                    db.execute('INSERT INTO experience_head VALUES(1,0)')
                    db.commit()
        try:
            with closing(self._connect()) as db:
                meta = db.execute('SELECT * FROM meta WHERE singleton=1').fetchone()
                if meta is None or meta['profile_id'] != profile_id:
                    raise ProductError('identity_mismatch')
                if meta['version'] == 1:
                    raise ProductError('migration_required')
                if meta['version'] != 2:
                    raise ProductError('recovery_required')
        except sqlite3.Error as exc:
            raise ProductError('recovery_required') from exc

    def migrate(self, profile_id: str, expected_version: int, *, _fault=None):
        if type(expected_version) is not int or expected_version != 1:
            raise ProductError('invalid_request')
        try:
            with closing(self._connect()) as db:
                db.execute('BEGIN IMMEDIATE')
                meta = db.execute('SELECT * FROM meta WHERE singleton=1').fetchone()
                if meta is None or meta['profile_id'] != profile_id:
                    raise ProductError('identity_mismatch')
                if meta['version'] == 2:
                    db.rollback()
                    return {'state': 'already_current', 'version': 2}
                if meta['version'] != 1 or _v1_shape(db) != _expected_v1_shape():
                    raise ProductError('recovery_required')
                if db.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
                    raise ProductError('recovery_required')
                if db.execute('PRAGMA foreign_key_check').fetchone() is not None:
                    raise ProductError('recovery_required')
                self.policy(db)
                if db.execute('SELECT revision FROM experience_head WHERE singleton=1').fetchone() is None:
                    raise ProductError('recovery_required')
                for index, statement in enumerate(V2_ALTERS):
                    db.execute(statement)
                    if _fault is not None:
                        _fault(index)
                db.execute("UPDATE turns SET state='model_failed',ticket=NULL,error='interrupted' WHERE state='generating'")
                db.execute("UPDATE followups SET state='needs_retry',ticket=NULL,reason='interrupted' WHERE state='evaluating'")
                db.execute('UPDATE meta SET version=2 WHERE singleton=1')
                db.commit()
                return {'state': 'migrated', 'version': 2}
        except ProductError:
            raise
        except sqlite3.Error as exc:
            raise ProductError('recovery_required') from exc

    @contextmanager
    def tx(self, write=False):
        db = None
        try:
            db = self._connect()
            db.execute('BEGIN IMMEDIATE' if write else 'BEGIN')
            version = db.execute('SELECT version FROM meta WHERE singleton=1').fetchone()
            if version is not None and version[0] == 1:
                raise ProductError('migration_required')
            if version is None or version[0] != 2:
                raise ProductError('recovery_required')
            yield db
            db.commit()
        except sqlite3.Error as exc:
            if db is not None:
                db.rollback()
            code = 'busy' if 'locked' in str(exc).lower() else 'recovery_required'
            raise ProductError(code) from exc
        finally:
            if db is not None:
                db.close()

    @staticmethod
    def policy(db):
        try:
            return Policy.model_validate_json(db.execute('SELECT policy_json FROM meta WHERE singleton=1').fetchone()[0])
        except (ValueError, TypeError, IndexError) as exc:
            raise ProductError('recovery_required') from exc

    @staticmethod
    def event(db, turn_id, kind, now, reference_id=None):
        db.execute('INSERT INTO events(turn_id,kind,reference_id,occurred_at) VALUES(?,?,?,?)',
                   (turn_id, kind, reference_id, stamp(now)))

    def read_policy(self):
        with self.tx() as db:
            return self.policy(db)
