"""In-process application boundary for explicit single-user profile commands."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable

from pydantic import ValidationError

from .models import (
    ChangeRequest, CommandReceipt, HistoryPage, HistoryRequest, PersonalAIError,
    ProfileSnapshot, UndoRequest,
)
from .repository import PersonalAIRepository


class PersonalAIService:
    def __init__(self, repository: PersonalAIRepository,
                 *, clock: Callable[[], datetime] | None = None):
        self.repository = repository
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    def _now(self) -> datetime:
        value = self.clock()
        if not isinstance(value, datetime) or value.tzinfo is None or value.utcoffset() is None:
            raise PersonalAIError("recovery_required")
        if value.utcoffset().total_seconds() != 0:
            raise PersonalAIError("recovery_required")
        return value

    @staticmethod
    def _request(model, value):
        try:
            return model.model_validate(value)
        except (ValidationError, ValueError, TypeError) as exc:
            raise PersonalAIError("invalid_request") from exc

    def bootstrap(self) -> ProfileSnapshot:
        return self.repository.bootstrap(self._now())

    def read(self) -> ProfileSnapshot:
        return self.repository.read()

    def change(self, request: ChangeRequest | dict) -> CommandReceipt:
        return self.repository.change(self._request(ChangeRequest, request), self._now())

    def undo(self, request: UndoRequest | dict) -> CommandReceipt:
        return self.repository.undo(self._request(UndoRequest, request), self._now())

    def history(self, request: HistoryRequest | dict | None = None) -> HistoryPage:
        return self.repository.history(self._request(
            HistoryRequest, {} if request is None else request))
