"""Trusted test-only root and worker hook; public CLI accepts neither."""

from pathlib import Path
import json
import os
import sys
import time

REPO = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(REPO))

from services.desktop_bridge import entry


root, mode, ready, release = (Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3]),
                              Path(sys.argv[4]))
if Path(entry.__file__).resolve() != REPO / "services/desktop_bridge/entry.py":
    raise RuntimeError("wrong_source_import")
if not root.resolve().is_relative_to(REPO / "reports/evidence/BATCH-016-R1/tmp"):
    raise RuntimeError("wrong_test_data_root")
raw = sys.stdin.buffer.read(entry.MAX_INPUT + 1)
try:
    action = json.loads(raw)["action"]
except (ValueError, KeyError):
    action = None

if action == "worker.run-next" and mode in {"gate", "crash"}:
    original = entry.create_app

    def hooked_factory(path):
        app = original(path)

        def hook():
            ready.write_text("claimed", encoding="utf-8")
            if mode == "crash":
                os._exit(17)
            deadline = time.monotonic() + 10
            while not release.exists() and time.monotonic() < deadline:
                time.sleep(0.01)
            if not release.exists():
                raise RuntimeError("test_gate_timeout")

        app.worker.after_checkpoint = hook
        return app

    entry.create_app = hooked_factory

status, output = entry.handle_bytes(raw, root=root)
if action == "task.submit" and mode == "ack_loss" and status == 0 and json.loads(output)["ok"]:
    ready.write_text("committed", encoding="utf-8")
    os._exit(17)
if action == "worker.run-next" and mode == "worker_ack_loss" and status == 0 and json.loads(output)["ok"]:
    ready.write_text("completed", encoding="utf-8")
    os._exit(17)
sys.stdout.buffer.write(output)
raise SystemExit(status)
