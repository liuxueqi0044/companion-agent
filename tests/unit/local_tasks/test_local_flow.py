"""Full fixed-CLI scenario matrix and result integrity faults."""

from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
from uuid import uuid4

import pytest

from services.local_tasks.csv_audit import audit_csv
from services.local_tasks.models import EventsRequest, LocalTaskError, ResultRequest, SubmitRequest
from services.local_tasks.repository import SQLiteTaskRepository


ROOT = Path(__file__).resolve().parents[3]
CLI = ROOT / "tools/personal_workbench.py"
NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)


def cli(request):
    process = subprocess.run([sys.executable, str(CLI)], cwd=ROOT,
                             input=json.dumps(request, ensure_ascii=False).encode(),
                             capture_output=True, timeout=10)
    response = json.loads(process.stdout)
    assert process.returncode in {0, 2} and not process.stderr, process.stderr.decode()
    return response


def success(request):
    response = cli(request)
    assert response["ok"], response
    return response["result"]


def _submit(csv_text):
    return success({"action": "task.submit", "command_id": str(uuid4()),
                    "requirement_text": "核对虚构采购 CSV；保留来源，未知待确认。",
                    "csv_text": csv_text})["task"]


def _drive(task_id):
    for _ in range(30):
        state = success({"action": "task.get", "task_id": task_id})
        if state["status"] != "queued":
            return state
        success({"action": "worker.run-next"})
    raise AssertionError("task was not reached by bounded explicit worker calls")


def test_cli_issue_invalid_and_queued_cancel_are_distinct():
    success({"action": "bootstrap"})
    issue_task = _submit("item,unit,qty,currency\n笔,支,2,CNY\n")
    assert _drive(issue_task["task_id"])["status"] == "completed"
    issue_result = success({"action": "task.result", "task_id": issue_task["task_id"]})
    assert issue_result["metadata"]["total"] is None
    assert issue_result["issues"] == [{"code": "missing_column", "column": "unit_price",
                                         "record_index": None,
                                         "source": "csv:header:missing:unit_price"}]
    assert issue_result["rows"][0]["subtotal"] is None
    invalid_task = _submit("item,unit,qty,unit_price,currency\n\"unclosed,支,1,2,CNY")
    failed = _drive(invalid_task["task_id"])
    assert failed["status"] == "failed" and failed["error_code"] == "invalid_csv"
    assert cli({"action": "task.result", "task_id": invalid_task["task_id"]})["error"]["code"] == "not_ready"
    invalid_events = success({"action": "task.events", "task_id": invalid_task["task_id"]})
    assert [event["kind"] for event in invalid_events["items"]] == ["submitted", "started", "failed"]
    cancelled = _submit("item,unit,qty,unit_price,currency\n纸,张,1,0,CNY\n")
    cancellation = success({"action": "task.cancel", "task_id": cancelled["task_id"],
                            "command_id": str(uuid4())})
    assert cancellation["task"]["status"] == "cancelled"
    assert [event["kind"] for event in success({"action": "task.events", "task_id": cancelled["task_id"]})["items"]] == [
        "submitted", "cancelled"]
    assert cli({"action": "task.retry", "task_id": cancelled["task_id"],
                "command_id": str(uuid4())})["error"]["code"] == "invalid_transition"


def test_forged_result_source_is_rejected_and_publish_rolls_back(tmp_path: Path):
    store = SQLiteTaskRepository(tmp_path / "tasks.sqlite3")
    store.bootstrap()
    csv_text = "item,unit,qty,unit_price,currency\n笔,支,2,3,CNY\n"
    task = store.submit(SubmitRequest(command_id=str(uuid4()), requirement_text="虚构",
                                      csv_text=csv_text), str(uuid4()), 1, NOW).task
    claim = store.claim_next(NOW)
    good = audit_csv(csv_text, task.input_hash)
    forged = good.model_copy(update={"total": "999"})
    with pytest.raises(LocalTaskError, match="invalid_result"):
        store.publish(task.task_id, claim.attempt_id, NOW, result=forged)
    assert store.get(task.task_id).status == "running"
    assert [event.kind for event in store.events(EventsRequest(task_id=task.task_id)).items] == [
        "submitted", "started"]
    store.publish(task.task_id, claim.attempt_id, NOW, result=good)
    assert store.get(task.task_id).status == "completed"
    assert store.cancel(task.task_id, str(uuid4()), NOW).disposition == "too_late"
    with sqlite3.connect(store.db_path) as connection:
        connection.execute("DELETE FROM results WHERE attempt_id=?", (claim.attempt_id,))
    with pytest.raises(LocalTaskError, match="recovery_required"):
        store.get(task.task_id)


def test_rows_and_issues_have_independent_bounded_cursors(tmp_path: Path):
    store = SQLiteTaskRepository(tmp_path / "tasks.sqlite3")
    store.bootstrap()
    csv_text = "item,unit,qty,unit_price,currency\n" + "笔,支,,2,CNY\n" * 23
    task = store.submit(SubmitRequest(command_id=str(uuid4()), requirement_text="虚构",
                                      csv_text=csv_text), str(uuid4()), 1, NOW).task
    claim = store.claim_next(NOW)
    store.publish(task.task_id, claim.attempt_id, NOW, result=audit_csv(csv_text, task.input_hash))
    row_indexes, issue_indexes = [], []
    row_offset, issue_offset = 0, 0
    while True:
        page = store.result(ResultRequest(task_id=task.task_id, offset=row_offset, limit=5,
                                          issue_offset=issue_offset, issue_limit=3))
        row_indexes.extend(row.record_index for row in page.rows)
        issue_indexes.extend(issue.record_index for issue in page.issues)
        if page.next_offset is None and page.next_issue_offset is None:
            break
        row_offset = page.next_offset if page.next_offset is not None else 23
        issue_offset = page.next_issue_offset if page.next_issue_offset is not None else 23
    assert row_indexes == list(range(1, 24))
    assert issue_indexes == list(range(1, 24))


def test_fixed_cli_real_child_crash_recover_and_retry():
    success({"action": "bootstrap"})
    # Only synthetic BATCH-015 state is used; drain a previous test's queued fixtures.
    for _ in range(30):
        if success({"action": "worker.run-next"}) is None:
            break
    else:
        raise AssertionError("fixture queue did not drain")
    task = _submit("item,unit,qty,unit_price,currency\n笔,支,2,3,CNY\n")
    child_script = """
import os
from services.local_tasks.repository import SQLiteTaskRepository
from services.local_tasks.runner import LocalWorker
from tools.personal_workbench import TASK_DB, WORKER_LOCK
LocalWorker(SQLiteTaskRepository(TASK_DB), WORKER_LOCK,
    after_checkpoint=lambda: os._exit(17)).run_next()
"""
    child = subprocess.run([sys.executable, "-c", child_script], cwd=ROOT,
                           capture_output=True, timeout=10)
    assert child.returncode == 17 and not child.stdout and not child.stderr
    running = success({"action": "task.get", "task_id": task["task_id"]})
    assert running["status"] == "running"
    old_attempt_id = running["current_attempt_id"]
    recovered = success({"action": "worker.recover"})
    assert len(recovered) == 1 and recovered[0]["task_id"] == task["task_id"]
    assert recovered[0]["status"] == "interrupted"
    assert success({"action": "worker.recover"}) == []
    retried = success({"action": "task.retry", "task_id": task["task_id"],
                       "command_id": str(uuid4())})["task"]
    assert retried["status"] == "queued" and retried["attempt_count"] == 2
    assert retried["current_attempt_id"] != old_attempt_id
    finished = success({"action": "worker.run-next"})
    assert finished["task_id"] == task["task_id"] and finished["status"] == "completed"
    assert success({"action": "task.result", "task_id": task["task_id"]})["metadata"]["total"] == "6"
    kinds = [event["kind"] for event in success({"action": "task.events", "task_id": task["task_id"]})["items"]]
    assert kinds == ["submitted", "started", "interrupted", "retried", "started", "completed"]
