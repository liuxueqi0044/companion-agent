"""Deterministic contract exporter."""

import argparse
import json
from pathlib import Path

from .models import (ActionReceipt, Attempt, AuditResult, AuditRow, CommandTaskRequest,
                     EventPage, EventsRequest, Issue, ListRequest, ResultPage, ResultRequest,
                     SubmitRequest, TaskEvent, TaskIdRequest, TaskPage, TaskSnapshot)

OUTPUT = Path(__file__).resolve().parents[2] / "packages/contracts/local-task/schema.json"
MODELS = (SubmitRequest, TaskIdRequest, CommandTaskRequest, ListRequest, EventsRequest,
          ResultRequest, TaskSnapshot, Attempt, TaskEvent, Issue, AuditRow, AuditResult,
          TaskPage, EventPage, ResultPage, ActionReceipt)


def schema_bytes() -> bytes:
    document = {"$schema": "https://json-schema.org/draft/2020-12/schema",
                "title": "local-task/1 private contract",
                "models": {model.__name__: model.model_json_schema() for model in MODELS}}
    return (json.dumps(document, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    expected = schema_bytes()
    if args.check:
        return 0 if OUTPUT.is_file() and OUTPUT.read_bytes() == expected else 1
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(expected)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
