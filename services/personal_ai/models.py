"""The single Pydantic source for the private personal-ai-local/1 contract."""

from __future__ import annotations

from datetime import datetime, timedelta
import unicodedata
from uuid import UUID
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator, model_validator
from pydantic.json_schema import SkipJsonSchema


SCHEMA_VERSION = "personal-ai-local/1"


class PersonalAIError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


def _omit_none_default(schema: dict) -> None:
    # Pydantic needs None as an internal omission sentinel; JSON callers may not send null.
    schema.pop("default", None)


def _text(value: str, *, name: str, maximum: int, multiline: bool = False,
          nonblank: bool = False) -> str:
    try:
        raw = value.encode("utf-8", errors="strict")
    except UnicodeError as exc:
        raise ValueError(f"{name}_invalid_unicode") from exc
    if len(raw) > maximum or (nonblank and not value.strip()):
        raise ValueError(f"{name}_invalid_length")
    for char in value:
        category = unicodedata.category(char)
        if category == "Cs" or (category == "Cc" and not
                (multiline and char in "\n\r\t")):
            raise ValueError(f"{name}_control_character")
    return value


def _canonical_uuid(value: str) -> str:
    try:
        parsed = UUID(value)
    except (ValueError, AttributeError) as exc:
        raise ValueError("uuid_invalid") from exc
    if parsed.version != 4 or str(parsed) != value:
        raise ValueError("uuid_must_be_canonical_v4")
    return value


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() != timedelta(0):
        raise ValueError("utc_timestamp_required")
    return value


class Preferences(StrictModel):
    ai_name: str = Field(default="我的AI", description="Nonblank; at most 128 UTF-8 bytes; original text preserved.")
    address_user_as: str = Field(default="", description="At most 128 UTF-8 bytes; may be empty.")
    communication_instructions: str = Field(
        default="", description="At most 8192 UTF-8 bytes; newlines permitted; preference data only.")

    @field_validator("ai_name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        return _text(value, name="ai_name", maximum=128, nonblank=True)

    @field_validator("address_user_as")
    @classmethod
    def valid_address(cls, value: str) -> str:
        return _text(value, name="address_user_as", maximum=128)

    @field_validator("communication_instructions")
    @classmethod
    def valid_instructions(cls, value: str) -> str:
        return _text(value, name="communication_instructions", maximum=8192, multiline=True)


class PreferenceChanges(StrictModel):
    # SkipJsonSchema removes nullable branches: omitted is permitted; explicit null is not.
    ai_name: str | SkipJsonSchema[None] = Field(default=None, json_schema_extra=_omit_none_default)
    address_user_as: str | SkipJsonSchema[None] = Field(
        default=None, json_schema_extra=_omit_none_default)
    communication_instructions: str | SkipJsonSchema[None] = Field(
        default=None, json_schema_extra=_omit_none_default)

    @model_validator(mode="after")
    def validate_patch(self) -> "PreferenceChanges":
        if not 1 <= len(self.model_fields_set) <= 3:
            raise ValueError("one_to_three_changes_required")
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("null_change_forbidden")
        # Reuse Preferences validators and their byte/unicode policy, without altering text.
        Preferences.model_validate({
            "ai_name": self.ai_name if "ai_name" in self.model_fields_set else "我的AI",
            "address_user_as": self.address_user_as
                if "address_user_as" in self.model_fields_set else "",
            "communication_instructions": self.communication_instructions
                if "communication_instructions" in self.model_fields_set else "",
        })
        return self

    def replacements(self) -> dict[str, str]:
        return {field: getattr(self, field) for field in self.model_fields_set}


class ChangeRequest(StrictModel):
    expected_revision: StrictInt = Field(gt=0)
    command_id: str
    changes: PreferenceChanges

    @field_validator("command_id")
    @classmethod
    def valid_command_id(cls, value: str) -> str:
        return _canonical_uuid(value)


class UndoRequest(StrictModel):
    expected_revision: StrictInt = Field(gt=0)
    target_revision: StrictInt = Field(gt=0)
    command_id: str

    @field_validator("command_id")
    @classmethod
    def valid_command_id(cls, value: str) -> str:
        return _canonical_uuid(value)


class HistoryRequest(StrictModel):
    limit: StrictInt = Field(default=20, ge=1, le=100)
    before_revision: Annotated[StrictInt, Field(gt=0)] | SkipJsonSchema[None] = Field(
        default=None, json_schema_extra=_omit_none_default)

    @model_validator(mode="after")
    def no_explicit_null(self) -> "HistoryRequest":
        if "before_revision" in self.model_fields_set and self.before_revision is None:
            raise ValueError("null_cursor_forbidden")
        return self


class ProfileSnapshot(StrictModel):
    schema_version: Literal["personal-ai-local/1"] = SCHEMA_VERSION
    profile_id: str
    revision: StrictInt = Field(gt=0)
    preferences: Preferences
    updated_at: datetime

    @field_validator("profile_id")
    @classmethod
    def valid_profile_id(cls, value: str) -> str:
        return _canonical_uuid(value)

    @field_validator("updated_at")
    @classmethod
    def valid_timestamp(cls, value: datetime) -> datetime:
        return _utc(value)


class PreferenceRevision(StrictModel):
    revision: StrictInt = Field(gt=0)
    operation: Literal["bootstrap", "change", "undo"]
    target_revision: StrictInt | None = Field(default=None, gt=0)
    command_id: str | None = None
    preferences: Preferences
    created_at: datetime

    @field_validator("command_id")
    @classmethod
    def valid_command_id(cls, value: str | None) -> str | None:
        return _canonical_uuid(value) if value is not None else None

    @field_validator("created_at")
    @classmethod
    def valid_timestamp(cls, value: datetime) -> datetime:
        return _utc(value)

    @model_validator(mode="after")
    def valid_operation(self) -> "PreferenceRevision":
        if (self.operation == "bootstrap") != (self.command_id is None):
            raise ValueError("revision_command_relation")
        if (self.operation == "undo") != (self.target_revision is not None):
            raise ValueError("revision_target_relation")
        return self


class HistoryPage(StrictModel):
    profile_id: str
    current_revision: StrictInt = Field(gt=0)
    items: list[PreferenceRevision]
    next_before_revision: StrictInt | None = Field(default=None, gt=0)

    @field_validator("profile_id")
    @classmethod
    def valid_profile_id(cls, value: str) -> str:
        return _canonical_uuid(value)


class CommandReceipt(StrictModel):
    command_id: str
    operation: Literal["change", "undo"]
    result_revision: StrictInt = Field(gt=0)
    result_snapshot: ProfileSnapshot
    current_snapshot: ProfileSnapshot
    replayed: bool

    @field_validator("command_id")
    @classmethod
    def valid_command_id(cls, value: str) -> str:
        return _canonical_uuid(value)
