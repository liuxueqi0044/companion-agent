"""Own exactly one self-authored offline fixture process; never launch Hermes."""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import os
from pathlib import Path
import queue
import stat
import subprocess
import threading
import time
import uuid

from hermes_eventlog import EventLog, read_record

REPO = Path(__file__).resolve().parents[2]
TMP_ROOT = REPO / "reports/evidence/M00.3.01/tmp"
PYTHON = REPO / ".local-tools/python-3.13.15/python.exe"
CHILD = REPO / "reports/evidence/M00.3.01/offline/fixture_child.py"
FIXTURE_SHA256 = "ac915f36fafb304ef7b9d94209447ac28a956d692e83c822fcccb60ebe8c9c4e"
SCENARIOS = frozenset({"normal", "no_result", "damaged", "long_output", "stderr_flood", "wait_cancel", "slow_normal"})
WALL_SECONDS = 8.0
CANCEL_GRACE_SECONDS = 2.0


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_directory(path: Path, *, allow_missing: bool = True) -> Path:
    """Keep fixture writes under the single task tmp tree and reject reparse points."""
    path = Path(os.path.abspath(path))
    root = Path(os.path.abspath(TMP_ROOT))
    try:
        rel = path.relative_to(root)
    except ValueError as exc:
        raise ValueError("fixture path escapes task tmp") from exc
    current = REPO
    for component in root.relative_to(REPO).parts + rel.parts:
        current = current / component
        try:
            info = current.lstat()
        except FileNotFoundError:
            if allow_missing:
                continue
            raise
        if stat.S_ISLNK(info.st_mode) or info.st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT:
            raise ValueError("fixture path contains link or reparse point")
        if not stat.S_ISDIR(info.st_mode):
            raise ValueError("fixture path contains non-directory")
    return path


def _validate_fixed_file(path: Path) -> None:
    current = REPO
    for part in path.relative_to(REPO).parts:
        current = current / part
        info = current.lstat()
        if stat.S_ISLNK(info.st_mode) or info.st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT:
            raise ValueError("fixed executable or fixture path is redirected")
    if not stat.S_ISREG(info.st_mode):
        raise ValueError("fixed executable or fixture is not a regular file")


def _pump(stream: str, pipe, sink: queue.Queue) -> None:
    try:
        while data := os.read(pipe.fileno(), 4096):
            sink.put((stream, data))
    finally:
        sink.put((stream, None))


def run_fixture(scenario: str, *, observation_id: str | None = None,
                output_root: Path = TMP_ROOT, cancel_after: float | None = None,
                line_limit: int = 64 * 1024, stream_limit: int = 1024 * 1024) -> dict:
    if scenario not in SCENARIOS:
        raise ValueError("unsupported fixture scenario")
    if cancel_after is not None and not (0 <= cancel_after <= WALL_SECONDS):
        raise ValueError("invalid cancel delay")
    observation_id = observation_id or str(uuid.uuid4())
    if str(uuid.UUID(observation_id)) != observation_id:
        raise ValueError("invalid observation_id")
    root = safe_directory(output_root)
    root.mkdir(parents=True, exist_ok=True)
    directory = safe_directory(root / observation_id)
    _validate_fixed_file(PYTHON)
    _validate_fixed_file(CHILD)
    if hashlib.sha256(CHILD.read_bytes()).hexdigest() != FIXTURE_SHA256:
        raise ValueError("fixed fixture content mismatch")
    log = EventLog(directory, observation_id, line_limit=line_limit, stream_limit=stream_limit)
    child = None
    try:
        env = {key: os.environ[key] for key in ("SystemRoot", "WINDIR") if key in os.environ}
        env.update({"PYTHONIOENCODING": "utf-8", "PYTHONDONTWRITEBYTECODE": "1",
                    "TEMP": str(directory), "TMP": str(directory)})
        child = subprocess.Popen([str(PYTHON), "-I", str(CHILD), scenario], cwd=directory,
                                 env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                 stderr=subprocess.PIPE, shell=False,
                                 creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        log.process_state = "running"
        log.record("process_started", {"pid": child.pid, "at": now(), "scenario": scenario})
        sink: queue.Queue = queue.Queue(maxsize=16)
        readers = [threading.Thread(target=_pump, args=(name, pipe, sink), daemon=True)
                   for name, pipe in (("stdout", child.stdout), ("stderr", child.stderr))]
        for reader in readers:
            reader.start()
        started = time.monotonic()
        stop_at = None
        eof = set()
        while len(eof) < 2 or child.poll() is None:
            elapsed = time.monotonic() - started
            if cancel_after is not None and elapsed >= cancel_after and log.cancel_request is None:
                _request_stop(child, log, "user_fixture_cancel")
                stop_at = time.monotonic()
            if elapsed > WALL_SECONDS and child.poll() is None and log.cancel_request is None:
                _request_stop(child, log, "wall_timeout")
                stop_at = time.monotonic()
            if log.limit_exceeded and child.poll() is None and log.cancel_request is None:
                _request_stop(child, log, "output_limit")
                stop_at = time.monotonic()
            if stop_at is not None and child.poll() is None:
                if time.monotonic() - stop_at > CANCEL_GRACE_SECONDS:
                    child.kill()
                    log.record("kill_after_grace", {"at": now()})
                    stop_at = None
            try:
                stream, data = sink.get(timeout=0.05)
            except queue.Empty:
                pass
            else:
                if data is None:
                    eof.add(stream)
                    log.finish_stream(stream)
                elif not log.feed(stream, data) and child.poll() is None and log.cancel_request is None:
                    _request_stop(child, log, "output_limit")
                    stop_at = time.monotonic()
        for reader in readers:
            reader.join(timeout=1)
        child.stdout.close()
        child.stderr.close()
        code = child.wait(timeout=1)
        log.process_state = "exited"
        log.observed_exit = {"exit_code": code, "at": now()}
        if log.native_result_observed and log.result_exit_code != code:
            log.errors.append("result_process_exit_conflict")
        if not log.native_result_observed:
            log.errors.append("native_result_missing")
        log.record("observed_exit", log.observed_exit)
        return read_record(directory, observation_id)
    finally:
        if child is not None and child.poll() is None:
            child.kill()  # only the exact Popen object owned here
            child.wait(timeout=CANCEL_GRACE_SECONDS)
        if child is not None:
            if child.stdout and not child.stdout.closed:
                child.stdout.close()
            if child.stderr and not child.stderr.closed:
                child.stderr.close()
        log.close()


def _request_stop(child: subprocess.Popen, log: EventLog, reason: str) -> None:
    detail = {"at": now(), "reason": reason, "request_returned": False}
    try:
        child.terminate()  # Windows TerminateProcess request; no claimed Hermes semantics
        detail["request_returned"] = True
    except OSError as exc:
        detail["error"] = type(exc).__name__
    log.cancel_request = detail
    log.process_state = "stop_requested"
    log.record("cancel_request", detail)
