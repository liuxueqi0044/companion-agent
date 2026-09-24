"""Actual fixed-root CLI subprocess chain with fictional product and identity data."""

import json
from pathlib import Path
import subprocess
import sys
from uuid import uuid4


ROOT = Path(__file__).resolve().parents[3]
CLI = ROOT / "tools/personal_workbench.py"
HEAD = "item,unit,qty,unit_price,currency\n"


def call(payload: dict | bytes):
    data = payload if isinstance(payload, bytes) else json.dumps(payload, ensure_ascii=False).encode()
    process = subprocess.run([sys.executable, str(CLI)], input=data, cwd=ROOT,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
    return process.returncode, json.loads(process.stdout), process.stderr.decode()


def ok(payload):
    code, result, err = call(payload)
    assert code == 0 and result["ok"] and not err, (code, result, err)
    return result["result"]


def test_fixed_cli_profile_task_result_restart_and_undo():
    profile = ok({"action": "bootstrap"})
    changed = ok({"action": "profile.change", "expected_revision": profile["revision"],
                  "command_id": str(uuid4()), "changes": {"ai_name": "Mira", "address_user_as": "Alex"}})
    command_id = str(uuid4())
    submitted = ok({"action": "task.submit", "command_id": command_id,
                    "requirement_text": "核对虚构文具，保留来源", "csv_text": HEAD + "笔,支,2,3.50,CNY\n"})
    task = submitted["task"]
    assert task["profile_id"] == profile["profile_id"]
    assert task["profile_revision"] == changed["result_revision"]
    assert task["status"] == "queued"
    replay = ok({"action": "task.submit", "command_id": command_id,
                 "requirement_text": "核对虚构文具，保留来源", "csv_text": HEAD + "笔,支,2,3.50,CNY\n"})
    assert replay["replayed"] and replay["task"]["task_id"] == task["task_id"]
    for _ in range(20):
        if ok({"action": "task.get", "task_id": task["task_id"]})["status"] == "completed":
            break
        ok({"action": "worker.run-next"})
    current = ok({"action": "task.get", "task_id": task["task_id"]})
    assert current["status"] == "completed"
    assert current["input_hash"] == task["input_hash"]
    page = ok({"action": "task.result", "task_id": task["task_id"], "limit": 1})
    assert page["metadata"]["total"] == "7.00"
    assert page["rows"][0]["subtotal"] == "7.00"
    assert "csv:record:1:column:qty" in page["rows"][0]["formula"]
    assert [event["kind"] for event in ok({"action": "task.events", "task_id": task["task_id"]})["items"]] == [
        "submitted", "started", "completed"]
    assert ok({"action": "profile.read"})["profile_id"] == profile["profile_id"]
    assert ok({"action": "task.list", "limit": 100})["items"]
    undone = ok({"action": "profile.undo", "expected_revision": changed["result_revision"],
                 "target_revision": profile["revision"], "command_id": str(uuid4())})
    assert undone["result_revision"] == changed["result_revision"] + 1
    assert ok({"action": "task.get", "task_id": task["task_id"]})["profile_revision"] == changed["result_revision"]


def test_fixed_cli_rejects_bad_json_and_untrusted_routing():
    for payload in [b'{"action":"bootstrap","action":"task.list"}', b"\xff",
                    {"action": "task.submit", "command_id": str(uuid4()),
                     "requirement_text": "x", "csv_text": HEAD, "root": "elsewhere"},
                    {"action": "worker.run-next", "tool": "shell"}]:
        code, result, err = call(payload)
        assert code == 2 and result == {"ok": False, "error": {"code": "invalid_request"}}
        assert not err


def test_import_creates_no_database_process_or_network():
    snippet = """
import sqlite3,socket,subprocess
def forbidden(*args,**kwargs): raise RuntimeError('import_side_effect')
sqlite3.connect=forbidden
socket.socket=forbidden
subprocess.Popen=forbidden
import tools.personal_workbench
print('import_only')
"""
    process = subprocess.run([sys.executable, "-c", snippet], cwd=ROOT,
                             capture_output=True, text=True, timeout=8)
    assert process.returncode == 0 and process.stdout.strip() == "import_only"
    assert not process.stderr
