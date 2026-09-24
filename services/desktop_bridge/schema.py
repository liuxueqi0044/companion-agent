"""Deterministic schema export/check for the narrow transport envelope."""

import argparse
import json
from pathlib import Path

from .models import ErrorInfo, RequestEnvelope, ResponseEnvelope


OUTPUT = Path(__file__).resolve().parents[2] / "packages/contracts/desktop-local/schema.json"


def schema_bytes() -> bytes:
    document = {"$schema": "https://json-schema.org/draft/2020-12/schema",
                "title": "desktop-local/1 transport envelope",
                "models": {model.__name__: model.model_json_schema()
                           for model in (RequestEnvelope, ResponseEnvelope, ErrorInfo)}}
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
