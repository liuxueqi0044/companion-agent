"""BATCH-016 source manifest and selected immutable historical hash check."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
BASELINE = ROOT / "docs/handoff/BATCH-016-BASELINE.json"
OUTPUT = ROOT / "reports/evidence/BATCH-016/artifact-manifest.json"
HISTORY = (
    "reports/BATCH-015.json",
    "reports/evidence/BATCH-015/artifact-manifest.json",
    "reports/evidence/BATCH-015/local-state/personal_ai.sqlite3",
    "reports/evidence/BATCH-015/local-state/tasks.sqlite3",
    "reports/evidence/BATCH-015/local-state/worker.lock",
    "reports/BATCH-014.json",
    "reports/evidence/BATCH-014/local-state/personal_ai.sqlite3",
    "reports/evidence/BATCH-011/live-attempts.json",
    "reports/evidence/BATCH-011/live.lock",
    "reports/evidence/BATCH-012/live-attempts.json",
    "reports/evidence/BATCH-012/model-store/candidates/model-v1/manifest.json",
    "reports/evidence/BATCH-012/model-store/candidates/model-v1/view.js",
    "reports/evidence/BATCH-013/artifact-manifest.json",
    "reports/evidence/BATCH-013-R1/artifact-manifest.json",
    "reviews/BATCH-015.md",
)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def artifact_paths() -> list[str]:
    directories = (
        "services/desktop_bridge", "apps/desktop/bridge",
        "packages/contracts/desktop-local", "tests/unit/desktop_bridge",
        "tests/integration/desktop_bridge",
    )
    paths = ["tools/desktop_bridge.py", "reports/evidence/BATCH-016/frontend-handoff.md"]
    for directory in directories:
        paths.extend(path.relative_to(ROOT).as_posix()
                     for path in (ROOT / directory).rglob("*") if path.is_file()
                     and "__pycache__" not in path.parts and path.suffix not in (".pyc", ".pyo"))
    return sorted(set(paths))


def manifest() -> dict:
    baseline = json.loads(BASELINE.read_text(encoding="utf-8"))
    original = {item["path"]: item["sha256"] for item in baseline["files"]}
    historical = []
    mismatches = []
    for name in HISTORY:
        actual = sha((ROOT / name).read_bytes())
        if original.get(name) == actual:
            historical.append({"path": name, "sha256": actual})
        else:
            mismatches.append({"path": name, "baseline_sha256": original.get(name),
                               "current_sha256": actual})
    artifacts = [{"path": name, "sha256": sha((ROOT / name).read_bytes())}
                 for name in artifact_paths()]
    result_ref = "sha256:" + sha(json.dumps(artifacts, ensure_ascii=False, sort_keys=True,
                                            separators=(",", ":")).encode("utf-8"))
    return {
        "batch_id": "BATCH-016",
        "baseline_ref": baseline["snapshot_id"],
        "dispatch_sha256": sha((ROOT / "docs/handoff/BATCH-016.md").read_bytes()),
        "result_ref": result_ref,
        "artifacts": artifacts,
        "historical_hashes_verified": historical,
        "historical_hash_mismatches": mismatches,
        "runtime_state_excluded": [
            "reports/evidence/BATCH-016/runtime/",
            "reports/evidence/BATCH-016/tmp/",
            "reports/evidence/BATCH-016/build/",
            "reports/evidence/BATCH-016/*-test.txt and other run logs",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    expected = (json.dumps(manifest(), ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")
    if args.check:
        if not OUTPUT.is_file() or OUTPUT.read_bytes() != expected:
            print("FAIL: manifest_mismatch")
            return 1
        if manifest()["historical_hash_mismatches"]:
            print("FAIL: selected historical hashes differ from BATCH-016 baseline")
            return 1
        print("PASS: manifest and selected historical hashes match")
        return 0
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(expected)
    print("WARN: manifest generated with historical hash mismatch" if
          manifest()["historical_hash_mismatches"] else "PASS: manifest generated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
