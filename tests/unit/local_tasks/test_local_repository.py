"""Persistent local-task state, paging and transition regressions."""

from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import pytest

from services.local_tasks.models import (EventsRequest, ListRequest, LocalTaskError,
                                         SubmitRequest)
from services.local_tasks.repository import SQLiteTaskRepository


NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)
CSV = "item,unit,qty,unit_price,currency\n笔,支,2,3.50,CNY\n"


def submit(store: SQLiteTaskRepository, command_id: str | None = None,
           csv_text: str = CSV):
    request = SubmitRequest(command_id=command_id or str(uuid4()),
                            requirement_text="核对虚构用品报价", csv_text=csv_text)
    return request, store.submit(request, str(uuid4()), 2, NOW)


def test_submit_idempotency_restart_and_paging(tmp_path: Path):
    db = tmp_path / "tasks.sqlite3"
    store = SQLiteTaskRepository(db)
    with pytest.raises(LocalTaskError, match="not_initialized"):
        store.list(ListRequest())
    store.bootstrap()
    profile_id = str(uuid4())
    command_id = str(uuid4())
    request = SubmitRequest(command_id=command_id, requirement_text="虚构需求", csv_text=CSV)
    first = store.submit(request, profile_id, 2, NOW)
    again = SQLiteTaskRepository(db).submit(request, profile_id, 3, NOW)
    assert again.replayed and again.task.task_id == first.task.task_id
    assert again.task.profile_revision == 2
    with pytest.raises(LocalTaskError, match="idempotency_conflict"):
        store.submit(request.model_copy(update={"csv_text": CSV + "\n"}), profile_id, 2, NOW)
    assert store.get(first.task.task_id) == first.task
    assert [event.kind for event in store.events(EventsRequest(task_id=first.task.task_id)).items] == ["submitted"]
    second = store.submit(SubmitRequest(command_id=str(uuid4()),
                          requirement_text="另一需求", csv_text=CSV), profile_id, 2, NOW)
    page = store.list(ListRequest(limit=1))
    assert len(page.items) == 1 and page.next_before_task_id
    older = store.list(ListRequest(limit=1, before_task_id=page.next_before_task_id))
    assert {page.items[0].task_id, older.items[0].task_id} == {first.task.task_id, second.task.task_id}
    assert older.next_before_task_id is None


def test_cancel_retry_and_late_attempt_is_rejected(tmp_path: Path):
    store = SQLiteTaskRepository(tmp_path / "tasks.sqlite3")
    store.bootstrap()
    _, first = submit(store)
    claim = store.claim_next(NOW)
    assert claim and claim.task.task_id == first.task.task_id
    assert store.events(EventsRequest(task_id=first.task.task_id, after_seq=1)).items[0].kind == "started"
    cancel = store.cancel(first.task.task_id, str(uuid4()), NOW)
    assert cancel.task.status == "cancelling"
    assert store.is_cancelling(first.task.task_id, claim.attempt_id)
    with pytest.raises(LocalTaskError, match="cancel_pending"):
        store.publish(first.task.task_id, claim.attempt_id, NOW, error_code="tool_error")
    cancelled = store.publish(first.task.task_id, claim.attempt_id, NOW, cancelled=True)
    assert cancelled.status == "cancelled"
    with pytest.raises(LocalTaskError, match="invalid_transition"):
        store.retry(first.task.task_id, str(uuid4()), NOW)
    assert store.cancel(first.task.task_id, str(uuid4()), NOW).disposition == "too_late"
    with pytest.raises(LocalTaskError, match="stale_attempt"):
        store.publish(first.task.task_id, claim.attempt_id, NOW, error_code="late")


def test_failed_retry_preserves_attempt_and_events(tmp_path: Path):
    store = SQLiteTaskRepository(tmp_path / "tasks.sqlite3")
    store.bootstrap()
    _, first = submit(store)
    claim = store.claim_next(NOW)
    store.publish(first.task.task_id, claim.attempt_id, NOW, error_code="invalid_csv")
    old = store.attempts(first.task.task_id)[0]
    retry_id = str(uuid4())
    retried = store.retry(first.task.task_id, retry_id, NOW)
    assert retried.task.status == "queued" and retried.task.attempt_count == 2
    assert store.retry(first.task.task_id, retry_id, NOW).replayed
    assert store.attempts(first.task.task_id)[0] == old
    assert store.attempts(first.task.task_id)[1].status == "queued"
    assert [event.seq for event in store.events(EventsRequest(task_id=first.task.task_id)).items] == [1, 2, 3, 4]
    assert store.claim_next(NOW).attempt_id != claim.attempt_id
    with pytest.raises(LocalTaskError, match="stale_attempt"):
        store.publish(first.task.task_id, claim.attempt_id, NOW, error_code="late")
