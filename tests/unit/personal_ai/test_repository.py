"""Real SQLite transaction and restart tests with fictional data only."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
from uuid import uuid4

import pytest

from services.personal_ai.models import (
    ChangeRequest, HistoryRequest, PersonalAIError, UndoRequest,
)
from services.personal_ai.repository import SQLitePersonalAIRepository


NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)


def repo(tmp_path: Path, **options) -> SQLitePersonalAIRepository:
    return SQLitePersonalAIRepository(tmp_path / "profile.sqlite3", **options)


def change(revision: int, command_id: str | None = None, **changes: str) -> ChangeRequest:
    return ChangeRequest.model_validate({"expected_revision": revision,
        "command_id": command_id or str(uuid4()), "changes": changes})


def test_bootstrap_is_explicit_stable_and_reopens_without_creation(tmp_path: Path) -> None:
    store = repo(tmp_path)
    with pytest.raises(PersonalAIError, match="not_initialized"):
        store.read()
    assert not store.db_path.exists()
    initial = store.bootstrap(NOW)
    assert initial.revision == 1
    assert initial.preferences.ai_name == "我的AI"
    assert store.bootstrap(NOW).profile_id == initial.profile_id
    assert repo(tmp_path).read() == initial
    assert store.history(HistoryRequest()).items[0].operation == "bootstrap"


def test_cas_idempotency_old_result_and_undo_history(tmp_path: Path) -> None:
    store = repo(tmp_path)
    original = store.bootstrap(NOW)
    first = change(1, ai_name="Mira", address_user_as="Alex",
                   communication_instructions="回答直接一点。\n请保留来源。")
    receipt = store.change(first, NOW)
    assert receipt.result_revision == 2 and not receipt.replayed
    assert receipt.result_snapshot.profile_id == original.profile_id
    assert receipt.result_snapshot.preferences.communication_instructions.endswith("\n请保留来源。")
    later = store.change(change(2, ai_name="米拉"), NOW)
    replay = repo(tmp_path).change(first, NOW)
    assert replay.replayed and replay.result_snapshot == receipt.result_snapshot
    assert replay.current_snapshot == later.current_snapshot
    with pytest.raises(PersonalAIError, match="idempotency_conflict"):
        store.change(change(1, first.command_id, ai_name="Else"), NOW)
    with pytest.raises(PersonalAIError, match="conflict"):
        store.change(change(1, ai_name="Stale"), NOW)
    undo = store.undo(UndoRequest(expected_revision=3, target_revision=1,
                                  command_id=str(uuid4())), NOW)
    assert undo.result_revision == 4
    assert undo.result_snapshot.preferences == original.preferences
    assert repo(tmp_path).read() == undo.current_snapshot
    page = store.history(HistoryRequest(limit=2))
    assert [item.revision for item in page.items] == [4, 3]
    assert page.items[0].operation == "undo" and page.items[0].target_revision == 1
    assert page.next_before_revision == 3
    older = store.history(HistoryRequest(limit=2, before_revision=page.next_before_revision))
    assert [item.revision for item in older.items] == [2, 1]
    assert older.next_before_revision is None


def test_two_connections_race_old_revision_and_failure_rolls_back(tmp_path: Path) -> None:
    first = repo(tmp_path)
    first.bootstrap(NOW)
    one = change(1, ai_name="Mira")
    two = change(1, ai_name="Luna")
    def submit(request: ChangeRequest):
        try:
            return repo(tmp_path).change(request, NOW).result_revision
        except PersonalAIError as exc:
            return exc.code
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(submit, [one, two]))
    assert sorted(results, key=str) == [2, "conflict"]
    before = repo(tmp_path).read()
    failing = repo(tmp_path, after_revision_insert=lambda: (_ for _ in ()).throw(RuntimeError("fault")))
    with pytest.raises(RuntimeError, match="fault"):
        failing.change(change(2, address_user_as="Alex"), NOW)
    reopened = repo(tmp_path)
    assert reopened.read() == before
    assert [item.revision for item in reopened.history(HistoryRequest()).items] == [2, 1]


CHILD = """
import json,sys,time
from datetime import datetime,timezone
from pathlib import Path
from uuid import uuid4
from services.personal_ai.models import ChangeRequest,PersonalAIError
from services.personal_ai.repository import SQLitePersonalAIRepository
db=Path(sys.argv[1]); gate=Path(sys.argv[2]); operation=sys.argv[3]
while not gate.exists(): time.sleep(0.002)
store=SQLitePersonalAIRepository(db,timeout_seconds=1.0)
try:
 if operation=='bootstrap': result=store.bootstrap(datetime(2026,1,1,tzinfo=timezone.utc)).profile_id
 else:
  request=ChangeRequest.model_validate({'expected_revision':1,'command_id':str(uuid4()),'changes':{'ai_name':operation}})
  result=store.change(request,datetime(2026,1,1,tzinfo=timezone.utc)).result_revision
 print(json.dumps({'result':result}))
except PersonalAIError as exc: print(json.dumps({'error':exc.code}))
"""


def _race(db: Path, gate: Path, operations: list[str]) -> list[dict]:
    processes = [subprocess.Popen([sys.executable, "-c", CHILD, str(db), str(gate), operation],
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                    cwd=Path(__file__).resolve().parents[3]) for operation in operations]
    gate.write_text("go", encoding="utf-8")
    results = []
    for process in processes:
        out, err = process.communicate(timeout=8)
        assert process.returncode == 0, err
        results.append(json.loads(out))
    return results


def test_two_local_processes_bootstrap_once_then_cas(tmp_path: Path) -> None:
    db = tmp_path / "two-processes.sqlite3"
    bootstrap = _race(db, tmp_path / "bootstrap.gate", ["bootstrap", "bootstrap"])
    assert bootstrap[0]["result"] == bootstrap[1]["result"]
    assert SQLitePersonalAIRepository(db).read().profile_id == bootstrap[0]["result"]
    changes = _race(db, tmp_path / "change.gate", ["Mira", "Luna"])
    assert sorted([value.get("error", value.get("result")) for value in changes], key=str) == [2, "conflict"]
    assert SQLitePersonalAIRepository(db).read().revision == 2


def test_unknown_or_damaged_database_never_resets(tmp_path: Path) -> None:
    store = repo(tmp_path)
    store.db_path.write_bytes(b"not a sqlite database")
    original = store.db_path.read_bytes()
    for action in [store.read, lambda: store.bootstrap(NOW)]:
        with pytest.raises(PersonalAIError, match="recovery_required"):
            action()
    assert store.db_path.read_bytes() == original
    other = tmp_path / "unknown.sqlite3"
    with sqlite3.connect(other) as connection:
        connection.execute("PRAGMA user_version=99")
        connection.execute("CREATE TABLE unrelated(x TEXT)")
    with pytest.raises(PersonalAIError, match="recovery_required"):
        SQLitePersonalAIRepository(other).read()
