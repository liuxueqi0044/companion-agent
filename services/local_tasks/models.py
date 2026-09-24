"""Single Pydantic authority for the private local-task/1 contract."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator, model_validator


VERSION = "local-task/1"
EXECUTOR = "local_csv_audit"
TOOL = "csv_audit/1"
Status = Literal["queued", "running", "cancelling", "completed", "failed", "cancelled", "interrupted"]
AttemptStatus = Literal["queued", "running", "completed", "failed", "cancelled", "interrupted"]


class LocalTaskError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


def canonical_uuid(value: str) -> str:
    try:
        parsed = UUID(value)
    except (ValueError, AttributeError) as exc:
        raise ValueError("invalid_uuid") from exc
    if parsed.version != 4 or str(parsed) != value:
        raise ValueError("invalid_uuid")
    return value


def utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() != timedelta(0):
        raise ValueError("utc_required")
    return value


def bounded_text(value: str, maximum: int) -> str:
    try:
        raw = value.encode("utf-8", "strict")
    except UnicodeError as exc:
        raise ValueError("invalid_utf8") from exc
    if not value.strip() or len(raw) > maximum or "\x00" in value:
        raise ValueError("invalid_text")
    return value


class SubmitRequest(StrictModel):
    command_id: str
    requirement_text: str
    csv_text: str
    executor: Literal["local_csv_audit"] = EXECUTOR
    tool_version: Literal["csv_audit/1"] = TOOL

    @field_validator("command_id")
    @classmethod
    def command_uuid(cls, value: str) -> str:
        return canonical_uuid(value)

    @field_validator("requirement_text")
    @classmethod
    def valid_requirement(cls, value: str) -> str:
        return bounded_text(value, 64 * 1024)

    @field_validator("csv_text")
    @classmethod
    def valid_csv(cls, value: str) -> str:
        return bounded_text(value, 256 * 1024)


class TaskIdRequest(StrictModel):
    task_id: str

    @field_validator("task_id")
    @classmethod
    def task_uuid(cls, value: str) -> str:
        return canonical_uuid(value)


class CommandTaskRequest(TaskIdRequest):
    command_id: str

    @field_validator("command_id")
    @classmethod
    def command_uuid(cls, value: str) -> str:
        return canonical_uuid(value)


class ListRequest(StrictModel):
    limit: StrictInt = Field(default=20, ge=1, le=100)
    before_task_id: str | None = None

    @field_validator("before_task_id")
    @classmethod
    def cursor_uuid(cls, value: str | None) -> str | None:
        return canonical_uuid(value) if value is not None else None


class EventsRequest(TaskIdRequest):
    after_seq: StrictInt = Field(default=0, ge=0)
    limit: StrictInt = Field(default=50, ge=1, le=200)


class ResultRequest(TaskIdRequest):
    offset: StrictInt = Field(default=0, ge=0)
    limit: StrictInt = Field(default=50, ge=1, le=100)
    issue_offset: StrictInt = Field(default=0, ge=0)
    issue_limit: StrictInt = Field(default=50, ge=1, le=100)


class TaskSnapshot(StrictModel):
    schema_version: Literal["local-task/1"] = VERSION
    task_id: str
    profile_id: str
    profile_revision: StrictInt = Field(gt=0)
    input_hash: str
    status: Status
    created_at: datetime
    updated_at: datetime
    last_seq: StrictInt = Field(ge=1)
    current_attempt_id: str
    attempt_count: StrictInt = Field(ge=1)
    executor: Literal["local_csv_audit"] = EXECUTOR
    tool_version: Literal["csv_audit/1"] = TOOL
    requirements_interpretation: Literal["not_run"] = "not_run"
    error_code: str | None = None

    @field_validator("task_id", "profile_id", "current_attempt_id")
    @classmethod
    def valid_uuid(cls, value: str) -> str:
        return canonical_uuid(value)

    @field_validator("created_at", "updated_at")
    @classmethod
    def valid_time(cls, value: datetime) -> datetime:
        return utc(value)

    @field_validator("input_hash")
    @classmethod
    def valid_hash(cls, value: str) -> str:
        if len(value) != 71 or not value.startswith("sha256:") or any(
                char not in "0123456789abcdef" for char in value[7:]):
            raise ValueError("invalid_hash")
        return value


class Attempt(StrictModel):
    attempt_id: str
    task_id: str
    ordinal: StrictInt = Field(gt=0)
    status: AttemptStatus
    created_at: datetime
    started_at: datetime | None = None
    ended_at: datetime | None = None
    error_code: str | None = None

    @field_validator("attempt_id", "task_id")
    @classmethod
    def valid_uuid(cls, value: str) -> str:
        return canonical_uuid(value)

    @field_validator("created_at", "started_at", "ended_at")
    @classmethod
    def valid_time(cls, value: datetime | None) -> datetime | None:
        return utc(value) if value is not None else None


class TaskEvent(StrictModel):
    task_id: str
    seq: StrictInt = Field(gt=0)
    kind: Literal["submitted", "started", "cancel_requested", "cancelled", "completed",
                  "failed", "interrupted", "retried"]
    status: Status
    attempt_id: str
    occurred_at: datetime

    @field_validator("task_id", "attempt_id")
    @classmethod
    def valid_uuid(cls, value: str) -> str:
        return canonical_uuid(value)

    @field_validator("occurred_at")
    @classmethod
    def valid_time(cls, value: datetime) -> datetime:
        return utc(value)


class Issue(StrictModel):
    code: Literal["missing_column", "empty_value", "format"]
    column: str
    record_index: StrictInt | None = Field(default=None, ge=1)
    source: str


class AuditRow(StrictModel):
    record_index: StrictInt = Field(ge=1)
    cells: dict[str, str]
    source_refs: dict[str, str]
    subtotal: str | None
    currency: str | None
    formula: str | None


class AuditResult(StrictModel):
    schema_version: Literal["local-task/1"] = VERSION
    tool_version: Literal["csv_audit/1"] = TOOL
    input_hash: str
    requirements_interpretation: Literal["not_run"] = "not_run"
    paid_model_calls: Literal[0] = 0
    headers: list[str]
    rows: list[AuditRow]
    issues: list[Issue]
    currency_subtotals: dict[str, str]
    total: str | None
    total_currency: str | None
    completeness: Literal["complete", "partial", "mixed_currency", "unknown"]
    source_rule: Literal["logical_record_index_1_based"] = "logical_record_index_1_based"

    @model_validator(mode="after")
    def valid_complete(self) -> "AuditResult":
        if self.completeness == "complete" and (self.total is None or self.total_currency is None or self.issues):
            raise ValueError("complete_result_inconsistent")
        if self.completeness != "complete" and self.total is not None:
            raise ValueError("partial_total_forbidden")
        if len(self.rows) > 500:
            raise ValueError("too_many_rows")
        return self


class TaskPage(StrictModel):
    items: list[TaskSnapshot]
    next_before_task_id: str | None


class EventPage(StrictModel):
    task_id: str
    items: list[TaskEvent]
    next_after_seq: StrictInt | None
    last_seq: StrictInt


class ResultPage(StrictModel):
    task_id: str
    attempt_id: str
    status: Literal["completed"] = "completed"
    metadata: dict[str, object]
    rows: list[AuditRow]
    next_offset: StrictInt | None
    issues: list[Issue]
    next_issue_offset: StrictInt | None


class ActionReceipt(StrictModel):
    task: TaskSnapshot
    replayed: bool = False
    disposition: Literal["applied", "too_late", "already_requested", "replayed"] = "applied"
