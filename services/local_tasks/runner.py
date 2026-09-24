"""One-shot, OS-locked worker for the only permitted local executor."""

from __future__ import annotations

from datetime import datetime, timezone
import os
from pathlib import Path
from typing import Callable

from .csv_audit import audit_csv
from .models import LocalTaskError, TaskSnapshot
from .repository import SQLiteTaskRepository


class _CancelObserved(Exception):
    pass


class WorkerLock:
    """A kernel-released exclusive byte/flock; file existence is not ownership."""

    def __init__(self, path: Path):
        self.path = Path(path)
        self.fd: int | None = None

    def __enter__(self) -> "WorkerLock":
        if os.path.islink(self.path) or (hasattr(os.path, "isjunction") and
                                         os.path.isjunction(self.path)):
            raise LocalTaskError("recovery_required")
        self.fd = os.open(self.path, os.O_CREAT | os.O_RDWR, 0o600)
        try:
            if os.fstat(self.fd).st_size == 0:
                os.write(self.fd, b"\0")
            os.lseek(self.fd, 0, os.SEEK_SET)
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(self.fd, msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            os.close(self.fd)
            self.fd = None
            raise LocalTaskError("busy") from exc
        return self

    def __exit__(self, *_exc: object) -> None:
        if self.fd is None:
            return
        try:
            os.lseek(self.fd, 0, os.SEEK_SET)
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(self.fd, msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.fd, fcntl.LOCK_UN)
        finally:
            os.close(self.fd)
            self.fd = None


class LocalWorker:
    def __init__(self, repository: SQLiteTaskRepository, lock_path: Path,
                 *, clock: Callable[[], datetime] | None = None,
                 after_checkpoint: Callable[[], None] | None = None):
        self.repository = repository
        self.lock_path = Path(lock_path)
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.after_checkpoint = after_checkpoint  # controlled offline test hook

    def _check(self, task_id: str, attempt_id: str) -> None:
        if self.repository.is_cancelling(task_id, attempt_id):
            raise _CancelObserved()
        if self.after_checkpoint:
            self.after_checkpoint()
        if self.repository.is_cancelling(task_id, attempt_id):
            raise _CancelObserved()

    def run_next(self) -> TaskSnapshot | None:
        with WorkerLock(self.lock_path):
            claim = self.repository.claim_next(self.clock())
            if claim is None:
                return None
            task_id, attempt_id = claim.task.task_id, claim.attempt_id
            if claim.task.executor != "local_csv_audit" or claim.task.tool_version != "csv_audit/1":
                raise LocalTaskError("recovery_required")

            def check() -> None:
                self._check(task_id, attempt_id)

            try:
                check()
                result = audit_csv(claim.csv_text, claim.task.input_hash, checkpoint=check)
                check()
                return self.repository.publish(task_id, attempt_id, self.clock(), result=result)
            except _CancelObserved:
                return self.repository.publish(task_id, attempt_id, self.clock(), cancelled=True)
            except LocalTaskError as exc:
                if exc.code == "cancel_pending":
                    return self.repository.publish(task_id, attempt_id, self.clock(), cancelled=True)
                if exc.code in {"invalid_csv", "invalid_csv_shape", "csv_limit"}:
                    try:
                        return self.repository.publish(task_id, attempt_id, self.clock(), error_code=exc.code)
                    except LocalTaskError as publish_exc:
                        if publish_exc.code == "cancel_pending":
                            return self.repository.publish(task_id, attempt_id, self.clock(), cancelled=True)
                        raise
                raise

    def recover(self) -> list[TaskSnapshot]:
        with WorkerLock(self.lock_path):
            return self.repository.recover_running(self.clock())
