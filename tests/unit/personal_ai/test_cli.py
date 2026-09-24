"""Actual fixed-root subprocess CLI; only fictional Mira/Alex profile data."""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
from uuid import uuid4


ROOT = Path(__file__).resolve().parents[3]
CLI = ROOT / "tools/personal_ai.py"


def call(payload: dict | bytes) -> tuple[int, dict, str]:
    encoded = payload if isinstance(payload, bytes) else json.dumps(
        payload, ensure_ascii=False).encode("utf-8")
    process = subprocess.run([sys.executable, str(CLI)], input=encoded,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             cwd=ROOT, timeout=8)
    return process.returncode, json.loads(process.stdout), process.stderr.decode("utf-8")


def test_fixed_cli_restart_change_undo_history_and_error_envelopes() -> None:
    code, initial, stderr = call({"command": "bootstrap"})
    assert code == 0 and initial["ok"] and not stderr
    first = initial["result"]
    command_id = str(uuid4())
    edit = {"command": "change", "expected_revision": first["revision"],
            "command_id": command_id,
            "changes": {"ai_name": "Mira", "address_user_as": "Alex",
                        "communication_instructions": "回答直接一点。\n保留来源。"}}
    code, changed, stderr = call(edit)
    assert code == 0 and not stderr and changed["ok"]
    assert changed["result"]["result_revision"] == first["revision"] + 1
    assert changed["result"]["current_snapshot"]["preferences"]["ai_name"] == "Mira"
    code, reopened, _ = call({"command": "read"})
    assert code == 0 and reopened["result"]["profile_id"] == first["profile_id"]
    assert reopened["result"]["preferences"]["communication_instructions"] == "回答直接一点。\n保留来源。"
    code, replay, _ = call(edit)
    assert code == 0 and replay["result"]["replayed"] is True
    assert replay["result"]["result_snapshot"] == changed["result"]["result_snapshot"]
    code, stale, _ = call({**edit, "command_id": str(uuid4())})
    assert code == 2 and stale["error"]["code"] == "conflict"
    code, undone, _ = call({"command": "undo", "expected_revision": reopened["result"]["revision"],
                            "target_revision": first["revision"], "command_id": str(uuid4())})
    assert code == 0 and undone["result"]["result_revision"] == first["revision"] + 2
    assert undone["result"]["current_snapshot"]["preferences"] == first["preferences"]
    code, history, _ = call({"command": "history", "limit": 3})
    assert code == 0 and [item["operation"] for item in history["result"]["items"][:2]] == ["undo", "change"]
    assert history["result"]["profile_id"] == first["profile_id"]
    for invalid in [
        {"command": "read", "root": "elsewhere"},
        {"command": "change", "expected_revision": 1, "command_id": str(uuid4()),
         "changes": {"permission": "all"}},
        b"\xff", b"{" + b" " * (32 * 1024 + 1),
        b'{"command":"read","command":"bootstrap"}',
    ]:
        code, result, stderr = call(invalid)
        assert code == 2 and result == {"ok": False, "error": {"code": "invalid_request"}}
        assert not stderr


def test_import_does_not_open_db_or_network() -> None:
    snippet = """
import sqlite3,socket
def forbidden(*args,**kwargs): raise RuntimeError('import_side_effect')
sqlite3.connect=forbidden
socket.socket=forbidden
import tools.personal_ai
print('import_only')
"""
    process = subprocess.run([sys.executable, "-c", snippet], cwd=ROOT,
                             capture_output=True, text=True, timeout=8)
    assert process.returncode == 0 and process.stdout.strip() == "import_only"
    assert process.stderr == ""
