"""Stdio envelope, real service composition and fixed public root boundaries."""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
from uuid import uuid4

from services.desktop_bridge.entry import DEFAULT_ROOT, handle_bytes


ROOT = Path(__file__).resolve().parents[3]
CLI = ROOT / "tools/desktop_bridge.py"


def request(action: str, payload: dict | None = None, **extra) -> bytes:
    return json.dumps({"version": "desktop-local/1", "request_id": str(uuid4()),
                       "action": action, "payload": {} if payload is None else payload,
                       **extra}, ensure_ascii=False).encode()


def invoke(data: bytes, root: Path):
    status, raw = handle_bytes(data, root=root)
    assert len(raw) <= 1024 * 1024 and raw.endswith(b"\n") and raw.count(b"\n") == 1
    return status, json.loads(raw)


def test_explicit_bootstrap_reuses_profile_and_real_task_service(tmp_path: Path):
    root = tmp_path / "local"
    data = request("profile.read")
    code, error = invoke(data, root)
    assert code == 0 and error["error"] == {"kind": "business", "code": "not_initialized"}
    assert not root.exists()
    code, initial = invoke(request("bootstrap"), root)
    assert code == 0 and initial["ok"] and initial["result"]["revision"] == 1
    code, again = invoke(request("bootstrap"), root)
    assert code == 0 and again["result"]["profile_id"] == initial["result"]["profile_id"]
    changed = invoke(request("profile.change", {"expected_revision": 1,
        "command_id": str(uuid4()), "changes": {"ai_name": "Mira"}}), root)[1]
    assert changed["result"]["result_revision"] == 2
    task = invoke(request("task.submit", {"command_id": str(uuid4()),
        "requirement_text": "虚构文具核对", "csv_text": "item,unit,qty,unit_price,currency\n笔,支,2,3,CNY\n"}), root)[1]["result"]["task"]
    assert task["profile_id"] == initial["result"]["profile_id"] and task["profile_revision"] == 2
    result = invoke(request("worker.run-next"), root)[1]["result"]
    assert result["status"] == "completed"
    page = invoke(request("task.result", {"task_id": task["task_id"]}), root)[1]["result"]
    assert page["metadata"]["total"] == "6" and page["rows"][0]["subtotal"] == "6"


def test_one_json_strict_envelope_and_business_model(tmp_path: Path):
    root = tmp_path / "local"
    invoke(request("bootstrap"), root)
    valid = request("profile.read")
    for data in [b"", b"\xff", b"{}{}", b'{"version":"desktop-local/1","version":"desktop-local/1"}',
                 request("profile.read", {}, root="elsewhere"),
                 request("profile.read", {"extra": 1}),
                 request("not.action"), b"{" + b" " * (384 * 1024 + 1)]:
        code, value = invoke(data, root)
        assert not value["ok"] and value["error"]["code"] == "invalid_request"
        assert code in {0, 2}
    code, value = invoke(request("profile.change", {"expected_revision": 1,
        "command_id": str(uuid4()), "changes": {"permission": "all"}}), root)
    assert code == 0 and value["error"] == {"kind": "business", "code": "invalid_request"}
    assert invoke(valid, root)[1]["result"]["revision"] == 1


def test_actual_public_cli_rejects_invalid_input_and_argv_without_opening_frozen_runtime():
    data = request("bootstrap")
    process = subprocess.run([sys.executable, str(CLI)], input=b"{}", cwd=ROOT,
                             capture_output=True, timeout=10)
    assert process.returncode == 2 and not process.stderr
    response = json.loads(process.stdout)
    assert not response["ok"] and response["error"]["code"] == "invalid_request"
    assert DEFAULT_ROOT == ROOT / "reports/evidence/BATCH-016/runtime"
    wrong = subprocess.run([sys.executable, str(CLI), "--root", "elsewhere"],
                           input=data, cwd=ROOT, capture_output=True, timeout=10)
    assert wrong.returncode == 2 and json.loads(wrong.stdout)["error"]["code"] == "invalid_request"


def test_import_has_no_db_process_or_network_side_effect():
    snippet = """
import sqlite3,socket,subprocess
def forbidden(*args,**kwargs): raise RuntimeError('import_side_effect')
sqlite3.connect=forbidden
socket.socket=forbidden
subprocess.Popen=forbidden
import services.desktop_bridge.entry, tools.desktop_bridge
print('import_only')
"""
    result = subprocess.run([sys.executable, "-c", snippet], cwd=ROOT,
                            capture_output=True, text=True, timeout=10)
    assert result.returncode == 0 and result.stdout.strip() == "import_only" and not result.stderr


def test_large_result_shrinks_only_read_page_and_keeps_cursor(tmp_path: Path):
    root = tmp_path / "local"
    invoke(request("bootstrap"), root)
    extra = "extra_" + "x" * 12000
    csv_text = f"item,unit,qty,unit_price,currency,{extra}\n" + "笔,支,1,2,CNY,z\n" * 80
    task = invoke(request("task.submit", {"command_id": str(uuid4()),
        "requirement_text": "虚构批量核对", "csv_text": csv_text}), root)[1]["result"]["task"]
    assert invoke(request("worker.run-next"), root)[1]["result"]["status"] == "completed"
    code, page = invoke(request("task.result", {"task_id": task["task_id"], "limit": 100}), root)
    assert code == 0 and page["ok"]
    assert 0 < len(page["result"]["rows"]) < 100
    assert page["result"]["next_offset"] == len(page["result"]["rows"])
    assert page["result"]["metadata"]["total"] == "160"
