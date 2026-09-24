"""Read-only BATCH-005 source preflight and future Hermes lifecycle plan.

This module never imports, installs, starts, or contacts Hermes. Exit zero means
only that the local pinned-source evidence and proposed paths passed inspection.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
import tomllib


COMMIT = "d337b736aa1e8ebecfab043842d13e4a2d2f48a3"
SOURCE_REF = {
    "repository": "NousResearch/hermes-agent",
    "commit": COMMIT,
    "declared_version": "0.21.4",
}
EVIDENCE_REL = Path("reports/evidence/M00.3.01")
REQUIRED_SOURCE_SHA256 = {
    "pyproject.toml": "d660dc790a25a8eb20c5ec209df3939f3d6f3f872d7c987c286e90fa759ec499",
    "hermes_cli/_parser.py": "57e96f943880933d9caa30ab26a49ca5c6041631e199e8b3aec17548b76352ca",
    "hermes_cli/main.py": "648fdd918ae0f86d768561442a993193278692c1fe12d56eab63e276a6d732bf",
    "hermes_cli/cli_single_query.py": "3e51b8a22224860b96d0b9e1ef52c864493b420bd8539211ec081ad8f1b7d58e",
    "hermes_cli/stream_json.py": "e9229445739e6755ee1f088b0f6eb000a9761b47a8a56e932a9922e778c5d31a",
    "hermes_cli/web_routers/sessions.py": "bf0453f0d2622c2359316263b6df7c5ead5fcfa3a0dae1192c55f5977a851bde",
    "hermes_cli/web_routers/chat_ws.py": "4ce3efadd5884f5778dc1b95a9b7441ed2a530ab0866c11a6a3ccbcc725e3400",
    "hermes_cli/web_server.py": "ada3f574463c0ef59d844f176aa16af668b71406bf326f42efd8dbf706f3e58f",
    "hermes_cli/web_server_chat.py": "c510283bf6d84f35f5ec3722a6750cceecf493ab8b742263a13663f4408662fc",
    "hermes_cli/pty_session.py": "989e0e128e0249d67955d03e54b7a28dd94ed3ab58e48d0a92d3609a8eef7a1e",
    "hermes_state_sessions.py": "eb8746accc8182f2dd0c9e112895e3b54aa7fce010e53c1c1737c39f9dc0a32e",
}


class PreflightError(Exception):
    def __init__(self, code: str, detail: str):
        super().__init__(detail)
        self.code = code
        self.detail = detail


class JsonArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise PreflightError("invalid_arguments", message)


def _source_url(relative_path: str) -> str:
    return f"https://raw.githubusercontent.com/NousResearch/hermes-agent/{COMMIT}/{relative_path}"


def _reject_redirecting_components(repo_root: Path, target: Path, link_code: str, metadata_code: str) -> None:
    """Inspect each component below the trusted repo root before reading it.

    Missing components are allowed for planned homes. On Windows, junctions are
    reparse points rather than symlinks, so is_symlink alone is insufficient.
    """
    try:
        relative = target.relative_to(repo_root)
    except ValueError as exc:
        raise PreflightError(metadata_code, f"path is outside trusted repo: {target}") from exc
    part = repo_root
    for component in relative.parts:
        part = part / component
        try:
            info = part.lstat()
        except FileNotFoundError:
            continue
        except OSError as exc:
            raise PreflightError(metadata_code, f"{part}: {exc}") from exc
        try:
            redirects = (stat.S_ISLNK(info.st_mode)
                         or bool(getattr(info, "st_file_attributes", 0)
                                 & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0))
                         or part.is_junction())
        except OSError as exc:
            raise PreflightError(metadata_code, f"{part}: {exc}") from exc
        if redirects:
            raise PreflightError(link_code, str(part))


def verify_sources(repo_root: Path) -> dict:
    upstream = repo_root / EVIDENCE_REL / "upstream"
    index_path = upstream / "source-index.json"
    # The required file names are fixed in our own code. Check every relevant
    # path, including the index, before reading even the first source byte.
    for target in (upstream, index_path, *(upstream / name for name in REQUIRED_SOURCE_SHA256)):
        _reject_redirecting_components(repo_root, target, "source_symlink", "source_path_unreadable")
    if not index_path.is_file():
        raise PreflightError("source_index_missing", str(index_path))
    try:
        index = json.loads(index_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, ValueError) as exc:
        raise PreflightError("source_index_invalid", str(exc)) from exc
    if not isinstance(index, dict) or index.get("source_ref") != SOURCE_REF or not isinstance(index.get("files"), list):
        raise PreflightError("source_identity_mismatch", "index source_ref or files is invalid")
    entries: dict[str, dict] = {}
    for entry in index["files"]:
        if not isinstance(entry, dict) or not isinstance(entry.get("path"), str):
            raise PreflightError("source_index_invalid", "file entry is invalid")
        name = entry["path"]
        if name in entries:
            raise PreflightError("source_index_invalid", f"duplicate source: {name}")
        entries[name] = entry
    for name, expected_sha in REQUIRED_SOURCE_SHA256.items():
        entry = entries.get(name)
        if entry is None:
            raise PreflightError("source_index_missing_entry", name)
        if (entry.get("sha256") != expected_sha or entry.get("source_url") != _source_url(name)
                or entry.get("kind") != "source_file"):
            raise PreflightError("source_identity_mismatch", name)
        target = upstream / name
        if not target.is_file():
            raise PreflightError("source_file_missing", name)
        try:
            content = target.read_bytes()
        except OSError as exc:
            raise PreflightError("source_unreadable", f"{name}: {exc}") from exc
        if hashlib.sha256(content).hexdigest() != expected_sha or len(content) != entry.get("bytes"):
            raise PreflightError("source_hash_mismatch", name)
    try:
        project = tomllib.loads((upstream / "pyproject.toml").read_text(encoding="utf-8"))["project"]
    except (OSError, UnicodeError, ValueError, KeyError) as exc:
        raise PreflightError("source_metadata_invalid", str(exc)) from exc
    if (project.get("name") != "hermes-agent" or project.get("version") != SOURCE_REF["declared_version"]
            or project.get("scripts", {}).get("hermes") != "hermes_cli.main:main"):
        raise PreflightError("source_metadata_invalid", "name/version/entry does not match pinned source")
    return {"verified_files": len(REQUIRED_SOURCE_SHA256), "source_index": index_path.relative_to(repo_root).as_posix()}


def _lexical_path(repo_root: Path, value: str) -> Path:
    raw = Path(value)
    return Path(os.path.abspath(os.path.normpath(str(raw if raw.is_absolute() else repo_root / raw))))


def verify_homes(repo_root: Path, home_a: str | None, home_b: str | None) -> dict:
    temp_root = _lexical_path(repo_root, str(EVIDENCE_REL / "tmp"))
    homes = [
        _lexical_path(repo_root, home_a or str(EVIDENCE_REL / "tmp/user-a/home")),
        _lexical_path(repo_root, home_b or str(EVIDENCE_REL / "tmp/user-b/home")),
    ]
    for home in homes:
        try:
            relative = home.relative_to(temp_root)
        except ValueError as exc:
            raise PreflightError("home_path_escape", str(home)) from exc
        if not relative.parts:
            raise PreflightError("home_path_escape", "home cannot equal evidence temp root")
        _reject_redirecting_components(repo_root, home, "home_symlink", "home_path_unreadable")
    # Resolve only after rejecting local redirection. This also catches existing
    # aliases that differ lexically; it remains a check-time plan, not a sandbox.
    try:
        resolved_temp = temp_root.resolve(strict=False)
        resolved_homes = [home.resolve(strict=False) for home in homes]
    except (OSError, RuntimeError) as exc:
        raise PreflightError("home_path_unreadable", str(exc)) from exc
    for home in resolved_homes:
        try:
            relative = home.relative_to(resolved_temp)
        except ValueError as exc:
            raise PreflightError("home_path_escape", str(home)) from exc
        if not relative.parts:
            raise PreflightError("home_path_escape", "home cannot equal evidence temp root")
    a = os.path.normcase(str(homes[0]))
    b = os.path.normcase(str(homes[1]))
    ra = os.path.normcase(str(resolved_homes[0]))
    rb = os.path.normcase(str(resolved_homes[1]))
    if a == b or os.path.commonpath((a, b)) in (a, b) or ra == rb or os.path.commonpath((ra, rb)) in (ra, rb):
        raise PreflightError("home_overlap", "homes must be distinct and non-nested")
    return {"temp_root": str(temp_root), "user_a_home": str(homes[0]), "user_b_home": str(homes[1])}


def make_plan(repo_root: Path, homes: dict) -> dict:
    evidence = repo_root / EVIDENCE_REL
    return {
        "source_ref": SOURCE_REF,
        "entry": {"script": "hermes", "symbol": "hermes_cli.main:main", "profile": "core one-shot CLI, no extras",
                  "argv_template": ["<isolated-venv-hermes-entrypoint>", "chat", "--cli", "--oneshot", "--format", "stream-json", "-q", "<approved-read-only-prompt>"]},
        "isolation": {"venv_planned": str(evidence / "tmp/hermes-venv"), "homes": homes,
                      "cwd_planned": str(evidence / "tmp/run-cwd"),
                      "environment": "one HERMES_HOME per future run; no product-process import"},
        "future_install_not_executed": {
            "command": f"<isolated-venv-python> -m pip install 'hermes-agent @ git+https://github.com/NousResearch/hermes-agent.git@{COMMIT}'",
            "scope": "only a new isolated venv under this card's evidence tmp directory",
            "requires_architect_approval": True},
        "serial_single_session_steps": [
            {"step": "probe", "expected_native_evidence": "future CLI version/health and pinned package metadata; no model request"},
            {"step": "start", "expected_native_evidence": "owned child PID, stdout system/init JSONL with session_id, start wall clock"},
            {"step": "stream", "expected_native_evidence": "raw ordered stdout JSONL text/tool/result records, stderr, process exit code"},
            {"step": "get", "expected_native_evidence": "same session_id in isolated state.db or GET /api/sessions/{session_id} if separately approved server exists"},
            {"step": "disconnect", "expected_native_evidence": "close only downstream observer, keep owner capture alive; re-query same session_id"},
            {"step": "stop", "expected_native_evidence": "record platform-approved termination request separately from owned PID's wait/actual exit and session row"},
            {"step": "cleanup", "expected_native_evidence": "close captured streams and only the PID this experiment started"},
        ],
        "limits": {"concurrency": 1, "max_retries": 0, "turn_timeout_seconds_planned": 60,
                   "cancel_grace_seconds_planned": 10, "cost_cap_usd": None,
                   "rule": "no live run until account/provider budget cap is supplied and approved; unknown outcome is never retried"},
        "unknowns": ["account/provider credential source and budget cap", "actual installation compatibility",
                     "enforced read-only tool policy for the future prompt",
                     "whether session_id can serve as a stable C03 NativeRunRef", "durable run status after client disconnect or server restart",
                     "Windows termination semantics versus POSIX signal handler", "whether cancellation receipt and observed process exit match", "runtime and cost"],
        "approval_gate": "architect confirms isolated install, one live model call, credentials category, budget cap, observer design and cancellation method before next segment",
    }


def run(mode: str, repo_root: Path, home_a: str | None = None, home_b: str | None = None) -> tuple[int, dict]:
    result = {"schema_version": "1", "mode": mode, "source_ref": SOURCE_REF,
              "preflight_status": "failed", "integration_status": "not_run", "live_verified": False,
              "native_run_id": None, "runtime_state": None, "cost_usd": None,
              "acceptance_results": {"M00.3.01-A01": "not_run", "M00.3.01-A02": "not_run", "M00.3.01-A03": "not_run"}}
    try:
        if mode not in ("preflight", "plan"):
            raise PreflightError("unknown_mode", mode)
        result["source_check"] = verify_sources(repo_root)
        result["homes"] = verify_homes(repo_root, home_a, home_b)
        result["preflight_status"] = "passed"
        result["reason"] = {"code": "local_preflight_only", "detail": "No Hermes process, account, or live lifecycle was tested"}
        if mode == "plan":
            result["plan"] = make_plan(repo_root, result["homes"])
        return 0, result
    except PreflightError as exc:
        result["reason"] = {"code": exc.code, "detail": exc.detail}
        return 2, result


def main(argv: list[str] | None = None, *, repo_root: Path | None = None) -> int:
    parser = JsonArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--preflight", action="store_true", help="verify local pinned source and planned homes (default)")
    group.add_argument("--plan", action="store_true", help="print the fixed future operation plan after preflight")
    parser.add_argument("--home-a", help="planned first home under this card's evidence tmp directory")
    parser.add_argument("--home-b", help="planned second home under this card's evidence tmp directory")
    try:
        args = parser.parse_args(argv)
        mode = "plan" if args.plan else "preflight"
        code, result = run(mode, repo_root or Path(__file__).resolve().parents[2], args.home_a, args.home_b)
    except PreflightError as exc:
        code = 2
        result = {"schema_version": "1", "mode": None, "source_ref": SOURCE_REF,
                  "preflight_status": "failed", "integration_status": "not_run", "live_verified": False,
                  "native_run_id": None, "runtime_state": None, "cost_usd": None,
                  "reason": {"code": exc.code, "detail": exc.detail}}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return code


if __name__ == "__main__":
    sys.exit(main())
