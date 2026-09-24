"""Deterministic Schema export/check from the Pydantic authority, independent of cwd."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .models import (
    ChangeRequest, CommandReceipt, HistoryPage, HistoryRequest,
    PreferenceRevision, Preferences, ProfileSnapshot, UndoRequest,
)


OUTPUT = Path(__file__).resolve().parents[2] / "packages/contracts/personal-ai-local/schema.json"
MODELS = (Preferences, ProfileSnapshot, PreferenceRevision, ChangeRequest,
          UndoRequest, HistoryRequest, HistoryPage, CommandReceipt)


def schema_bytes() -> bytes:
    document = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "personal-ai-local/1 private local contract",
        "description": "Generated from services.personal_ai.models; local single-user data only.",
        "models": {model.__name__: model.model_json_schema()
                   for model in MODELS},
    }
    return (json.dumps(document, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")


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
