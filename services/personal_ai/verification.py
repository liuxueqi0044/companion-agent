"""Frozen BATCH-014 source manifest and read-only historical integrity check."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
EVIDENCE = REPO / "reports/evidence/BATCH-014"
MANIFEST = EVIDENCE / "artifact-manifest.json"
BASELINE = REPO / "docs/handoff/BATCH-014-BASELINE.json"


def _hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _sources() -> list[Path]:
    selected: list[Path] = []
    for directory in ("services/personal_ai", "packages/contracts/personal-ai-local",
                      "tests/unit/personal_ai"):
        for path in (REPO / directory).rglob("*"):
            if "__pycache__" in path.parts or path.suffix == ".pyc":
                continue
            if path.is_symlink() or path.is_junction():
                raise RuntimeError("manifest_reparse_point")
            if path.is_file():
                selected.append(path)
    selected.extend((REPO / "tools/personal_ai.py", EVIDENCE / "service-handoff.md"))
    return sorted(selected, key=lambda path: path.relative_to(REPO).as_posix())


def make_manifest() -> dict:
    items = []
    for path in _sources():
        data = path.read_bytes()
        relative = path.relative_to(REPO).as_posix()
        items.append({"path": relative, "bytes": len(data), "sha256": _hash(data),
                      "origin": "handwritten_local_contract_service_test_or_handoff"})
    document = {"batch_id": "BATCH-014", "format": "artifact-manifest/1",
                "count": len(items), "items": items,
                "exclusions": "SQLite runtime state, logs, tmp, dependencies and reports are not source artifacts."}
    MANIFEST.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"count": len(items), "result_ref": "sha256:" + _hash(MANIFEST.read_bytes())}


def verify() -> dict:
    document = json.loads(MANIFEST.read_text(encoding="utf-8"))
    expected_paths = [p.relative_to(REPO).as_posix() for p in _sources()]
    if document.get("batch_id") != "BATCH-014" or document.get("count") != len(document.get("items", [])):
        raise RuntimeError("manifest_structure")
    if [item["path"] for item in document["items"]] != expected_paths:
        raise RuntimeError("manifest_inventory")
    for item in document["items"]:
        path = REPO / item["path"]
        data = path.read_bytes()
        if len(data) != item["bytes"] or _hash(data) != item["sha256"]:
            raise RuntimeError("manifest_mismatch:" + item["path"])
    baseline = json.loads(BASELINE.read_text(encoding="utf-8"))
    frozen = {item["path"]: item["sha256"] for item in baseline["files"]}
    historical = [
        "reports/evidence/BATCH-011/live-attempts.json",
        "reports/evidence/BATCH-011/live.lock",
        "reports/evidence/BATCH-012/live-attempts.json",
        "reports/BATCH-013-R1.json",
        "reports/BATCH-013-R1.md",
        "reports/evidence/BATCH-013-R1/artifact-manifest.json",
        "reports/evidence/BATCH-013-R1/model-revalidation.json",
        *[f"reports/evidence/BATCH-012/model-store/revisions/model-v1/{name}"
          for name in ("view.html", "view.css", "view.js", "manifest.json", "artifact.html")],
    ]
    results = []
    for name in historical:
        digest = _hash((REPO / name).read_bytes())
        if frozen.get(name) != digest:
            raise RuntimeError("historical_hash_mismatch:" + name)
        results.append({"path": name, "sha256": digest})
    result = {"result": "PASS", "manifest_items": document["count"],
              "result_ref": "sha256:" + _hash(MANIFEST.read_bytes()),
              "historical_files": results, "runtime_db_in_manifest": False}
    (EVIDENCE / "integrity-final.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("manifest", "verify"))
    args = parser.parse_args()
    result = make_manifest() if args.action == "manifest" else verify()
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
