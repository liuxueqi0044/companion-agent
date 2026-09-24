"""One strict JSON action on stdin against the fixed BATCH-015 local data root."""

from __future__ import annotations

import json
import os
from pathlib import Path
import sys

from pydantic import BaseModel

from services.local_tasks.models import LocalTaskError
from services.local_tasks.repository import SQLiteTaskRepository
from services.local_tasks.runner import LocalWorker
from services.local_tasks.service import PersonalWorkbench
from services.personal_ai.models import PersonalAIError
from services.personal_ai.repository import SQLitePersonalAIRepository
from services.personal_ai.service import PersonalAIService
from tools.personal_ai import DATA_ROOT, DB_FILE, _guard_fixed_path, _unique_pairs


TASK_DB = DATA_ROOT / "tasks.sqlite3"
WORKER_LOCK = DATA_ROOT / "worker.lock"
MAX_INPUT = 384 * 1024
MAX_OUTPUT = 1024 * 1024


def _guard_paths(create_root: bool) -> None:
    _guard_fixed_path(create_root)
    for path in (TASK_DB, WORKER_LOCK):
        if os.path.lexists(path):
            if os.path.islink(path) or (hasattr(os.path, "isjunction") and os.path.isjunction(path)):
                raise LocalTaskError("recovery_required")
            if os.path.normcase(os.path.realpath(path)) != os.path.normcase(os.path.abspath(path)):
                raise LocalTaskError("recovery_required")
            if not path.is_file():
                raise LocalTaskError("recovery_required")


def _parse(data: bytes) -> dict[str, object]:
    if not data or len(data) > MAX_INPUT:
        raise LocalTaskError("invalid_request")
    try:
        value = json.loads(data.decode("utf-8", "strict"), object_pairs_hook=_unique_pairs,
                           parse_constant=lambda _value: (_ for _ in ()).throw(ValueError("constant")))
    except (UnicodeError, ValueError, RecursionError) as exc:
        raise LocalTaskError("invalid_request") from exc
    if not isinstance(value, dict) or not isinstance(value.get("action"), str):
        raise LocalTaskError("invalid_request")
    return value


def _fields(data: dict[str, object], allowed: set[str], required: set[str] | None = None):
    if not required:
        required = set()
    if not required <= data.keys() or not data.keys() <= allowed | {"action"}:
        raise LocalTaskError("invalid_request")
    return {key: value for key, value in data.items() if key != "action"}


def dispatch(data: dict[str, object], app: PersonalWorkbench):
    action = data["action"]
    if action == "bootstrap":
        _fields(data, set())
        return app.bootstrap()
    if action == "profile.read":
        _fields(data, set())
        return app.profile.read()
    if action == "profile.change":
        return app.profile.change(_fields(data, {"expected_revision", "command_id", "changes"},
                                          {"expected_revision", "command_id", "changes"}))
    if action == "profile.undo":
        return app.profile.undo(_fields(data, {"expected_revision", "target_revision", "command_id"},
                                        {"expected_revision", "target_revision", "command_id"}))
    if action == "task.submit":
        return app.submit(_fields(data, {"command_id", "requirement_text", "csv_text",
                                         "executor", "tool_version"},
                                  {"command_id", "requirement_text", "csv_text"}))
    if action == "task.get":
        return app.get(_fields(data, {"task_id"}, {"task_id"}))
    if action == "task.list":
        return app.list(_fields(data, {"limit", "before_task_id"}))
    if action == "task.events":
        return app.events(_fields(data, {"task_id", "after_seq", "limit"}, {"task_id"}))
    if action == "task.result":
        return app.result(_fields(data, {"task_id", "offset", "limit", "issue_offset",
                                         "issue_limit"}, {"task_id"}))
    if action == "task.cancel":
        return app.cancel(_fields(data, {"task_id", "command_id"}, {"task_id", "command_id"}))
    if action == "task.retry":
        return app.retry(_fields(data, {"task_id", "command_id"}, {"task_id", "command_id"}))
    if action == "worker.run-next":
        _fields(data, set())
        return app.run_next()
    if action == "worker.recover":
        _fields(data, set())
        return app.recover()
    raise LocalTaskError("invalid_request")


def _encode(value) -> bytes:
    if isinstance(value, BaseModel):
        value = value.model_dump(mode="json")
    elif isinstance(value, list):
        value = [item.model_dump(mode="json") if isinstance(item, BaseModel) else item for item in value]
    raw = (json.dumps({"ok": True, "result": value}, ensure_ascii=False,
                      separators=(",", ":")) + "\n").encode("utf-8")
    if len(raw) > MAX_OUTPUT:
        raise LocalTaskError("response_too_large")
    return raw


def _error(code: str) -> bytes:
    return (json.dumps({"ok": False, "error": {"code": code}}, separators=(",", ":")) + "\n").encode()


def main() -> int:
    try:
        if len(sys.argv) != 1:
            raise LocalTaskError("invalid_request")
        data = _parse(sys.stdin.buffer.read(MAX_INPUT + 1))
        _guard_paths(data["action"] == "bootstrap")
        profile = PersonalAIService(SQLitePersonalAIRepository(DB_FILE))
        tasks = SQLiteTaskRepository(TASK_DB)
        worker = LocalWorker(tasks, WORKER_LOCK)
        app = PersonalWorkbench(profile, tasks, worker)
        result = dispatch(data, app)
        if data["action"] == "task.result":
            # A single maximal row is bounded by CSV limits; shrink a read-only page as needed.
            limit = data.get("limit", 50)
            issue_limit = data.get("issue_limit", 50)
            while True:
                try:
                    output = _encode(result)
                    break
                except LocalTaskError as exc:
                    if exc.code != "response_too_large" or not isinstance(limit, int) or not isinstance(issue_limit, int):
                        raise
                    if limit <= 1 and issue_limit <= 1:
                        raise
                    limit = max(1, limit // 2)
                    issue_limit = max(1, issue_limit // 2)
                    result = dispatch({**data, "limit": limit, "issue_limit": issue_limit}, app)
        else:
            output = _encode(result)
        sys.stdout.buffer.write(output)
        return 0
    except (LocalTaskError, PersonalAIError) as exc:
        sys.stdout.buffer.write(_error(exc.code))
        return 2
    except Exception as exc:
        print(f"internal_error:{type(exc).__name__}", file=sys.stderr)
        sys.stdout.buffer.write(_error("internal_error"))
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
