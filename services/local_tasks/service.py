"""Nonvisual composition of the existing identity service and local task store."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable

from pydantic import ValidationError

from services.personal_ai.service import PersonalAIService

from .models import (CommandTaskRequest, EventsRequest, ListRequest, LocalTaskError,
                     ResultRequest, SubmitRequest, TaskIdRequest)
from .repository import SQLiteTaskRepository
from .runner import LocalWorker


class PersonalWorkbench:
    def __init__(self, profile: PersonalAIService, tasks: SQLiteTaskRepository,
                 worker: LocalWorker, *, clock: Callable[[], datetime] | None = None):
        self.profile = profile
        self.tasks = tasks
        self.worker = worker
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    @staticmethod
    def _request(model, value):
        try:
            return model.model_validate(value)
        except (ValidationError, ValueError, TypeError) as exc:
            raise LocalTaskError("invalid_request") from exc

    def bootstrap(self):
        profile = self.profile.bootstrap()
        self.tasks.bootstrap()
        return profile

    def submit(self, value):
        request = self._request(SubmitRequest, value)
        profile = self.profile.read()  # Body cannot claim its own identity/revision.
        return self.tasks.submit(request, profile.profile_id, profile.revision, self.clock())

    def get(self, value):
        request = self._request(TaskIdRequest, value)
        return self.tasks.get(request.task_id)

    def list(self, value):
        return self.tasks.list(self._request(ListRequest, value))

    def events(self, value):
        return self.tasks.events(self._request(EventsRequest, value))

    def result(self, value):
        return self.tasks.result(self._request(ResultRequest, value))

    def cancel(self, value):
        request = self._request(CommandTaskRequest, value)
        return self.tasks.cancel(request.task_id, request.command_id, self.clock())

    def retry(self, value):
        request = self._request(CommandTaskRequest, value)
        return self.tasks.retry(request.task_id, request.command_id, self.clock())

    def run_next(self):
        return self.worker.run_next()

    def recover(self):
        return self.worker.recover()
