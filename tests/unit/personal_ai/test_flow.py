"""Fictional consumer changes do not own local identity or preferences."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import pytest

from services.personal_ai.models import PersonalAIError
from services.personal_ai.repository import SQLitePersonalAIRepository
from services.personal_ai.service import PersonalAIService


NOW = datetime(2026, 2, 1, 8, tzinfo=timezone.utc)


def consumer(db: Path, *, view_revision: str, executor: str) -> PersonalAIService:
    # These two synthetic switches are intentionally outside the profile repository.
    assert view_revision and executor
    return PersonalAIService(SQLitePersonalAIRepository(db), clock=lambda: NOW)


def test_mira_alex_full_chain_survives_view_and_executor_switch(tmp_path: Path) -> None:
    db = tmp_path / "fictional-profile.sqlite3"
    first_consumer = consumer(db, view_revision="view-a", executor="unavailable-a")
    seed = first_consumer.bootstrap()
    assert seed.preferences.ai_name == "我的AI" and seed.revision == 1
    request = {"expected_revision": 1, "command_id": str(uuid4()), "changes": {
        "ai_name": "Mira", "address_user_as": "Alex",
        "communication_instructions": "回答直接一点。\n数字未知时请说明未知。"}}
    first_result = first_consumer.change(request)
    assert first_result.result_revision == 2
    second_consumer = consumer(db, view_revision="view-b", executor="unavailable-b")
    switched = second_consumer.read()
    assert switched.profile_id == seed.profile_id
    assert switched.preferences == first_result.result_snapshot.preferences
    assert switched.preferences.communication_instructions == "回答直接一点。\n数字未知时请说明未知。"
    with pytest.raises(PersonalAIError, match="invalid_request"):
        second_consumer.change({**request, "owner": "claimed-owner"})
    with pytest.raises(PersonalAIError, match="conflict"):
        second_consumer.change({"expected_revision": 1, "command_id": str(uuid4()),
                                "changes": {"ai_name": "Overwritten"}})
    newer = second_consumer.change({"expected_revision": 2, "command_id": str(uuid4()),
                                     "changes": {"address_user_as": "Alex Chen"}})
    replay = first_consumer.change(request)
    assert replay.replayed and replay.result_revision == 2
    assert replay.result_snapshot.preferences.address_user_as == "Alex"
    assert replay.current_snapshot == newer.current_snapshot
    undone = first_consumer.undo({"expected_revision": 3, "target_revision": 2,
                                  "command_id": str(uuid4())})
    assert undone.result_revision == 4 and undone.result_snapshot.profile_id == seed.profile_id
    assert undone.result_snapshot.preferences.address_user_as == "Alex"
    assert [item.revision for item in second_consumer.history({"limit": 10}).items] == [4, 3, 2, 1]
    assert consumer(db, view_revision="view-c", executor="unavailable-c").read() == undone.current_snapshot


def test_service_rejects_non_utc_clock_and_does_not_initialize(tmp_path: Path) -> None:
    db = tmp_path / "clock.sqlite3"
    service = PersonalAIService(SQLitePersonalAIRepository(db),
                                clock=lambda: datetime(2026, 1, 1))
    with pytest.raises(PersonalAIError, match="recovery_required"):
        service.bootstrap()
    assert not db.exists()
