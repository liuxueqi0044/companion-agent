"""Transactional task, attempt, result and event store for one fixed local tool."""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import sqlite3
from typing import Iterator
from uuid import uuid4

from pydantic import ValidationError

from .models import (ActionReceipt, Attempt, AuditResult, EventPage, EventsRequest,
                     ListRequest, LocalTaskError, ResultPage, ResultRequest, SubmitRequest,
                     TaskEvent, TaskPage, TaskSnapshot, utc)


MARKER = "local-task/1"
DB_VERSION = 1
TABLES = {"metadata", "tasks", "attempts", "events", "commands", "results"}
TERMINAL = {"completed", "failed", "cancelled", "interrupted"}


def canonical(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def digest(value: object) -> str:
    return "sha256:" + hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()


def stamp(now: datetime) -> str:
    return utc(now).isoformat()


@dataclass(frozen=True)
class Claim:
    task: TaskSnapshot
    attempt_id: str
    requirement_text: str
    csv_text: str


class SQLiteTaskRepository:
    def __init__(self, db_path: Path, *, timeout_seconds: float = 0.5,
                 before_result_insert=None):
        self.db_path = Path(db_path)
        self.timeout_seconds = timeout_seconds
        self.before_result_insert = before_result_insert  # test-only transaction fault

    @staticmethod
    def _db_error(exc: sqlite3.Error) -> None:
        if isinstance(exc, sqlite3.OperationalError) and any(
                text in str(exc).lower() for text in ("locked", "busy")):
            raise LocalTaskError("busy") from exc
        raise LocalTaskError("recovery_required") from exc

    def _connect(self) -> sqlite3.Connection:
        if not self.db_path.is_file():
            raise LocalTaskError("not_initialized")
        try:
            connection = sqlite3.connect(self.db_path.resolve().as_uri() + "?mode=rw",
                                         uri=True, isolation_level=None,
                                         timeout=self.timeout_seconds)
            connection.row_factory = sqlite3.Row
            connection.execute("PRAGMA foreign_keys=ON")
            connection.execute(f"PRAGMA busy_timeout={int(self.timeout_seconds * 1000)}")
            return connection
        except sqlite3.Error as exc:
            self._db_error(exc)

    @staticmethod
    def _inspect(connection: sqlite3.Connection) -> None:
        if connection.execute("PRAGMA user_version").fetchone()[0] != DB_VERSION:
            raise LocalTaskError("recovery_required")
        if connection.execute("PRAGMA integrity_check(1)").fetchone()[0] != "ok":
            raise LocalTaskError("recovery_required")
        if connection.execute("PRAGMA foreign_key_check").fetchone() is not None:
            raise LocalTaskError("recovery_required")
        found = {row[0] for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
        if found != TABLES:
            raise LocalTaskError("recovery_required")
        marker = connection.execute("SELECT value FROM metadata WHERE key='schema_version'").fetchall()
        if len(marker) != 1 or marker[0][0] != MARKER:
            raise LocalTaskError("recovery_required")
        broken = connection.execute("""
            SELECT COUNT(*) FROM tasks t LEFT JOIN attempts a ON a.attempt_id=t.current_attempt_id
            WHERE a.attempt_id IS NULL OR a.task_id<>t.task_id OR a.ordinal<>t.attempt_count
               OR t.last_seq<>(SELECT COALESCE(MAX(e.seq),0) FROM events e WHERE e.task_id=t.task_id)
               OR t.last_seq<>(SELECT COUNT(*) FROM events e WHERE e.task_id=t.task_id)
               OR t.attempt_count<>(SELECT COUNT(*) FROM attempts a2 WHERE a2.task_id=t.task_id)
               OR t.status<>(SELECT e.status FROM events e WHERE e.task_id=t.task_id
                              ORDER BY e.seq DESC LIMIT 1)
               OR (t.status='queued' AND a.status<>'queued')
               OR (t.status IN ('running','cancelling') AND a.status<>'running')
               OR (t.status IN ('completed','failed','cancelled','interrupted') AND a.status<>t.status)
               OR (t.status='completed' AND NOT EXISTS
                    (SELECT 1 FROM results r WHERE r.attempt_id=a.attempt_id))
        """).fetchone()[0]
        invalid_results = connection.execute("""SELECT COUNT(*) FROM results r
            LEFT JOIN attempts a ON a.attempt_id=r.attempt_id
            WHERE a.attempt_id IS NULL OR a.task_id<>r.task_id OR a.status<>'completed'""").fetchone()[0]
        invalid_status = connection.execute("""SELECT COUNT(*) FROM tasks
            WHERE status NOT IN ('queued','running','cancelling','completed','failed','cancelled','interrupted')
               OR executor<>'local_csv_audit' OR tool_version<>'csv_audit/1'""").fetchone()[0]
        if broken or invalid_results or invalid_status:
            raise LocalTaskError("recovery_required")

    @contextmanager
    def _tx(self, *, write: bool = False) -> Iterator[sqlite3.Connection]:
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE" if write else "BEGIN")
            self._inspect(connection)
            yield connection
            connection.execute("COMMIT")
        except LocalTaskError:
            connection.rollback()
            raise
        except (ValidationError, ValueError, TypeError, KeyError) as exc:
            connection.rollback()
            raise LocalTaskError("recovery_required") from exc
        except sqlite3.Error as exc:
            connection.rollback()
            self._db_error(exc)
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def bootstrap(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        creator = False
        try:
            fd = os.open(self.db_path, os.O_CREAT | os.O_EXCL | os.O_RDWR, 0o600)
            os.close(fd)
            creator = True
        except FileExistsError:
            pass
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            version = connection.execute("PRAGMA user_version").fetchone()[0]
            if version == DB_VERSION:
                self._inspect(connection)
                connection.commit()
                return
            if not creator or version != 0 or connection.execute(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table'").fetchone()[0]:
                raise LocalTaskError("recovery_required")
            statements = (
                "CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL) STRICT",
                """CREATE TABLE tasks(task_id TEXT PRIMARY KEY,profile_id TEXT NOT NULL,
                    profile_revision INTEGER NOT NULL,input_hash TEXT NOT NULL,
                    requirement_text TEXT NOT NULL,csv_text TEXT NOT NULL,
                    executor TEXT NOT NULL,tool_version TEXT NOT NULL,
                    status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
                    last_seq INTEGER NOT NULL,current_attempt_id TEXT NOT NULL,
                    attempt_count INTEGER NOT NULL) STRICT""",
                """CREATE TABLE attempts(attempt_id TEXT PRIMARY KEY,task_id TEXT NOT NULL,
                    ordinal INTEGER NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,
                    started_at TEXT,ended_at TEXT,error_code TEXT,
                    UNIQUE(task_id,ordinal),FOREIGN KEY(task_id) REFERENCES tasks(task_id)) STRICT""",
                """CREATE TABLE events(task_id TEXT NOT NULL,seq INTEGER NOT NULL,kind TEXT NOT NULL,
                    status TEXT NOT NULL,attempt_id TEXT NOT NULL,occurred_at TEXT NOT NULL,
                    PRIMARY KEY(task_id,seq),FOREIGN KEY(task_id) REFERENCES tasks(task_id),
                    FOREIGN KEY(attempt_id) REFERENCES attempts(attempt_id)) STRICT""",
                """CREATE TABLE commands(command_id TEXT PRIMARY KEY,operation TEXT NOT NULL,
                    request_hash TEXT NOT NULL,task_id TEXT NOT NULL,
                    FOREIGN KEY(task_id) REFERENCES tasks(task_id)) STRICT""",
                """CREATE TABLE results(attempt_id TEXT PRIMARY KEY,task_id TEXT NOT NULL,
                    result_json TEXT NOT NULL,FOREIGN KEY(task_id) REFERENCES tasks(task_id),
                    FOREIGN KEY(attempt_id) REFERENCES attempts(attempt_id)) STRICT""",
            )
            for statement in statements:
                connection.execute(statement)
            connection.execute("PRAGMA user_version=1")
            connection.execute("INSERT INTO metadata VALUES('schema_version',?)", (MARKER,))
            connection.commit()
        except LocalTaskError:
            connection.rollback()
            raise
        except sqlite3.Error as exc:
            connection.rollback()
            self._db_error(exc)
        finally:
            connection.close()

    @staticmethod
    def _snapshot(connection: sqlite3.Connection, task_id: str) -> TaskSnapshot:
        row = connection.execute("SELECT * FROM tasks WHERE task_id=?", (task_id,)).fetchone()
        if row is None:
            raise LocalTaskError("not_found")
        attempt = connection.execute("SELECT error_code FROM attempts WHERE attempt_id=?",
                                     (row["current_attempt_id"],)).fetchone()
        if attempt is None:
            raise LocalTaskError("recovery_required")
        return TaskSnapshot.model_validate_json(canonical({
            **{key: row[key] for key in TaskSnapshot.model_fields if key in row.keys()},
            "error_code": attempt["error_code"]}))

    @staticmethod
    def _event(connection: sqlite3.Connection, task_id: str, kind: str,
               status: str, attempt_id: str, at: str) -> None:
        row = connection.execute("SELECT last_seq FROM tasks WHERE task_id=?", (task_id,)).fetchone()
        seq = row[0] + 1
        connection.execute("UPDATE tasks SET status=?,updated_at=?,last_seq=? WHERE task_id=?",
                           (status, at, seq, task_id))
        connection.execute("INSERT INTO events VALUES(?,?,?,?,?,?)",
                           (task_id, seq, kind, status, attempt_id, at))

    @staticmethod
    def _command(connection: sqlite3.Connection, command_id: str, operation: str,
                 request_hash: str) -> str | None:
        row = connection.execute("SELECT * FROM commands WHERE command_id=?", (command_id,)).fetchone()
        if row is None:
            return None
        if row["operation"] != operation or row["request_hash"] != request_hash:
            raise LocalTaskError("idempotency_conflict")
        return row["task_id"]

    def submit(self, request: SubmitRequest, profile_id: str,
               profile_revision: int, now: datetime) -> ActionReceipt:
        at = stamp(now)
        body_hash = digest(request.model_dump(exclude={"command_id"}))
        with self._tx(write=True) as connection:
            old = self._command(connection, request.command_id, "submit", body_hash)
            if old is not None:
                original = connection.execute("""SELECT requirement_text,csv_text,executor,tool_version
                    FROM tasks WHERE task_id=?""", (old,)).fetchone()
                if original is None or digest(dict(original)) != body_hash:
                    raise LocalTaskError("recovery_required")
                return ActionReceipt(task=self._snapshot(connection, old), replayed=True,
                                     disposition="replayed")
            task_id, attempt_id = str(uuid4()), str(uuid4())
            input_hash = digest({"profile_id": profile_id, "profile_revision": profile_revision,
                                 **request.model_dump(exclude={"command_id"})})
            connection.execute("""INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (task_id, profile_id, profile_revision, input_hash, request.requirement_text,
                 request.csv_text, request.executor, request.tool_version, "queued", at, at,
                 1, attempt_id, 1))
            connection.execute("INSERT INTO attempts VALUES(?,?,?,?,?,?,?,?)",
                               (attempt_id, task_id, 1, "queued", at, None, None, None))
            connection.execute("INSERT INTO events VALUES(?,?,?,?,?,?)",
                               (task_id, 1, "submitted", "queued", attempt_id, at))
            connection.execute("INSERT INTO commands VALUES(?,?,?,?)",
                               (request.command_id, "submit", body_hash, task_id))
            return ActionReceipt(task=self._snapshot(connection, task_id))

    def get(self, task_id: str) -> TaskSnapshot:
        with self._tx() as connection:
            return self._snapshot(connection, task_id)

    def attempts(self, task_id: str) -> list[Attempt]:
        with self._tx() as connection:
            self._snapshot(connection, task_id)
            rows = connection.execute("SELECT * FROM attempts WHERE task_id=? ORDER BY ordinal",
                                      (task_id,)).fetchall()
            return [Attempt.model_validate_json(canonical(dict(row))) for row in rows]

    def list(self, request: ListRequest) -> TaskPage:
        with self._tx() as connection:
            args: list[object] = []
            where = ""
            if request.before_task_id is not None:
                cursor = connection.execute("SELECT created_at,task_id FROM tasks WHERE task_id=?",
                                            (request.before_task_id,)).fetchone()
                if cursor is None:
                    raise LocalTaskError("invalid_cursor")
                where = "WHERE (created_at,task_id)<(?,?)"
                args.extend(cursor)
            rows = connection.execute(f"SELECT task_id FROM tasks {where} ORDER BY created_at DESC,task_id DESC LIMIT ?",
                                      (*args, request.limit + 1)).fetchall()
            items = [self._snapshot(connection, row[0]) for row in rows[:request.limit]]
            return TaskPage(items=items,
                            next_before_task_id=items[-1].task_id if len(rows) > request.limit else None)

    def events(self, request: EventsRequest) -> EventPage:
        with self._tx() as connection:
            task = self._snapshot(connection, request.task_id)
            rows = connection.execute("""SELECT * FROM events WHERE task_id=? AND seq>?
                ORDER BY seq LIMIT ?""", (request.task_id, request.after_seq,
                                           request.limit + 1)).fetchall()
            items = [TaskEvent.model_validate_json(canonical(dict(row)))
                     for row in rows[:request.limit]]
            return EventPage(task_id=request.task_id, items=items, last_seq=task.last_seq,
                             next_after_seq=items[-1].seq if len(rows) > request.limit else None)

    def result(self, request: ResultRequest) -> ResultPage:
        with self._tx() as connection:
            task = self._snapshot(connection, request.task_id)
            if task.status != "completed":
                raise LocalTaskError("not_ready")
            row = connection.execute("SELECT result_json FROM results WHERE attempt_id=?",
                                     (task.current_attempt_id,)).fetchone()
            if row is None:
                raise LocalTaskError("recovery_required")
            result = AuditResult.model_validate_json(row[0])
            source_text = connection.execute("SELECT csv_text FROM tasks WHERE task_id=?",
                                             (task.task_id,)).fetchone()[0]
        from .csv_audit import validate_result
        try:
            validate_result(result, source_text)
        except LocalTaskError as exc:
            raise LocalTaskError("recovery_required") from exc
        if result.input_hash != task.input_hash:
            raise LocalTaskError("recovery_required")
        try:
            metadata = result.model_dump(mode="json", exclude={"rows", "issues"})
            selected = result.rows[request.offset:request.offset + request.limit]
            next_offset = request.offset + len(selected)
            selected_issues = result.issues[request.issue_offset:
                                            request.issue_offset + request.issue_limit]
            next_issue_offset = request.issue_offset + len(selected_issues)
            return ResultPage(task_id=task.task_id, attempt_id=task.current_attempt_id,
                              metadata=metadata, rows=selected,
                              next_offset=next_offset if next_offset < len(result.rows) else None,
                              issues=selected_issues,
                              next_issue_offset=(next_issue_offset if next_issue_offset <
                                                 len(result.issues) else None))
        except (ValidationError, ValueError, TypeError) as exc:
            raise LocalTaskError("recovery_required") from exc

    def cancel(self, task_id: str, command_id: str, now: datetime) -> ActionReceipt:
        at = stamp(now)
        body_hash = digest({"task_id": task_id})
        with self._tx(write=True) as connection:
            old = self._command(connection, command_id, "cancel", body_hash)
            if old is not None:
                return ActionReceipt(task=self._snapshot(connection, old), replayed=True,
                                     disposition="replayed")
            task = self._snapshot(connection, task_id)
            disposition = "applied"
            if task.status == "queued":
                connection.execute("UPDATE attempts SET status='cancelled',ended_at=? WHERE attempt_id=?",
                                   (at, task.current_attempt_id))
                self._event(connection, task_id, "cancelled", "cancelled", task.current_attempt_id, at)
            elif task.status == "running":
                self._event(connection, task_id, "cancel_requested", "cancelling",
                            task.current_attempt_id, at)
            elif task.status == "cancelling":
                disposition = "already_requested"
            else:
                disposition = "too_late"
            connection.execute("INSERT INTO commands VALUES(?,?,?,?)",
                               (command_id, "cancel", body_hash, task_id))
            return ActionReceipt(task=self._snapshot(connection, task_id), disposition=disposition)

    def retry(self, task_id: str, command_id: str, now: datetime) -> ActionReceipt:
        at = stamp(now)
        body_hash = digest({"task_id": task_id})
        with self._tx(write=True) as connection:
            old = self._command(connection, command_id, "retry", body_hash)
            if old is not None:
                return ActionReceipt(task=self._snapshot(connection, old), replayed=True,
                                     disposition="replayed")
            task = self._snapshot(connection, task_id)
            if task.status not in {"failed", "interrupted"}:
                raise LocalTaskError("invalid_transition")
            attempt_id = str(uuid4())
            ordinal = task.attempt_count + 1
            connection.execute("UPDATE tasks SET current_attempt_id=?,attempt_count=? WHERE task_id=?",
                               (attempt_id, ordinal, task_id))
            connection.execute("INSERT INTO attempts VALUES(?,?,?,?,?,?,?,?)",
                               (attempt_id, task_id, ordinal, "queued", at, None, None, None))
            self._event(connection, task_id, "retried", "queued", attempt_id, at)
            connection.execute("INSERT INTO commands VALUES(?,?,?,?)",
                               (command_id, "retry", body_hash, task_id))
            return ActionReceipt(task=self._snapshot(connection, task_id))

    def claim_next(self, now: datetime) -> Claim | None:
        at = stamp(now)
        with self._tx(write=True) as connection:
            if connection.execute("SELECT 1 FROM tasks WHERE status IN ('running','cancelling') LIMIT 1").fetchone():
                raise LocalTaskError("busy")
            row = connection.execute("""SELECT * FROM tasks WHERE status='queued'
                ORDER BY created_at,task_id LIMIT 1""").fetchone()
            if row is None:
                return None
            task_id, attempt_id = row["task_id"], row["current_attempt_id"]
            updated = connection.execute("""UPDATE attempts SET status='running',started_at=?
                WHERE attempt_id=? AND task_id=? AND status='queued'""",
                (at, attempt_id, task_id))
            if updated.rowcount != 1:
                raise LocalTaskError("recovery_required")
            self._event(connection, task_id, "started", "running", attempt_id, at)
            return Claim(task=self._snapshot(connection, task_id), attempt_id=attempt_id,
                         requirement_text=row["requirement_text"], csv_text=row["csv_text"])

    def is_cancelling(self, task_id: str, attempt_id: str) -> bool:
        with self._tx() as connection:
            task = self._snapshot(connection, task_id)
            if task.current_attempt_id != attempt_id:
                raise LocalTaskError("stale_attempt")
            if task.status not in {"running", "cancelling"}:
                raise LocalTaskError("stale_attempt")
            return task.status == "cancelling"

    def publish(self, task_id: str, attempt_id: str, now: datetime,
                *, result: AuditResult | None = None, error_code: str | None = None,
                cancelled: bool = False) -> TaskSnapshot:
        at = stamp(now)
        if result is not None:
            # Source checking is bounded and occurs before acquiring the write transaction.
            from .csv_audit import validate_result
            with self._tx() as read_connection:
                row = read_connection.execute("SELECT csv_text,input_hash FROM tasks WHERE task_id=?",
                                              (task_id,)).fetchone()
                if row is None:
                    raise LocalTaskError("not_found")
                source_text, source_hash = row["csv_text"], row["input_hash"]
            if result.input_hash != source_hash:
                raise LocalTaskError("invalid_result")
            validate_result(result, source_text)
        with self._tx(write=True) as connection:
            task = self._snapshot(connection, task_id)
            if task.current_attempt_id != attempt_id or task.status not in {"running", "cancelling"}:
                raise LocalTaskError("stale_attempt")
            if task.status == "cancelling" and not cancelled:
                raise LocalTaskError("cancel_pending")
            if cancelled and task.status != "cancelling":
                raise LocalTaskError("invalid_transition")
            if cancelled:
                status, kind = "cancelled", "cancelled"
            elif error_code is not None:
                status, kind = "failed", "failed"
            elif result is not None:
                if result.input_hash != task.input_hash or result.tool_version != task.tool_version:
                    raise LocalTaskError("invalid_result")
                status, kind = "completed", "completed"
                if self.before_result_insert is not None:
                    self.before_result_insert()
                connection.execute("INSERT INTO results VALUES(?,?,?)",
                                   (attempt_id, task_id, result.model_dump_json()))
            else:
                raise LocalTaskError("invalid_result")
            connection.execute("UPDATE attempts SET status=?,ended_at=?,error_code=? WHERE attempt_id=?",
                               (status, at, error_code, attempt_id))
            self._event(connection, task_id, kind, status, attempt_id, at)
            return self._snapshot(connection, task_id)

    def recover_running(self, now: datetime) -> list[TaskSnapshot]:
        at = stamp(now)
        with self._tx(write=True) as connection:
            rows = connection.execute("SELECT task_id,current_attempt_id FROM tasks WHERE status IN ('running','cancelling') ORDER BY created_at,task_id").fetchall()
            result = []
            for row in rows:
                connection.execute("UPDATE attempts SET status='interrupted',ended_at=?,error_code='worker_lost' WHERE attempt_id=?",
                                   (at, row["current_attempt_id"]))
                self._event(connection, row["task_id"], "interrupted", "interrupted",
                            row["current_attempt_id"], at)
                result.append(self._snapshot(connection, row["task_id"]))
            return result
