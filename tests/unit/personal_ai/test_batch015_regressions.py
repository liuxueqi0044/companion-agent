"""Independent-review regressions for cached receipts and strict history input."""

from datetime import datetime, timezone
import json
import sqlite3
from uuid import uuid4

import pytest

from services.personal_ai.models import PersonalAIError
from services.personal_ai.repository import SQLitePersonalAIRepository
from services.personal_ai.service import PersonalAIService


NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)


def _ready(tmp_path):
    db = tmp_path / "profile.sqlite3"
    service = PersonalAIService(SQLitePersonalAIRepository(db), clock=lambda: NOW)
    service.bootstrap()
    first = {"expected_revision": 1, "command_id": str(uuid4()),
             "changes": {"ai_name": "Mira"}}
    receipt = service.change(first)
    return db, service, first, receipt


def test_cached_receipt_must_equal_original_revision(tmp_path):
    db, service, first, receipt = _ready(tmp_path)
    service.change({"expected_revision": 2, "command_id": str(uuid4()),
                    "changes": {"ai_name": "Later"}})
    assert service.change(first).replayed
    with sqlite3.connect(db) as connection:
        forged = receipt.result_snapshot.model_dump(mode="json")
        forged["preferences"]["ai_name"] = "Forged"
        connection.execute("UPDATE commands SET result_snapshot_json=? WHERE command_id=?",
                           (json.dumps(forged), first["command_id"]))
    before = db.read_bytes()
    with pytest.raises(PersonalAIError, match="recovery_required"):
        service.change(first)
    assert db.read_bytes() == before


@pytest.mark.parametrize("damage", ["missing", "wrong_revision", "wrong_operation", "wrong_id"])
def test_command_revision_relation_is_bidirectional(tmp_path, damage):
    db, service, first, _ = _ready(tmp_path)
    if damage == "wrong_id":
        service.change({"expected_revision": 2, "command_id": str(uuid4()),
                        "changes": {"ai_name": "Later"}})
    with sqlite3.connect(db) as connection:
        if damage == "missing":
            connection.execute("DELETE FROM commands WHERE command_id=?", (first["command_id"],))
        elif damage == "wrong_revision":
            connection.execute("UPDATE commands SET result_revision=1 WHERE command_id=?",
                               (first["command_id"],))
        elif damage == "wrong_operation":
            connection.execute("UPDATE commands SET operation='undo' WHERE command_id=?",
                               (first["command_id"],))
        else:
            connection.execute("UPDATE commands SET result_revision=3 WHERE command_id=?",
                               (first["command_id"],))
    before = db.read_bytes()
    with pytest.raises(PersonalAIError, match="recovery_required"):
        service.read()
    assert db.read_bytes() == before


def test_history_rejects_falsey_non_none_input(tmp_path):
    _, service, _, _ = _ready(tmp_path)
    assert service.history(None).items
    assert service.history({"limit": 1}).items
    for invalid in ([], False, 0, ""):
        with pytest.raises(PersonalAIError, match="invalid_request"):
            service.history(invalid)
