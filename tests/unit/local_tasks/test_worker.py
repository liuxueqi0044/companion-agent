"""Actual local process lock, cooperative cancellation and crash recovery."""

from datetime import datetime, timezone
import os
from pathlib import Path
import subprocess
import sys
import time
from uuid import uuid4

import pytest

from services.local_tasks.models import EventsRequest, LocalTaskError, SubmitRequest
from services.local_tasks.repository import SQLiteTaskRepository
from services.local_tasks.runner import LocalWorker, WorkerLock


NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)
ROOT = Path(__file__).resolve().parents[3]
CSV = "item,unit,qty,unit_price,currency\n笔,支,2,3,CNY\n"
CHILD = """
import os,sys,time
from pathlib import Path
from services.local_tasks.repository import SQLiteTaskRepository
from services.local_tasks.runner import LocalWorker,WorkerLock
db,lock,ready,release,mode=map(Path,sys.argv[1:6])
if str(mode)=='lock':
 with WorkerLock(lock):
  ready.write_text('held')
  while not release.exists(): time.sleep(.01)
else:
 def hook():
  ready.write_text('claimed')
  if str(mode)=='crash': os._exit(17)
  while not release.exists(): time.sleep(.01)
 worker=LocalWorker(SQLiteTaskRepository(db),lock,after_checkpoint=hook)
 result=worker.run_next()
 print(result.status,flush=True)
"""


def _wait(path: Path):
    deadline = time.monotonic() + 5
    while not path.exists() and time.monotonic() < deadline:
        time.sleep(.01)
    assert path.exists()


def _process(tmp_path: Path, mode: str):
    ready, release = tmp_path / "ready", tmp_path / "release"
    child = subprocess.Popen([sys.executable, "-c", CHILD,
                              str(tmp_path / "tasks.sqlite3"), str(tmp_path / "worker.lock"),
                              str(ready), str(release), mode], cwd=ROOT,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    return child, ready, release


def _store(tmp_path: Path):
    store = SQLiteTaskRepository(tmp_path / "tasks.sqlite3")
    store.bootstrap()
    task = store.submit(SubmitRequest(command_id=str(uuid4()),
                       requirement_text="核对虚构商品", csv_text=CSV), str(uuid4()), 1, NOW).task
    return store, task


def test_real_process_lock_competition(tmp_path: Path):
    store, _ = _store(tmp_path)
    child, ready, release = _process(tmp_path, "lock")
    try:
        _wait(ready)
        with pytest.raises(LocalTaskError, match="busy"):
            LocalWorker(store, tmp_path / "worker.lock").run_next()
    finally:
        release.write_text("go")
        out, err = child.communicate(timeout=5)
    assert child.returncode == 0, err
    assert LocalWorker(store, tmp_path / "worker.lock").run_next().status == "completed"


def test_running_cancel_requires_worker_confirmation(tmp_path: Path):
    store, task = _store(tmp_path)
    child, ready, release = _process(tmp_path, "hold")
    try:
        _wait(ready)
        assert store.get(task.task_id).status == "running"
        request = store.cancel(task.task_id, str(uuid4()), NOW)
        assert request.task.status == "cancelling"
        assert store.get(task.task_id).status == "cancelling"
        with pytest.raises(LocalTaskError, match="busy"):
            LocalWorker(store, tmp_path / "worker.lock").recover()
    finally:
        release.write_text("go")
        out, err = child.communicate(timeout=5)
    assert child.returncode == 0 and out.strip() == "cancelled", err
    assert store.get(task.task_id).status == "cancelled"
    assert [item.kind for item in store.events(EventsRequest(task_id=task.task_id)).items] == [
        "submitted", "started", "cancel_requested", "cancelled"]


def test_actual_child_crash_explicit_recover_then_new_attempt(tmp_path: Path):
    store, task = _store(tmp_path)
    child, ready, release = _process(tmp_path, "crash")
    _wait(ready)
    out, err = child.communicate(timeout=5)
    assert child.returncode == 17
    assert store.get(task.task_id).status == "running"
    worker = LocalWorker(store, tmp_path / "worker.lock", clock=lambda: NOW)
    recovered = worker.recover()
    assert [item.task_id for item in recovered] == [task.task_id]
    assert recovered[0].status == "interrupted"
    assert worker.recover() == []
    old = store.attempts(task.task_id)[0]
    retry = store.retry(task.task_id, str(uuid4()), NOW)
    assert retry.task.current_attempt_id != old.attempt_id
    assert worker.run_next().status == "completed"
    assert store.attempts(task.task_id)[0] == old
    with pytest.raises(LocalTaskError, match="stale_attempt"):
        store.publish(task.task_id, old.attempt_id, NOW, error_code="late")


def test_result_transaction_fault_never_leaves_completed_without_result(tmp_path: Path):
    store, task = _store(tmp_path)
    store.before_result_insert = lambda: (_ for _ in ()).throw(RuntimeError("fault"))
    with pytest.raises(RuntimeError, match="fault"):
        LocalWorker(store, tmp_path / "worker.lock", clock=lambda: NOW).run_next()
    assert store.get(task.task_id).status == "running"
    assert LocalWorker(store, tmp_path / "worker.lock", clock=lambda: NOW).recover()[0].status == "interrupted"
