"""Explicit local profile contract; all examples are fictional."""

from __future__ import annotations

from uuid import uuid4

import pytest
from pydantic import ValidationError

from services.personal_ai.models import ChangeRequest, HistoryRequest, Preferences, UndoRequest
from services.personal_ai.schema import OUTPUT, schema_bytes


def change(**changes: object) -> dict[str, object]:
    return {"expected_revision": 1, "command_id": str(uuid4()), "changes": changes}


def test_defaults_unicode_multiline_and_preservation() -> None:
    assert Preferences().model_dump() == {
        "ai_name": "我的AI", "address_user_as": "", "communication_instructions": ""}
    value = Preferences(ai_name=" Mira ", address_user_as="Alex",
                        communication_instructions="回答直接一点。\n但保留来源。")
    assert value.ai_name == " Mira "
    assert value.communication_instructions.endswith("\n但保留来源。")
    assert ChangeRequest.model_validate(change(ai_name="米拉", address_user_as="Alex",
        communication_instructions="第一行\r\n第二行")).changes.replacements()["ai_name"] == "米拉"


@pytest.mark.parametrize("bad", ["", " \t ", "a\x00b", "\ud800", "😀" * 33])
def test_name_boundaries(bad: str) -> None:
    with pytest.raises(ValidationError):
        Preferences(ai_name=bad)


def test_byte_limits_and_control_policy() -> None:
    Preferences(ai_name="界" * 42, address_user_as="😀" * 32,
                communication_instructions="界" * 2730)
    for payload in [
        {"address_user_as": "😀" * 33},
        {"communication_instructions": "界" * 2731},
        {"communication_instructions": "hello\x00world"},
        {"address_user_as": "Alex\n"},
        {"communication_instructions": "\udfff"},
    ]:
        with pytest.raises(ValidationError):
            Preferences.model_validate(payload)


def test_structured_requests_reject_null_unknown_coercion_and_authority_fields() -> None:
    invalid = [
        change(), change(ai_name=None), change(ai_name=123), change(mood="kind"),
        change(profile_id=str(uuid4())), change(permission="all"),
        {**change(ai_name="Mira"), "owner": "caller"},
        {**change(ai_name="Mira"), "expected_revision": "1"},
        {**change(ai_name="Mira"), "command_id": "not-an-id"},
    ]
    for item in invalid:
        with pytest.raises(ValidationError):
            ChangeRequest.model_validate(item)
    with pytest.raises(ValidationError):
        UndoRequest.model_validate({"expected_revision": 2, "target_revision": 1,
                                   "command_id": str(uuid4()), "profile_id": str(uuid4())})
    with pytest.raises(ValidationError):
        HistoryRequest.model_validate({"limit": 101})
    with pytest.raises(ValidationError):
        HistoryRequest.model_validate({"before_revision": None})


def test_schema_is_deterministic_and_cwd_independent(monkeypatch: pytest.MonkeyPatch,
                                                     tmp_path) -> None:
    before = schema_bytes()
    assert OUTPUT.read_bytes() == before
    monkeypatch.chdir(tmp_path)
    assert schema_bytes() == before
    assert b'personal-ai-local/1' in before
    import json
    document = json.loads(before)
    patch = document["models"]["ChangeRequest"]["$defs"]["PreferenceChanges"]
    assert patch["properties"]["ai_name"]["type"] == "string"
    assert "default" not in patch["properties"]["ai_name"]
