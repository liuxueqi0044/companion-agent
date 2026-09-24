"""Narrow, local single-user SQLite repository. No network or implicit initialization."""

from __future__ import annotations

from datetime import datetime
import json
import os
from pathlib import Path
import sqlite3
import time
from typing import Callable, Protocol
from uuid import uuid4

from pydantic import ValidationError

from .models import (
    ChangeRequest, CommandReceipt, HistoryPage, HistoryRequest, PersonalAIError,
    PreferenceRevision, Preferences, ProfileSnapshot, UndoRequest,
)


DB_VERSION = 1
MARKER = "personal-ai-local/1"
TABLE_COLUMNS = {
    "metadata": ("key", "value"),
    "profile": ("singleton", "profile_id", "head_revision"),
    "revisions": ("revision", "profile_id", "operation", "target_revision",
                  "command_id", "preferences_json", "created_at"),
    "commands": ("command_id", "request_json", "operation", "result_revision",
                 "result_snapshot_json"),
}


class PersonalAIRepository(Protocol):
    def bootstrap(self, now: datetime) -> ProfileSnapshot: ...
    def read(self) -> ProfileSnapshot: ...
    def change(self, request: ChangeRequest, now: datetime) -> CommandReceipt: ...
    def undo(self, request: UndoRequest, now: datetime) -> CommandReceipt: ...
    def history(self, request: HistoryRequest) -> HistoryPage: ...


def _encoded(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _timestamp(now: datetime) -> str:
    if now.tzinfo is None or now.utcoffset().total_seconds() != 0:
        raise PersonalAIError("invalid_request")
    return now.isoformat()


class SQLitePersonalAIRepository:
    def __init__(self, db_path: Path, *, timeout_seconds: float = 0.5,
                 after_revision_insert: Callable[[], None] | None = None):
        self.db_path = Path(db_path)
        self.timeout_seconds = timeout_seconds
        # Test-only failure injection; production construction leaves this unset.
        self._after_revision_insert = after_revision_insert

    def _connect(self) -> sqlite3.Connection:
        if not self.db_path.is_file():
            raise PersonalAIError("not_initialized")
        try:
            connection = sqlite3.connect(self.db_path.resolve().as_uri() + "?mode=rw",
                                         uri=True, timeout=self.timeout_seconds,
                                         isolation_level=None)
            connection.execute("PRAGMA foreign_keys=ON")
            connection.execute(f"PRAGMA busy_timeout={max(0, int(self.timeout_seconds * 1000))}")
            connection.row_factory = sqlite3.Row
            return connection
        except sqlite3.Error as exc:
            self._raise_db(exc)

    @staticmethod
    def _raise_db(exc: sqlite3.Error) -> None:
        message = str(exc).lower()
        if isinstance(exc, sqlite3.OperationalError) and ("locked" in message or "busy" in message):
            raise PersonalAIError("busy") from exc
        raise PersonalAIError("recovery_required") from exc

    def _inspect(self, connection: sqlite3.Connection) -> tuple[str, int]:
        if connection.execute("PRAGMA user_version").fetchone()[0] != DB_VERSION:
            raise PersonalAIError("recovery_required")
        if connection.execute("PRAGMA integrity_check(1)").fetchone()[0] != "ok":
            raise PersonalAIError("recovery_required")
        if connection.execute("PRAGMA foreign_key_check").fetchone() is not None:
            raise PersonalAIError("recovery_required")
        found = {row[0] for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
        if found != set(TABLE_COLUMNS):
            raise PersonalAIError("recovery_required")
        for table, columns in TABLE_COLUMNS.items():
            actual = tuple(row[1] for row in connection.execute(f"PRAGMA table_info({table})"))
            if actual != columns:
                raise PersonalAIError("recovery_required")
        marker = connection.execute("SELECT value FROM metadata WHERE key='schema_version'").fetchall()
        if len(marker) != 1 or marker[0][0] != MARKER:
            raise PersonalAIError("recovery_required")
        rows = connection.execute("SELECT profile_id,head_revision FROM profile WHERE singleton=1").fetchall()
        if len(rows) != 1 or connection.execute("SELECT COUNT(*) FROM profile").fetchone()[0] != 1:
            raise PersonalAIError("recovery_required")
        profile_id, head = rows[0]
        aggregate = connection.execute("SELECT MIN(revision),MAX(revision),COUNT(*) FROM revisions").fetchone()
        if not isinstance(head, int) or head < 1 or tuple(aggregate) != (1, head, head):
            raise PersonalAIError("recovery_required")
        if connection.execute("SELECT COUNT(*) FROM revisions WHERE profile_id<>?", (profile_id,)).fetchone()[0]:
            raise PersonalAIError("recovery_required")
        mismatched = connection.execute("""
            SELECT COUNT(*) FROM revisions r LEFT JOIN commands c ON r.command_id=c.command_id
            WHERE (r.operation='bootstrap' AND (r.revision<>1 OR r.command_id IS NOT NULL))
               OR (r.operation<>'bootstrap' AND
                   (r.command_id IS NULL OR c.command_id IS NULL
                    OR c.result_revision<>r.revision OR c.operation<>r.operation))
        """).fetchone()[0]
        orphaned = connection.execute("""
            SELECT COUNT(*) FROM commands c LEFT JOIN revisions r ON c.result_revision=r.revision
            WHERE r.revision IS NULL OR r.command_id IS NULL OR r.command_id<>c.command_id
               OR r.operation<>c.operation
        """).fetchone()[0]
        if mismatched or orphaned or connection.execute(
                "SELECT COUNT(*) FROM commands").fetchone()[0] != head - 1:
            raise PersonalAIError("recovery_required")
        return profile_id, head

    @staticmethod
    def _revision(row: sqlite3.Row) -> PreferenceRevision:
        try:
            value = json.loads(row["preferences_json"])
            return PreferenceRevision.model_validate({
                "revision": row["revision"], "operation": row["operation"],
                "target_revision": row["target_revision"], "command_id": row["command_id"],
                "preferences": value, "created_at": datetime.fromisoformat(row["created_at"]),
            })
        except (ValueError, TypeError, ValidationError, OverflowError) as exc:
            raise PersonalAIError("recovery_required") from exc

    def _snapshot(self, connection: sqlite3.Connection,
                  profile_id: str, revision: int) -> ProfileSnapshot:
        row = connection.execute("SELECT * FROM revisions WHERE revision=? AND profile_id=?",
                                 (revision, profile_id)).fetchone()
        if row is None:
            raise PersonalAIError("recovery_required")
        record = self._revision(row)
        try:
            return ProfileSnapshot(profile_id=profile_id, revision=revision,
                                   preferences=record.preferences, updated_at=record.created_at)
        except ValidationError as exc:
            raise PersonalAIError("recovery_required") from exc

    def _create_schema(self, connection: sqlite3.Connection, now: datetime) -> ProfileSnapshot:
        # execute(), unlike executescript(), does not commit the surrounding transaction.
        for statement in (
            "CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT",
            """CREATE TABLE profile(singleton INTEGER PRIMARY KEY CHECK(singleton=1),
                profile_id TEXT NOT NULL UNIQUE, head_revision INTEGER NOT NULL CHECK(head_revision>=1),
                FOREIGN KEY(head_revision) REFERENCES revisions(revision)
                    DEFERRABLE INITIALLY DEFERRED) STRICT""",
            """CREATE TABLE revisions(revision INTEGER PRIMARY KEY CHECK(revision>=1),
                profile_id TEXT NOT NULL, operation TEXT NOT NULL
                    CHECK(operation IN ('bootstrap','change','undo')),
                target_revision INTEGER, command_id TEXT UNIQUE, preferences_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(profile_id) REFERENCES profile(profile_id),
                FOREIGN KEY(target_revision) REFERENCES revisions(revision)) STRICT""",
            """CREATE TABLE commands(command_id TEXT PRIMARY KEY, request_json TEXT NOT NULL,
                operation TEXT NOT NULL CHECK(operation IN ('change','undo')),
                result_revision INTEGER NOT NULL, result_snapshot_json TEXT NOT NULL,
                FOREIGN KEY(result_revision) REFERENCES revisions(revision)) STRICT""",
        ):
            connection.execute(statement)
        connection.execute("PRAGMA user_version=1")
        connection.execute("INSERT INTO metadata(key,value) VALUES('schema_version',?)", (MARKER,))
        profile_id = str(uuid4())
        preferences = Preferences()
        stamp = _timestamp(now)
        connection.execute("INSERT INTO profile(singleton,profile_id,head_revision) VALUES(1,?,1)",
                           (profile_id,))
        connection.execute("""INSERT INTO revisions(revision,profile_id,operation,target_revision,
            command_id,preferences_json,created_at) VALUES(1,?,'bootstrap',NULL,NULL,?,?)""",
            (profile_id, _encoded(preferences.model_dump()), stamp))
        return ProfileSnapshot(profile_id=profile_id, revision=1,
                               preferences=preferences, updated_at=now)

    def bootstrap(self, now: datetime) -> ProfileSnapshot:
        _timestamp(now)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        creator = False
        try:
            fd = os.open(self.db_path, os.O_CREAT | os.O_EXCL | os.O_RDWR, 0o600)
            os.close(fd)
            creator = True
        except FileExistsError:
            pass
        deadline = time.monotonic() + max(0.5, self.timeout_seconds * 3)
        while True:
            connection = self._connect()
            try:
                connection.execute("BEGIN IMMEDIATE")
                version = connection.execute("PRAGMA user_version").fetchone()[0]
                if version == DB_VERSION:
                    profile_id, head = self._inspect(connection)
                    result = self._snapshot(connection, profile_id, head)
                    connection.execute("COMMIT")
                    return result
                if version == 0 and creator and connection.execute(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table'").fetchone()[0] == 0:
                    result = self._create_schema(connection, now)
                    connection.execute("COMMIT")
                    return result
                connection.execute("ROLLBACK")
                if version == 0 and not creator and time.monotonic() < deadline:
                    time.sleep(0.02)
                    continue
                raise PersonalAIError("recovery_required")
            except PersonalAIError:
                connection.rollback()
                raise
            except sqlite3.Error as exc:
                connection.rollback()
                self._raise_db(exc)
            except Exception:
                connection.rollback()
                raise
            finally:
                connection.close()

    def read(self) -> ProfileSnapshot:
        connection = self._connect()
        try:
            connection.execute("BEGIN")
            profile_id, head = self._inspect(connection)
            result = self._snapshot(connection, profile_id, head)
            connection.execute("COMMIT")
            return result
        except PersonalAIError:
            connection.rollback()
            raise
        except sqlite3.Error as exc:
            connection.rollback()
            self._raise_db(exc)
        finally:
            connection.close()

    def _apply(self, operation: str, request: ChangeRequest | UndoRequest,
               now: datetime) -> CommandReceipt:
        stamp = _timestamp(now)
        canonical = _encoded({"operation": operation,
                              "expected_revision": request.expected_revision,
                              **({"changes": request.changes.replacements()} if operation == "change"
                                 else {"target_revision": request.target_revision})})
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            profile_id, head = self._inspect(connection)
            existing = connection.execute("SELECT * FROM commands WHERE command_id=?",
                                          (request.command_id,)).fetchone()
            if existing is not None:
                if existing["request_json"] != canonical or existing["operation"] != operation:
                    raise PersonalAIError("idempotency_conflict")
                original = ProfileSnapshot.model_validate_json(existing["result_snapshot_json"])
                actual = self._snapshot(connection, profile_id, existing["result_revision"])
                if original != actual:
                    raise PersonalAIError("recovery_required")
                current = self._snapshot(connection, profile_id, head)
                connection.execute("COMMIT")
                return CommandReceipt(command_id=request.command_id, operation=operation,
                                      result_revision=original.revision, result_snapshot=original,
                                      current_snapshot=current, replayed=True)
            if request.expected_revision != head:
                raise PersonalAIError("conflict")
            current = self._snapshot(connection, profile_id, head)
            target = None
            if operation == "change":
                merged = {**current.preferences.model_dump(), **request.changes.replacements()}
                next_preferences = Preferences.model_validate(merged)
            else:
                target = request.target_revision
                if target > head:
                    raise PersonalAIError("invalid_request")
                next_preferences = self._snapshot(connection, profile_id, target).preferences
            next_revision = head + 1
            connection.execute("""INSERT INTO revisions(revision,profile_id,operation,target_revision,
                command_id,preferences_json,created_at) VALUES(?,?,?,?,?,?,?)""",
                (next_revision, profile_id, operation, target, request.command_id,
                 _encoded(next_preferences.model_dump()), stamp))
            if self._after_revision_insert is not None:
                self._after_revision_insert()
            updated = connection.execute("UPDATE profile SET head_revision=? WHERE singleton=1 AND head_revision=?",
                                         (next_revision, head))
            if updated.rowcount != 1:
                raise PersonalAIError("conflict")
            snapshot = ProfileSnapshot(profile_id=profile_id, revision=next_revision,
                                       preferences=next_preferences, updated_at=now)
            connection.execute("""INSERT INTO commands(command_id,request_json,operation,
                result_revision,result_snapshot_json) VALUES(?,?,?,?,?)""",
                (request.command_id, canonical, operation, next_revision,
                 snapshot.model_dump_json()))
            connection.execute("COMMIT")
            return CommandReceipt(command_id=request.command_id, operation=operation,
                                  result_revision=next_revision, result_snapshot=snapshot,
                                  current_snapshot=snapshot, replayed=False)
        except PersonalAIError:
            connection.rollback()
            raise
        except (ValidationError, ValueError, TypeError) as exc:
            connection.rollback()
            raise PersonalAIError("recovery_required") from exc
        except sqlite3.Error as exc:
            connection.rollback()
            self._raise_db(exc)
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def change(self, request: ChangeRequest, now: datetime) -> CommandReceipt:
        return self._apply("change", request, now)

    def undo(self, request: UndoRequest, now: datetime) -> CommandReceipt:
        return self._apply("undo", request, now)

    def history(self, request: HistoryRequest) -> HistoryPage:
        connection = self._connect()
        try:
            connection.execute("BEGIN")
            profile_id, head = self._inspect(connection)
            before = request.before_revision or head + 1
            rows = connection.execute("""SELECT * FROM revisions WHERE profile_id=? AND revision<?
                ORDER BY revision DESC LIMIT ?""", (profile_id, before, request.limit + 1)).fetchall()
            more = len(rows) > request.limit
            items = [self._revision(row) for row in rows[:request.limit]]
            cursor = items[-1].revision if more else None
            result = HistoryPage(profile_id=profile_id, current_revision=head,
                                 items=items, next_before_revision=cursor)
            connection.execute("COMMIT")
            return result
        except PersonalAIError:
            connection.rollback()
            raise
        except sqlite3.Error as exc:
            connection.rollback()
            self._raise_db(exc)
        finally:
            connection.close()
