"""Versioned personal SELECT tools. Author SQL never sees the product database."""
from contextlib import closing, contextmanager
import csv
from datetime import datetime, timezone
import io
import json
import math
from pathlib import Path
import sqlite3
import time

from .models import ToolDefinition, ToolSaveAction, ToolManageRequest, ProductError, validate
from .store import canonical, digest, guard, stamp

SCHEMA = '''
CREATE TABLE meta(version INTEGER NOT NULL);
INSERT INTO meta VALUES(1);
CREATE TABLE tools(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,active_version INTEGER NOT NULL,enabled INTEGER NOT NULL);
CREATE TABLE versions(tool_id TEXT NOT NULL,version INTEGER NOT NULL,definition TEXT NOT NULL,sha256 TEXT NOT NULL,
 created_at TEXT NOT NULL,validation TEXT NOT NULL,PRIMARY KEY(tool_id,version));
CREATE TABLE commands(id TEXT PRIMARY KEY,request_hash TEXT NOT NULL,receipt TEXT NOT NULL);
'''
FUNCTIONS = set('abs avg coalesce count format glob ifnull iif instr length like lower ltrim max min nullif printf replace round rtrim substr substring sum total trim typeof unicode upper char concat concat_ws json json_array json_object json_extract json_type json_valid json_array_length group_concat string_agg num'.split())


def csv_input(text):
    if text is None:
        return [], []
    if not isinstance(text, str) or len(text.encode('utf-8')) > 256*1024:
        raise ProductError('tool_input_too_large')
    try:
        rows = list(csv.reader(io.StringIO(text.lstrip('\ufeff'), newline=''), strict=True))
    except csv.Error as exc:
        raise ProductError('tool_invalid_csv') from exc
    if not rows or not rows[0] or len(rows[0]) > 40 or len(rows) > 2001:
        raise ProductError('tool_invalid_csv')
    columns = rows[0]
    if any(not c.strip() or len(c) > 100 or '\x00' in c for c in columns) or len({c.casefold() for c in columns}) != len(columns):
        raise ProductError('tool_invalid_csv')
    if any(len(row) != len(columns) or any('\x00' in cell for cell in row) for row in rows[1:]):
        raise ProductError('tool_invalid_csv')
    return columns, rows[1:]


def query(definition, csv_text, parameters):
    """One bounded read-only SQLite statement over explicit inputs, not a Python sandbox."""
    definition = validate(ToolDefinition, definition)
    if not isinstance(parameters, dict) or set(parameters) != {p.name for p in definition.parameters}:
        raise ProductError('tool_parameters_invalid')
    for p in definition.parameters:
        v = parameters[p.name]
        if p.type == 'text' and (not isinstance(v, str) or len(v.encode()) > 16384):
            raise ProductError('tool_parameters_invalid')
        if p.type == 'number' and (type(v) not in (int, float) or not math.isfinite(v) or abs(v) > 1e15):
            raise ProductError('tool_parameters_invalid')
    return query_sql(definition.sql, csv_text, parameters)


def query_sql(sql, csv_text, parameters):
    """Shared execution primitive; callers validate their typed SQL request first."""
    columns, rows = csv_input(csv_text)
    deadline, ticks = time.monotonic()+1.0, 0
    def progress():
        nonlocal ticks
        ticks += 1
        return ticks > 1000 or time.monotonic() > deadline
    def authorize(action, first, second, database, source):
        if action in (sqlite3.SQLITE_SELECT, sqlite3.SQLITE_RECURSIVE):
            return sqlite3.SQLITE_OK
        if action == sqlite3.SQLITE_READ and first == 'data' and database == 'main':
            return sqlite3.SQLITE_OK
        if action == sqlite3.SQLITE_FUNCTION and second in FUNCTIONS:
            return sqlite3.SQLITE_OK
        return sqlite3.SQLITE_DENY
    def number(value):
        result = float(value)
        if not math.isfinite(result) or abs(result) > 1e15:
            raise ValueError('invalid_number')
        return result
    try:
        with closing(sqlite3.connect(':memory:')) as db:
            db.setlimit(sqlite3.SQLITE_LIMIT_LENGTH, 128*1024)
            db.setlimit(sqlite3.SQLITE_LIMIT_SQL_LENGTH, 16384)
            db.setlimit(sqlite3.SQLITE_LIMIT_COLUMN, 40)
            db.setlimit(sqlite3.SQLITE_LIMIT_EXPR_DEPTH, 50)
            db.setlimit(sqlite3.SQLITE_LIMIT_COMPOUND_SELECT, 10)
            db.setlimit(sqlite3.SQLITE_LIMIT_ATTACHED, 0)
            db.setlimit(sqlite3.SQLITE_LIMIT_VARIABLE_NUMBER, 64)
            db.execute('PRAGMA temp_store=MEMORY')
            db.execute('PRAGMA trusted_schema=OFF')
            quoted = ['"'+c.replace('"', '""')+'" TEXT' for c in columns]
            db.execute('CREATE TABLE data ('+','.join(quoted or ['_empty TEXT'])+')')
            if rows:
                db.executemany('INSERT INTO data VALUES('+','.join('?' for _ in columns)+')', rows)
            db.create_function('num', 1, number, deterministic=True)
            db.set_authorizer(authorize)
            db.set_progress_handler(progress, 1000)
            cursor = db.execute(sql, parameters)
            if not cursor.description:
                raise ProductError('tool_query_rejected')
            names = [col[0] for col in cursor.description]
            if len(set(names)) != len(names):
                raise ProductError('tool_duplicate_columns')
            values = cursor.fetchmany(1001)
            if len(values) > 1000:
                raise ProductError('tool_output_too_large')
            output = [dict(zip(names, row)) for row in values]
            if any(type(v) not in (str, int, float, type(None)) or isinstance(v, float) and not math.isfinite(v) for row in output for v in row.values()):
                raise ProductError('tool_output_invalid')
            if len(canonical(output).encode()) > 48*1024:
                raise ProductError('tool_output_too_large')
            return {'columns': names, 'rows': output, 'input_rows': len(rows)}
    except (sqlite3.Error, OverflowError, ValueError) as exc:
        code = 'tool_query_limit' if ticks > 1000 or time.monotonic() > deadline else 'tool_query_rejected'
        raise ProductError(code) from exc


def verify(definition):
    definition = validate(ToolDefinition, definition)
    for sample in definition.examples:
        actual = query(definition, sample.csv_text, sample.parameters)
        if actual['rows'] != sample.expected:
            raise ProductError('tool_example_failed')
    return {'passed': len(definition.examples), 'engine': 'sqlite-select/1', 'sqlite': sqlite3.sqlite_version,
            'meaning': 'supplied examples passed; not a proof for every input'}


class ToolLibrary:
    def __init__(self, root, clock=None):
        self.path = guard(Path(root)/'tools.sqlite3')
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    def bootstrap(self):
        guard(self.path)
        if not self.path.exists():
            with closing(sqlite3.connect(self.path)) as db:
                db.executescript('BEGIN IMMEDIATE;'+SCHEMA+'COMMIT;')
        with self.tx() as db:
            if db.execute('SELECT version FROM meta').fetchall() != [(1,)]:
                raise ProductError('tool_store_invalid')

    @contextmanager
    def tx(self, write=False):
        guard(self.path)
        for suffix in ('-wal', '-shm', '-journal'):
            guard(Path(str(self.path)+suffix))
        if not self.path.is_file():
            raise ProductError('tool_store_unavailable')
        try:
            with closing(sqlite3.connect(self.path.as_uri()+'?mode=rw', uri=True, timeout=5)) as db:
                db.execute('BEGIN IMMEDIATE' if write else 'BEGIN')
                yield db
                db.commit()
        except sqlite3.Error as exc:
            raise ProductError('tool_store_invalid') from exc

    @staticmethod
    def _read(db, tool_id):
        head = db.execute('SELECT revision,active_version,enabled FROM tools WHERE id=?', (tool_id,)).fetchone()
        if head is None:
            raise ProductError('tool_not_found')
        row = db.execute('SELECT definition,sha256,validation FROM versions WHERE tool_id=? AND version=?', (tool_id, head[1])).fetchone()
        if row is None:
            raise ProductError('tool_store_invalid')
        try:
            definition = json.loads(row[0])
            validation = json.loads(row[2])
        except (ValueError, TypeError) as exc:
            raise ProductError('tool_store_invalid') from exc
        if digest(definition) != row[1]:
            raise ProductError('tool_store_invalid')
        return {'id': tool_id, 'revision': head[0], 'version': head[1], 'enabled': bool(head[2]),
                'definition': definition, 'sha256': row[1], 'validation': validation}

    @staticmethod
    def summary(value):
        return {k:value[k] for k in ('id','revision','version','enabled','sha256','validation')} | {
            k:value['definition'][k] for k in ('name','description','parameters')}

    def catalog(self):
        with self.tx() as db:
            return [self.summary(self._read(db, row[0])) for row in db.execute('SELECT id FROM tools ORDER BY rowid DESC LIMIT 40').fetchall()]

    def read(self, tool_id):
        with self.tx() as db:
            value = self._read(db, tool_id)
            value['versions'] = [{'version':r[0],'sha256':r[1],'created_at':r[2]} for r in db.execute(
                'SELECT version,sha256,created_at FROM versions WHERE tool_id=? ORDER BY version DESC', (tool_id,))]
            return value

    @staticmethod
    def prior(db, command_id, fingerprint):
        row = db.execute('SELECT request_hash,receipt FROM commands WHERE id=?', (command_id,)).fetchone()
        if row:
            if row[0] != fingerprint:
                raise ProductError('idempotency_conflict')
            return json.loads(row[1])

    def save(self, command_id, payload):
        action = validate(ToolSaveAction, payload)
        fingerprint = digest(action.model_dump(mode='json'))
        # Idempotent replay does not create another version or rerun arbitrary work.
        with self.tx() as db:
            old = self.prior(db, command_id, fingerprint)
            if old is not None:
                return old
        evidence = verify(action.definition)
        definition = action.definition.model_dump(mode='json')
        with self.tx(True) as db:
            old = self.prior(db, command_id, fingerprint)
            if old is not None:
                return old
            tool_id = action.tool_id or command_id
            if action.tool_id:
                current = self._read(db, tool_id)
                if current['revision'] != action.expected_revision:
                    raise ProductError('tool_revision_conflict')
                version = db.execute('SELECT MAX(version)+1 FROM versions WHERE tool_id=?', (tool_id,)).fetchone()[0]
                if version > 30:
                    raise ProductError('tool_version_limit')
                db.execute('UPDATE tools SET revision=revision+1,active_version=? WHERE id=?', (version, tool_id))
            else:
                if db.execute('SELECT COUNT(*) FROM tools').fetchone()[0] >= 40:
                    raise ProductError('tool_library_full')
                version = 1
                db.execute('INSERT INTO tools VALUES(?,1,1,1)', (tool_id,))
            db.execute('INSERT INTO versions VALUES(?,?,?,?,?,?)', (tool_id,version,canonical(definition),digest(definition),stamp(self.clock()),canonical(evidence)))
            receipt = self.summary(self._read(db, tool_id))
            db.execute('INSERT INTO commands VALUES(?,?,?)',(command_id,fingerprint,canonical(receipt)))
            return receipt

    def manage(self, payload):
        command = validate(ToolManageRequest, payload)
        fingerprint = digest(command.model_dump(mode='json'))
        with self.tx(True) as db:
            old = self.prior(db, command.command_id, fingerprint)
            if old is not None:
                return old
            current = self._read(db, command.tool_id)
            if current['revision'] != command.expected_revision:
                raise ProductError('tool_revision_conflict')
            version = current['version']
            if command.operation == 'restore':
                row = db.execute('SELECT definition,sha256 FROM versions WHERE tool_id=? AND version=?',(command.tool_id,command.version)).fetchone()
                if row is None or digest(json.loads(row[0])) != row[1]:
                    raise ProductError('tool_version_invalid')
                verify(json.loads(row[0]))
                version = command.version
            enabled = current['enabled'] if command.operation == 'restore' else command.operation == 'enable'
            db.execute('UPDATE tools SET revision=revision+1,active_version=?,enabled=? WHERE id=?',(version,int(enabled),command.tool_id))
            receipt = self.summary(self._read(db, command.tool_id))
            db.execute('INSERT INTO commands VALUES(?,?,?)',(command.command_id,fingerprint,canonical(receipt)))
            return receipt

    def run(self, tool_id, version, parameters, csv_text):
        # Pin immutable source while state changes are serialized; author query uses a separate DB.
        with self.tx() as db:
            value = self._read(db, tool_id)
            if not value['enabled']:
                raise ProductError('tool_disabled')
            if value['version'] != version:
                raise ProductError('tool_revision_conflict')
            result = query(value['definition'], csv_text, parameters)
        return {'tool':self.summary(value), **result}
