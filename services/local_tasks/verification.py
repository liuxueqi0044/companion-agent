"""BATCH-015 immutable artifact manifest and selected historical hash verifier."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
BASELINE = ROOT / "docs/handoff/BATCH-015-BASELINE.json"
OUTPUT = ROOT / "reports/evidence/BATCH-015/artifact-manifest.json"
HISTORY = (
    "reports/BATCH-014.json",
    "reports/evidence/BATCH-014/artifact-manifest.json",
    "reports/evidence/BATCH-014/local-state/personal_ai.sqlite3",
    "reports/evidence/BATCH-011/live-attempts.json",
    "reports/evidence/BATCH-011/live.lock",
    "reports/evidence/BATCH-012/live-attempts.json",
    "reports/evidence/BATCH-012/model-store/candidates/model-v1/manifest.json",
    "reports/evidence/BATCH-012/model-store/candidates/model-v1/view.js",
    "reports/evidence/BATCH-012/model-store/revisions/model-v1/manifest.json",
    "reports/evidence/BATCH-013/artifact-manifest.json",
    "reports/evidence/BATCH-013-R1/artifact-manifest.json",
    "reviews/BATCH-014.md",
)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def artifact_paths() -> list[str]:
    paths = [
        "services/personal_ai/repository.py", "services/personal_ai/service.py",
        "tools/personal_ai.py", "tests/unit/personal_ai/test_batch015_regressions.py",
        "tools/personal_workbench.py", "packages/contracts/local-task/schema.json",
        "packages/contracts/local-task/README.md", "reports/evidence/BATCH-015/frontend-handoff.md",
    ]
    for directory in ("services/local_tasks", "tests/unit/local_tasks"):
        paths.extend(file.relative_to(ROOT).as_posix() for file in (ROOT / directory).glob("*.py"))
    paths.append("services/local_tasks/README.md")
    return sorted(set(paths))


def manifest() -> dict:
    baseline = json.loads(BASELINE.read_text(encoding="utf-8"))
    original = {item["path"]: item["sha256"] for item in baseline["files"]}
    historical = []
    for name in HISTORY:
        actual = sha((ROOT / name).read_bytes())
        if original.get(name) != actual:
            raise RuntimeError(f"historical_hash_mismatch:{name}")
        historical.append({"path": name, "sha256": actual})
    files = [{"path": name, "sha256": sha((ROOT / name).read_bytes())}
             for name in artifact_paths()]
    result_ref = "sha256:" + sha(json.dumps(files, ensure_ascii=False, sort_keys=True,
                                            separators=(",", ":")).encode())
    return {"batch_id": "BATCH-015", "baseline_ref": baseline["snapshot_id"],
            "dispatch_sha256": sha((ROOT / "docs/handoff/BATCH-015.md").read_bytes()),
            "result_ref": result_ref, "artifacts": files,
            "historical_hashes_verified": historical,
            "runtime_state_excluded": ["reports/evidence/BATCH-015/local-state/",
                                       "reports/evidence/BATCH-015/tmp/",
                                       "reports/evidence/BATCH-015/*-test.txt"]}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    expected = (json.dumps(manifest(), ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode()
    if args.check:
        return 0 if OUTPUT.is_file() and OUTPUT.read_bytes() == expected else 1
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(expected)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
