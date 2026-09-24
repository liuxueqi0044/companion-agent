"""One JSON request on stdin for the fixed local development profile database."""

from __future__ import annotations

import json
import os
from pathlib import Path
import sys

from pydantic import BaseModel

from services.personal_ai.models import PersonalAIError
from services.personal_ai.repository import SQLitePersonalAIRepository
from services.personal_ai.service import PersonalAIService


REPO = Path(__file__).resolve().parents[1]
DATA_ROOT = REPO / "reports/evidence/BATCH-015/local-state"
DB_FILE = DATA_ROOT / "personal_ai.sqlite3"
MAX_INPUT = 32 * 1024
MAX_OUTPUT = 128 * 1024


def _guard_fixed_path(create_root: bool) -> None:
    """Reject reparse points, including Windows junctions, on the fixed path."""
    target = DB_FILE.absolute()
    current = Path(target.anchor)
    parts = target.parts[1:]
    for part in parts:
        current = current / part
        if not os.path.lexists(current):
            if current == DATA_ROOT and create_root:
                try:
                    current.mkdir()
                except FileExistsError:
                    # Another local bootstrap won the directory creation race.
                    pass
            elif current == DATA_ROOT or current == DB_FILE:
                continue
            else:
                raise PersonalAIError("recovery_required")
        if os.path.islink(current) or (hasattr(os.path, "isjunction") and os.path.isjunction(current)):
            raise PersonalAIError("recovery_required")
        if os.path.normcase(os.path.realpath(current)) != os.path.normcase(os.path.abspath(current)):
            raise PersonalAIError("recovery_required")
    if DB_FILE.exists() and not DB_FILE.is_file():
        raise PersonalAIError("recovery_required")


def _unique_pairs(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate_json_key")
        result[key] = value
    return result


def _parse_input(data: bytes) -> dict[str, object]:
    if not data or len(data) > MAX_INPUT:
        raise PersonalAIError("invalid_request")
    try:
        decoded = data.decode("utf-8", errors="strict")
        value = json.loads(decoded, object_pairs_hook=_unique_pairs)
    except (UnicodeError, ValueError, RecursionError) as exc:
        raise PersonalAIError("invalid_request") from exc
    if not isinstance(value, dict) or not isinstance(value.get("command"), str):
        raise PersonalAIError("invalid_request")
    return value


def dispatch(data: dict[str, object], service: PersonalAIService) -> BaseModel:
    command = data.get("command")
    if command in {"bootstrap", "read"}:
        if set(data) != {"command"}:
            raise PersonalAIError("invalid_request")
        return service.bootstrap() if command == "bootstrap" else service.read()
    if command == "change":
        if set(data) != {"command", "expected_revision", "command_id", "changes"}:
            raise PersonalAIError("invalid_request")
        return service.change({key: value for key, value in data.items() if key != "command"})
    if command == "undo":
        if set(data) != {"command", "expected_revision", "target_revision", "command_id"}:
            raise PersonalAIError("invalid_request")
        return service.undo({key: value for key, value in data.items() if key != "command"})
    if command == "history":
        if not set(data) <= {"command", "limit", "before_revision"}:
            raise PersonalAIError("invalid_request")
        return service.history({key: value for key, value in data.items() if key != "command"})
    raise PersonalAIError("invalid_request")


def _response(value: dict[str, object]) -> bytes:
    raw = (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    if len(raw) > MAX_OUTPUT:
        raise PersonalAIError("response_too_large")
    return raw


def main() -> int:
    try:
        if len(sys.argv) != 1:
            raise PersonalAIError("invalid_request")
        data = _parse_input(sys.stdin.buffer.read(MAX_INPUT + 1))
        _guard_fixed_path(data["command"] == "bootstrap")
        service = PersonalAIService(SQLitePersonalAIRepository(DB_FILE))
        result = dispatch(data, service)
        output = _response({"ok": True, "result": result.model_dump(mode="json")})
        sys.stdout.buffer.write(output)
        return 0
    except PersonalAIError as exc:
        sys.stdout.buffer.write(_response({"ok": False, "error": {"code": exc.code}}))
        return 2
    except Exception as exc:
        # Do not log input or stored preference text, even on unexpected failures.
        print(f"internal_error:{type(exc).__name__}", file=sys.stderr)
        sys.stdout.buffer.write(_response({"ok": False, "error": {"code": "internal_error"}}))
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
