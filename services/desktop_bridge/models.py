"""Pydantic single source for the desktop-local/1 transport envelope."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from services.local_tasks.models import canonical_uuid


VERSION = "desktop-local/1"
Action = Literal[
    "bootstrap", "profile.read", "profile.change", "profile.undo",
    "task.submit", "task.get", "task.list", "task.events", "task.result",
    "task.cancel", "task.retry", "worker.run-next", "worker.recover",
]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class RequestEnvelope(StrictModel):
    version: Literal["desktop-local/1"]
    request_id: str
    action: Action
    payload: dict[str, Any]

    @field_validator("request_id")
    @classmethod
    def valid_id(cls, value: str) -> str:
        return canonical_uuid(value)


class ErrorInfo(StrictModel):
    kind: Literal["business", "protocol"]
    code: str = Field(min_length=1, max_length=64, pattern=r"^[a-z][a-z0-9_]*$")


class ResponseEnvelope(StrictModel):
    version: Literal["desktop-local/1"] = VERSION
    request_id: str | None
    ok: bool
    result: Any | None = None
    error: ErrorInfo | None = None

    @field_validator("request_id")
    @classmethod
    def valid_id(cls, value: str | None) -> str | None:
        return canonical_uuid(value) if value is not None else None

    @model_validator(mode="after")
    def matched_shape(self) -> "ResponseEnvelope":
        if self.ok == (self.error is not None):
            raise ValueError("response_shape")
        return self
