"""Bounded, local-only JSONL evidence for the BATCH-006 offline fixture."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import uuid

KIND = "offline_fixture"
LINE_LIMIT = 64 * 1024
STREAM_LIMIT = 1024 * 1024


def _atomic_json(path: Path, value: dict) -> None:
    temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    try:
        with temporary.open("x", encoding="utf-8", newline="\n") as output:
            json.dump(value, output, ensure_ascii=False, sort_keys=True)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def read_record(directory: Path, observation_id: str) -> dict:
    """Read evidence only; never creates a directory or a child process."""
    if str(uuid.UUID(observation_id)) != observation_id:
        raise ValueError("invalid observation_id")
    directory = Path(directory)
    snapshot = json.loads((directory / "snapshot.json").read_text(encoding="utf-8"))
    if snapshot["observation_id"] != observation_id or snapshot["evidence_kind"] != KIND:
        raise ValueError("snapshot identity mismatch")
    events = []
    with (directory / "events.jsonl").open(encoding="utf-8") as source:
        for line in source:
            if not line.endswith("\n"):
                break  # interrupted final append is not an event
            try:
                event = json.loads(line)
            except (ValueError, TypeError):
                break
            if event.get("seq") != len(events) + 1 or event.get("observation_id") != observation_id:
                break
            events.append(event)
    snapshot["events"] = events
    snapshot["record_consistent"] = len(events) == snapshot["event_count"]
    if not snapshot["record_consistent"]:
        snapshot["product_task_state"] = None
        snapshot["evidence_incomplete"] = True
    if snapshot["observed_exit"] is None:
        snapshot["owner_recovery"] = "reconciliation_required; read_only; do_not_reclaim_pid"
    return snapshot


class EventLog:
    def __init__(self, directory: Path, observation_id: str, *, line_limit: int = LINE_LIMIT,
                 stream_limit: int = STREAM_LIMIT):
        if str(uuid.UUID(observation_id)) != observation_id:
            raise ValueError("invalid observation_id")
        if not (1 <= line_limit <= LINE_LIMIT and 1 <= stream_limit <= STREAM_LIMIT):
            raise ValueError("limits must be positive and at most fixed caps")
        self.directory = Path(directory)
        self.directory.mkdir(parents=False, exist_ok=False)
        self.observation_id = observation_id
        self.line_limit, self.stream_limit = line_limit, stream_limit
        self.buffers = {"stdout": bytearray(), "stderr": bytearray()}
        self.totals = {"stdout": 0, "stderr": 0}
        self.seq = 0
        self.session_id = None
        self.native_result_observed = False
        self.result_exit_code = None
        self.observed_exit = None
        self.cancel_request = None
        self.process_state = "created"
        self.errors = []
        self.limit_exceeded = False
        self._events = (self.directory / "events.jsonl").open("x", encoding="utf-8", newline="\n")
        self._raw = {stream: (self.directory / (stream + ".bin")).open("xb") for stream in self.buffers}
        self.record("observation_created", {})

    def record(self, kind: str, detail: dict) -> None:
        self.seq += 1
        event = {"seq": self.seq, "observation_id": self.observation_id,
                 "evidence_kind": KIND, "kind": kind, "detail": detail}
        self._events.write(json.dumps(event, ensure_ascii=False, sort_keys=True) + "\n")
        self._events.flush()
        os.fsync(self._events.fileno())
        self.snapshot()

    def snapshot(self) -> None:
        value = {"observation_id": self.observation_id, "evidence_kind": KIND,
                 "native_session_id": self.session_id, "native_run_id": None,
                 "product_task_state": None, "process_state": self.process_state,
                 "native_result_observed": self.native_result_observed,
                 "native_result_exit_code": self.result_exit_code,
                 "cancel_request": self.cancel_request, "observed_exit": self.observed_exit,
                 "event_count": self.seq, "raw_bytes": self.totals.copy(),
                 "errors": self.errors.copy(), "limit_exceeded": self.limit_exceeded,
                 "owner_recovery": "read_only; process state requires external reconciliation"}
        _atomic_json(self.directory / "snapshot.json", value)

    def feed(self, stream: str, data: bytes) -> bool:
        if stream not in self.buffers or not isinstance(data, bytes):
            raise ValueError("invalid stream or data")
        if self.limit_exceeded:
            return False
        remaining = self.stream_limit - self.totals[stream]
        write = data[:remaining]
        self._raw[stream].write(write)
        self._raw[stream].flush()
        self.totals[stream] += len(write)
        self.buffers[stream].extend(write)
        self._drain(stream, final=False)
        if self.limit_exceeded:
            return False
        if len(data) > remaining:
            self.limit_exceeded = True
            self.errors.append(f"{stream}_stream_limit_exceeded")
            self.record("limit_exceeded", {"stream": stream, "bytes_seen": self.totals[stream]})
            return False
        if len(self.buffers[stream]) > self.line_limit:
            self.limit_exceeded = True
            self.errors.append(f"{stream}_line_limit_exceeded")
            self.record("limit_exceeded", {"stream": stream, "line_bytes_seen": len(self.buffers[stream])})
            self.buffers[stream].clear()
            return False
        self.snapshot()
        return True

    def _drain(self, stream: str, *, final: bool) -> None:
        buffer = self.buffers[stream]
        while True:
            pos = buffer.find(b"\n")
            if pos < 0:
                break
            line = bytes(buffer[:pos])
            del buffer[:pos + 1]
            self._line(stream, line, terminated=True)
        if final and buffer:
            self._line(stream, bytes(buffer), terminated=False)
            buffer.clear()

    def _line(self, stream: str, line: bytes, *, terminated: bool) -> None:
        if len(line) > self.line_limit:
            self.limit_exceeded = True
            self.errors.append(f"{stream}_line_limit_exceeded")
            self.record("limit_exceeded", {"stream": stream, "line_bytes": len(line)})
            return
        try:
            content = line.decode("utf-8")
        except UnicodeDecodeError:
            self.errors.append("invalid_utf8")
            self.record("parse_error", {"stream": stream, "reason": "invalid_utf8", "terminated": terminated})
            return
        if stream == "stderr":
            self.record("stderr_line", {"text": content, "terminated": terminated})
            return
        if not content.strip():
            self.record("blank_line", {"terminated": terminated})
            return
        try:
            obj = json.loads(content)
        except ValueError:
            self.errors.append("invalid_json")
            self.record("parse_error", {"stream": stream, "reason": "invalid_json", "terminated": terminated})
            return
        if not isinstance(obj, dict) or not isinstance(obj.get("type"), str):
            self.errors.append("invalid_shape")
            self.record("parse_error", {"stream": stream, "reason": "invalid_shape", "terminated": terminated})
            return
        kind = obj["type"]
        if (kind == "system" and obj.get("subtype") == "init") or kind == "result":
            sid = obj.get("session_id")
            if not isinstance(sid, str) or not sid:
                self.errors.append("missing_session_id")
            elif self.session_id is None:
                self.session_id = sid
            elif self.session_id != sid:
                self.errors.append("session_id_conflict")
            if kind == "result":
                if self.native_result_observed:
                    self.errors.append("duplicate_result")
                self.native_result_observed = True
                code = obj.get("exit_code")
                if type(code) is int:
                    self.result_exit_code = code
                else:
                    self.errors.append("invalid_result_exit_code")
        self.record("native_event" if kind in {"system", "text", "tool_use", "tool_result", "result"}
                    else "unknown_native_event", {"native": obj, "terminated": terminated})

    def finish_stream(self, stream: str) -> None:
        self._drain(stream, final=True)
        self.record("stream_eof", {"stream": stream})

    def close(self) -> None:
        self.snapshot()
        self._events.close()
        for raw in self._raw.values():
            raw.close()
