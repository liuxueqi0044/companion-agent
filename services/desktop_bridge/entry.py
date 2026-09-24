"""Single-request stdio entry, reusing the accepted profile and local task services."""

from __future__ import annotations

import json
import os
from pathlib import Path
import sys
from typing import Any

from pydantic import BaseModel, ValidationError

from services.local_tasks.models import (
    ActionReceipt, CommandTaskRequest, EventPage, EventsRequest, ListRequest,
    LocalTaskError, ResultPage, ResultRequest, SubmitRequest, TaskIdRequest,
    TaskPage, TaskSnapshot, canonical_uuid,
)
from services.local_tasks.repository import SQLiteTaskRepository
from services.local_tasks.runner import LocalWorker
from services.local_tasks.service import PersonalWorkbench
from services.personal_ai.models import (
    ChangeRequest, CommandReceipt, PersonalAIError, ProfileSnapshot, UndoRequest,
)
from services.personal_ai.repository import SQLitePersonalAIRepository
from services.personal_ai.service import PersonalAIService

from .models import RequestEnvelope, ResponseEnvelope, VERSION


REPO = Path(__file__).resolve().parents[2]
DEFAULT_ROOT = REPO / "reports/evidence/BATCH-016/runtime"
MAX_INPUT = 384 * 1024
MAX_OUTPUT = 1024 * 1024
REQUEST_MODELS = {
    "profile.change": ChangeRequest, "profile.undo": UndoRequest,
    "task.submit": SubmitRequest, "task.get": TaskIdRequest,
    "task.list": ListRequest, "task.events": EventsRequest,
    "task.result": ResultRequest, "task.cancel": CommandTaskRequest,
    "task.retry": CommandTaskRequest,
}
RESULT_MODELS = {
    "bootstrap": ProfileSnapshot, "profile.read": ProfileSnapshot,
    "profile.change": CommandReceipt, "profile.undo": CommandReceipt,
    "task.submit": ActionReceipt, "task.get": TaskSnapshot,
    "task.list": TaskPage, "task.events": EventPage,
    "task.result": ResultPage, "task.cancel": ActionReceipt,
    "task.retry": ActionReceipt, "worker.run-next": TaskSnapshot,
    "worker.recover": TaskSnapshot,
}


class BridgeProtocolError(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def _unique_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate_json_key")
        result[key] = value
    return result


def _parse(raw: bytes) -> RequestEnvelope:
    if not raw or len(raw) > MAX_INPUT:
        raise BridgeProtocolError("invalid_request")
    try:
        value = json.loads(raw.decode("utf-8", "strict"), object_pairs_hook=_unique_pairs,
                           parse_constant=lambda _value: (_ for _ in ()).throw(ValueError("constant")))
        return RequestEnvelope.model_validate(value)
    except (UnicodeError, ValueError, TypeError, RecursionError, ValidationError) as exc:
        raise BridgeProtocolError("invalid_request") from exc


def _request_id_if_valid(raw: bytes) -> str | None:
    try:
        value = json.loads(raw.decode("utf-8", "strict"), object_pairs_hook=_unique_pairs)
        if isinstance(value, dict) and isinstance(value.get("request_id"), str):
            return canonical_uuid(value["request_id"])
    except (UnicodeError, ValueError, TypeError, RecursionError):
        pass
    return None


def _guard_root(root: Path, *, create: bool) -> None:
    target = Path(root).absolute()
    current = Path(target.anchor)
    for part in target.parts[1:]:
        current = current / part
        if not os.path.lexists(current):
            if current == target and create:
                try:
                    current.mkdir()
                except FileExistsError:
                    pass
            elif current == target:
                raise LocalTaskError("not_initialized")
            else:
                raise LocalTaskError("recovery_required")
        if os.path.islink(current) or (hasattr(os.path, "isjunction") and os.path.isjunction(current)):
            raise LocalTaskError("recovery_required")
        if os.path.normcase(os.path.realpath(current)) != os.path.normcase(os.path.abspath(current)):
            raise LocalTaskError("recovery_required")
    if not target.is_dir():
        raise LocalTaskError("recovery_required")
    for name in ("personal_ai.sqlite3", "tasks.sqlite3", "worker.lock"):
        path = target / name
        if os.path.lexists(path):
            if os.path.islink(path) or (hasattr(os.path, "isjunction") and os.path.isjunction(path)):
                raise LocalTaskError("recovery_required")
            if not path.is_file() or os.path.normcase(os.path.realpath(path)) != os.path.normcase(os.path.abspath(path)):
                raise LocalTaskError("recovery_required")


def create_app(root: Path) -> PersonalWorkbench:
    """Trusted, in-process test factory. The public CLI never accepts a root override."""
    root = Path(root)
    profile = PersonalAIService(SQLitePersonalAIRepository(root / "personal_ai.sqlite3"))
    tasks = SQLiteTaskRepository(root / "tasks.sqlite3")
    worker = LocalWorker(tasks, root / "worker.lock")
    return PersonalWorkbench(profile, tasks, worker)


def _validated_payload(request: RequestEnvelope):
    model = REQUEST_MODELS.get(request.action)
    if model is None:
        if request.payload:
            raise LocalTaskError("invalid_request")
        return None
    try:
        return model.model_validate(request.payload)
    except (ValidationError, ValueError, TypeError) as exc:
        raise LocalTaskError("invalid_request") from exc


def dispatch(request: RequestEnvelope, app: PersonalWorkbench):
    payload = _validated_payload(request)
    action = request.action
    if action == "bootstrap":
        result = app.bootstrap()
    elif action == "profile.read":
        result = app.profile.read()
    elif action == "profile.change":
        result = app.profile.change(payload)
    elif action == "profile.undo":
        result = app.profile.undo(payload)
    elif action == "task.submit":
        result = app.submit(payload)
    elif action == "task.get":
        result = app.get(payload)
    elif action == "task.list":
        result = app.list(payload)
    elif action == "task.events":
        result = app.events(payload)
    elif action == "task.result":
        result = app.result(payload)
    elif action == "task.cancel":
        result = app.cancel(payload)
    elif action == "task.retry":
        result = app.retry(payload)
    elif action == "worker.run-next":
        result = app.run_next()
    else:
        result = app.recover()
    model = RESULT_MODELS[action]
    if action == "worker.run-next" and result is None:
        return None
    if action == "worker.recover":
        if not isinstance(result, list):
            raise BridgeProtocolError("invalid_backend_result")
        return [model.model_validate(item).model_dump(mode="json") for item in result]
    try:
        return model.model_validate(result).model_dump(mode="json")
    except (ValidationError, ValueError, TypeError) as exc:
        raise BridgeProtocolError("invalid_backend_result") from exc


def _encode(response: ResponseEnvelope) -> bytes:
    raw = (response.model_dump_json(exclude_none=False) + "\n").encode("utf-8")
    if len(raw) > MAX_OUTPUT:
        raise BridgeProtocolError("response_too_large")
    return raw


def handle_bytes(raw: bytes, *, root: Path = DEFAULT_ROOT) -> tuple[int, bytes]:
    try:
        request = _parse(raw)
    except BridgeProtocolError as exc:
        return 2, _encode(ResponseEnvelope(request_id=_request_id_if_valid(raw), ok=False,
                                           error={"kind": "protocol", "code": exc.code}))
    try:
        _guard_root(root, create=request.action == "bootstrap")
        app = create_app(root)
        result = dispatch(request, app)
        if request.action == "task.result":
            limit = request.payload.get("limit", 50)
            issue_limit = request.payload.get("issue_limit", 50)
            while True:
                try:
                    output = _encode(ResponseEnvelope(request_id=request.request_id,
                                                      ok=True, result=result))
                    return 0, output
                except BridgeProtocolError as exc:
                    if exc.code != "response_too_large" or not isinstance(limit, int) or not isinstance(issue_limit, int):
                        raise
                    if limit <= 1 and issue_limit <= 1:
                        raise
                    limit = max(1, limit // 2)
                    issue_limit = max(1, issue_limit // 2)
                    smaller = request.model_copy(update={"payload": {
                        **request.payload, "limit": limit, "issue_limit": issue_limit}})
                    result = dispatch(smaller, app)  # Read-only, no repeated mutation.
        return 0, _encode(ResponseEnvelope(request_id=request.request_id, ok=True,
                                           result=result))
    except (LocalTaskError, PersonalAIError) as exc:
        return 0, _encode(ResponseEnvelope(request_id=request.request_id, ok=False,
                                           error={"kind": "business", "code": exc.code}))
    except BridgeProtocolError as exc:
        return 2, _encode(ResponseEnvelope(request_id=request.request_id, ok=False,
                                           error={"kind": "protocol", "code": exc.code}))
    except Exception as exc:
        # No original input, environment, DB path or preference values in diagnostic output.
        print(f"bridge_internal_error:{type(exc).__name__}", file=sys.stderr)
        return 3, _encode(ResponseEnvelope(request_id=request.request_id, ok=False,
                                           error={"kind": "protocol", "code": "internal_error"}))


def main(*, root: Path = DEFAULT_ROOT) -> int:
    if len(sys.argv) != 1:
        status, output = 2, _encode(ResponseEnvelope(request_id=None, ok=False,
                                                    error={"kind": "protocol", "code": "invalid_request"}))
    else:
        status, output = handle_bytes(sys.stdin.buffer.read(MAX_INPUT + 1), root=root)
    sys.stdout.buffer.write(output)
    return status
