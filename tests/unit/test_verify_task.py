"""tools/verify_task.py 的单元测试。

fixture 一律用临时仓库/临时清单注入（verify(..., repo_root=, pack_dir=)），不修改
正式 docs/execution/microtasks.json；正向路径至少各跑一次真实 pytest 与真实 Vitest。
本文件不调用任何模型、账号或网络服务。
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from tools import verify_task as vt  # noqa: E402

REAL_PACK = PROJECT_ROOT / "docs" / "execution"
ARCH_RELATIVE = "common/ARCHITECTURE.md"
REAL_MANIFEST = json.loads((REAL_PACK / "microtasks.json").read_text(encoding="utf-8"))
REAL_TASKS = {t["id"]: t for t in REAL_MANIFEST["tasks"]}

PY_DIGEST = hashlib.sha256(b"x").hexdigest()


def real_task_of(kind):
    for tid in REAL_MANIFEST["execution_order"]:
        task = REAL_TASKS[tid]
        if task["kind"] == kind:
            return task
    raise AssertionError(f"real manifest has no kind={kind} task")


def real_task_without_existing_tests(kind):
    for tid in REAL_MANIFEST["execution_order"]:
        task = REAL_TASKS[tid]
        if task["kind"] == kind and task["test_paths"] and not any(
                (PROJECT_ROOT / p).exists() for p in task["test_paths"]):
            return task
    raise AssertionError(f"real manifest has no kind={kind} task with missing tests")


def spec_digest(task):
    content = {k: v for k, v in task.items() if k != "spec_sha256"}
    return hashlib.sha256(json.dumps(content, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def arch_digest(pack):
    return hashlib.sha256((pack / ARCH_RELATIVE).read_text(encoding="utf-8").encode("utf-8")).hexdigest()


def make_task(task_id, kind, mode, test_paths, **extra):
    task = {
        "id": task_id, "title": f"fixture {task_id}", "kind": kind, "verification_mode": mode,
        "test_paths": list(test_paths), "depends_on": [], "files": ["fixture/source.py"],
        "write_allowlist": ["fixture/source.py"], "generated_allowlist": [],
        "acceptance": [{"id": f"{task_id}-A01", "text": "fixture acceptance"}],
        "steps": ["fixture step"], "verification_commands": [],
        "architecture_file_hashes": {},
    }
    task.update(extra)
    return task


def write_pack(root, tasks, *, stale_spec=False, stale_arch=False):
    pack = root / "docs" / "execution"
    (pack / "common").mkdir(parents=True, exist_ok=True)
    (pack / ARCH_RELATIVE).write_text("# fixture architecture\n", encoding="utf-8")
    digest = arch_digest(pack)
    for task in tasks:
        if not task["architecture_file_hashes"]:
            task["architecture_file_hashes"] = {ARCH_RELATIVE: digest}
    if stale_arch:
        tasks[0]["architecture_file_hashes"] = {ARCH_RELATIVE: "0" * 64}
    for task in tasks:
        task["spec_sha256"] = spec_digest(task)
    if stale_spec:
        tasks[0]["spec_sha256"] = "0" * 64
    (pack / "microtasks.json").write_text(
        json.dumps({"execution_order": [t["id"] for t in tasks], "task_count": len(tasks),
                    "tasks": tasks}, ensure_ascii=False), encoding="utf-8")
    return pack


def write_repo(root, files):
    for relative, content in files.items():
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    return root


def fixture_repo(tmp_path, files):
    repo = tmp_path / "repo"
    repo.mkdir(exist_ok=True)
    return write_repo(repo, files)


def run_fixture(tmp_path, tasks, files, *, test=None, timeout=None, task_id=None, **pack_kwargs):
    pack = write_pack(tmp_path, tasks, **pack_kwargs)
    repo = fixture_repo(tmp_path, files)
    result, code = vt.verify(task_id or tasks[0]["id"], test=test, timeout=timeout,
                             repo_root=repo, pack_dir=pack)
    return result, code, repo


def link_node_modules(repo):
    """vitest fixture 需要 node_modules；只在临时仓库里建到本仓库的 junction。"""
    try:
        import _winapi
    except ImportError:  # pragma: no cover - 非 Windows
        pytest.skip("junction helper requires Windows _winapi")
    _winapi.CreateJunction(str(PROJECT_ROOT / "node_modules"), str(repo / "node_modules"))


VITEST_PACKAGE = json.dumps(
    {"name": "verify-task-fixture", "private": True, "type": "module",
     "scripts": {"test:unit": "vitest run"}}, indent=2)


# --------------------------------------------------------------------------- 真实清单（只读）

def cli(*args):
    return subprocess.run([str(vt.PYTHON_EXE), str(PROJECT_ROOT / "tools" / "verify_task.py"), *args],
                          cwd=str(PROJECT_ROOT), capture_output=True, text=True,
                          encoding="utf-8", errors="replace", timeout=120)


def test_cli_rejects_unknown_task_id():
    proc = cli("--task", "M99.9.99")
    assert proc.returncode == 2
    payload = json.loads(proc.stdout)
    assert payload["status"] == "failed" and payload["executed"] is False
    assert "unknown_task_id" in payload["reason"] and payload["commands"] == []


def test_cli_bootstrap_task_is_not_run_without_starting_processes():
    proc = cli("--task", "M00.0.04")
    assert proc.returncode == 3
    payload = json.loads(proc.stdout)
    assert payload["status"] == "not_run" and payload["executed"] is False
    assert payload["exit_code"] is None and payload["commands"] == []


def test_cli_missing_declared_tests_are_not_run():
    task = real_task_without_existing_tests("py")
    proc = cli("--task", task["id"])
    assert proc.returncode == 3
    payload = json.loads(proc.stdout)
    assert payload["status"] == "not_run" and payload["executed"] is False
    assert payload["reason"].startswith("missing_test_files") and payload["commands"] == []


def test_cli_live_task_is_not_run():
    task = real_task_of("live")
    proc = cli("--task", task["id"])
    assert proc.returncode == 3
    payload = json.loads(proc.stdout)
    assert payload["status"] == "not_run" and payload["executed"] is False
    assert payload["commands"] == [] and "not_automatic" in payload["reason"]


@pytest.mark.parametrize("argv", [
    (),
    ("--task", "M00.0.04", "--command", "echo pwned"),
    ("--task", "M00.0.04", "--manifest", "docs/execution/other.json"),
    ("--task", "M00.0.04", "--repo", "C:/tmp"),
    ("--task", "M00.0.04", "--runner", "custom"),
    ("M00.0.04",),
])
def test_cli_has_no_extra_surfaces(argv):
    proc = cli(*argv)
    assert proc.returncode == 2
    assert "verify_task.py" in proc.stderr


# --------------------------------------------------------------------------- 正向真实执行

def test_py_positive_runs_real_pytest(tmp_path):
    task = make_task("FIX.PY", "py", "targeted_tests", ["tests/unit/ok.py"])
    result, code, _ = run_fixture(
        tmp_path, [task], {"tests/unit/ok.py": "def test_ok():\n    assert 1 + 1 == 2\n"})
    assert code == 0
    assert result["status"] == "passed" and result["executed"] is True
    assert result["exit_code"] == 0
    assert result["counts"] == {"collected": 1, "passed": 1, "failed": 0, "skipped": 0}
    assert result["test_files"] == ["tests/unit/ok.py"]
    argv = result["commands"][0]["argv"]
    assert argv[:3] == [str(vt.PYTHON_EXE), "-m", "pytest"]
    assert argv[-1] == "tests/unit/ok.py" and result["commands"][0]["cwd"] == "."


def test_test_flag_selects_exact_subset(tmp_path):
    task = make_task("FIX.SUBSET", "py", "targeted_tests",
                     ["tests/unit/one.py", "tests/unit/two.py"])
    files = {"tests/unit/one.py": "def test_one():\n    assert True\n",
             "tests/unit/two.py": "def test_two():\n    assert True\n"}
    result, code, _ = run_fixture(tmp_path, [task], files, test="tests/unit/two.py")
    assert code == 0 and result["test_files"] == ["tests/unit/two.py"]
    assert result["counts"]["collected"] == 1
    assert result["commands"][0]["argv"][-1] == "tests/unit/two.py"


def test_ts_positive_runs_real_vitest(tmp_path):
    task = make_task("FIX.TS", "ts", "targeted_tests", ["tests/unit/ok.test.ts"])
    pack = write_pack(tmp_path, [task])
    repo = fixture_repo(tmp_path, {
        "package.json": VITEST_PACKAGE,
        "tests/unit/ok.test.ts": (
            'import { describe, it, expect } from "vitest";\n'
            'describe("fixture", () => {\n'
            '  it("adds", () => { expect(2 + 2).toBe(4); });\n'
            "});\n"),
    })
    link_node_modules(repo)
    result, code = vt.verify("FIX.TS", repo_root=repo, pack_dir=pack)
    assert code == 0
    assert result["status"] == "passed" and result["counts"]["passed"] == 1
    argv = result["commands"][0]["argv"]
    assert argv[:5] == [str(vt.NODE_EXE), str(vt.NPM_CLI), "run", "test:unit", "--"]
    assert "--config" in argv and "tests/unit/ok.test.ts" not in argv


def test_ts_exact_include_blocks_prefix_and_nested_decoys_before_execution(tmp_path):
    allowed = "tests/unit/allowed.test.ts"
    marker = tmp_path / "repo" / "UNLISTED_EXECUTED.txt"
    task = make_task("FIX.TS.EXACT", "ts", "targeted_tests", [allowed])
    pack = write_pack(tmp_path, [task])
    payload = ("import { writeFileSync } from 'node:fs';\n"
               f"writeFileSync({json.dumps(str(marker))}, 'ran');\n"
               "import { it, expect } from 'vitest'; it('decoy', () => expect(true).toBe(true));\n")
    repo = fixture_repo(tmp_path, {
        "package.json": VITEST_PACKAGE,
        allowed: "import { it, expect } from 'vitest'; it('allowed', () => expect(true).toBe(true));\n",
        "tests/unit/allowed.test.ts.extra.test.ts": payload,
        "tests/unit/nested/allowed.test.ts": payload,
    })
    link_node_modules(repo)
    result, code = vt.verify("FIX.TS.EXACT", repo_root=repo, pack_dir=pack)
    assert code == 0 and result["counts"]["collected"] == 1
    assert result["test_files"] == [allowed]
    assert not marker.exists(), "unlisted module must never be collected or executed"


def test_ts_report_file_set_mismatch_is_rejected(tmp_path, monkeypatch):
    task = make_task("FIX.TS.REPORT", "ts", "targeted_tests", ["tests/unit/ok.test.ts"])
    pack = write_pack(tmp_path, [task])
    repo = fixture_repo(tmp_path, {
        "package.json": VITEST_PACKAGE,
        "tests/unit/ok.test.ts": "import { it } from 'vitest'; it('ok', () => {});\n",
        "tests/unit/other.test.ts": "import { it } from 'vitest'; it('other', () => {});\n",
    })
    link_node_modules(repo)
    real_config = vt._write_vitest_config

    def swapped(config, root, files):
        real_config(config, root, ["tests/unit/other.test.ts"])

    monkeypatch.setattr(vt, "_write_vitest_config", swapped)
    result, code = vt.verify("FIX.TS.REPORT", repo_root=repo, pack_dir=pack)
    assert code == 2 and result["status"] == "failed"
    assert "executed files disagree" in result["reason"]


@pytest.mark.parametrize("label,source,suites,collected,expected_code", [
    ("duplicate", "describe('group', () => { it('first', () => expect(true).toBe(true)); }); "
     "describe('group', () => { it('second', () => expect(true).toBe(true)); });", 3, 2, 0),
    ("nested", "describe('outer', () => { it('first', () => expect(true).toBe(true)); "
     "describe('inner', () => { it('second', () => expect(true).toBe(true)); }); });", 3, 2, 0),
    ("one_group", "describe('group', () => { it('only', () => expect(true).toBe(true)); });",
     2, 1, 0),
    ("empty_with_test", "describe('empty', () => {}); "
     "it('direct', () => expect(true).toBe(true));", 2, 1, 1),
    ("only_empty", "describe('empty', () => {});", 2, 0, 1),
])
def test_vitest_real_suite_shapes(tmp_path, monkeypatch, label, source, suites,
                                  collected, expected_code):
    """锁定 Vitest 原生报告：标题不唯一，空组不出现在 assertionResults。"""
    path = "tests/unit/suites.test.ts"
    task = make_task("FIX.TS.SUITES", "ts", "targeted_tests", [path])
    pack = write_pack(tmp_path, [task])
    repo = fixture_repo(tmp_path, {
        "package.json": VITEST_PACKAGE,
        path: "import { describe, it, expect } from 'vitest';\n" + source + "\n",
    })
    link_node_modules(repo)
    observed = {}
    parse = vt.vitest_counts

    def capture_report(report, **kwargs):
        observed.update(json.loads(report.read_text(encoding="utf-8")))
        return parse(report, **kwargs)

    monkeypatch.setitem(vt.RUNNERS["ts"], "parse", capture_report)
    result, code = vt.verify("FIX.TS.SUITES", repo_root=repo, pack_dir=pack)
    print(json.dumps({"case": label, "native_suites": observed["numTotalTestSuites"],
                      "native_tests": observed["numTotalTests"],
                      "native_success": observed["success"],
                      "runner_exit": result["exit_code"], "verifier_exit": code,
                      "verifier_status": result["status"], "counts": result["counts"]},
                     sort_keys=True))
    assert observed["numTotalTestSuites"] == suites
    assert observed["numTotalTests"] == collected
    assert observed["numPassedTests"] == collected
    assert observed["numFailedTestSuites"] == (2 if expected_code else 0)
    assert observed["success"] is (expected_code == 0)
    if label == "duplicate":
        assert [a["ancestorTitles"] for a in observed["testResults"][0]["assertionResults"]] == [
            ["group"], ["group"]]
    assert code == expected_code
    assert result["status"] == ("passed" if code == 0 else "failed")
    assert result["counts"] == {"collected": collected, "passed": collected,
                                "failed": 0, "skipped": 0}
    assert result["reason"].startswith("tests_passed" if code == 0 else "tests_failed")


def test_py_failure_is_failed(tmp_path):
    task = make_task("FIX.FAIL", "py", "targeted_tests", ["tests/unit/bad.py"])
    result, code, _ = run_fixture(
        tmp_path, [task], {"tests/unit/bad.py": "def test_bad():\n    assert 1 == 2\n"})
    assert code == 1
    assert result["status"] == "failed" and result["counts"]["failed"] == 1
    assert result["reason"].startswith("tests_failed")


def test_py_collection_error_is_failed(tmp_path):
    task = make_task("FIX.COLLECT", "py", "targeted_tests", ["tests/unit/broken.py"])
    result, code, _ = run_fixture(tmp_path, [task],
                                   {"tests/unit/broken.py": "raise RuntimeError('collection failed')\n"})
    assert code == 1 and result["status"] == "failed"
    assert result["reason"].startswith("tests_failed")


def test_py_partial_pass_and_skip_stays_passed(tmp_path):
    task = make_task("FIX.PY.PARTIAL", "py", "targeted_tests", ["tests/unit/partial.py"])
    content = ("import pytest\n"
               "def test_pass(): assert True\n"
               "@pytest.mark.skip(reason='fixture')\n"
               "def test_skip(): assert False\n")
    result, code, _ = run_fixture(tmp_path, [task], {"tests/unit/partial.py": content})
    assert code == 0 and result["counts"] == {
        "collected": 2, "passed": 1, "failed": 0, "skipped": 1}


def test_ts_real_failure_and_partial_skip_reports(tmp_path):
    task = make_task("FIX.TS.STATES", "ts", "targeted_tests", ["tests/unit/states.test.ts"])
    pack = write_pack(tmp_path, [task])
    repo = fixture_repo(tmp_path, {
        "package.json": VITEST_PACKAGE,
        "tests/unit/states.test.ts": (
            "import { it, expect } from 'vitest';\n"
            "it('pass', () => expect(true).toBe(true));\n"
            "it.skip('skip', () => {});\n"),
    })
    link_node_modules(repo)
    result, code = vt.verify("FIX.TS.STATES", repo_root=repo, pack_dir=pack)
    assert code == 0 and result["counts"] == {
        "collected": 2, "passed": 1, "failed": 0, "skipped": 1}
    (repo / "tests/unit/states.test.ts").write_text(
        "import { it, expect } from 'vitest'; it('fail', () => expect(1).toBe(2));\n",
        encoding="utf-8")
    result, code = vt.verify("FIX.TS.STATES", repo_root=repo, pack_dir=pack)
    assert code == 1 and result["status"] == "failed" and result["counts"]["failed"] == 1


def test_py_zero_tests_is_not_run(tmp_path):
    task = make_task("FIX.EMPTY", "py", "targeted_tests", ["tests/unit/empty.py"])
    result, code, _ = run_fixture(
        tmp_path, [task], {"tests/unit/empty.py": "def helper():\n    return 1\n"})
    assert code == 3
    assert result["status"] == "not_run" and result["counts"]["collected"] == 0


def test_py_all_skipped_is_not_run(tmp_path):
    task = make_task("FIX.SKIP", "py", "targeted_tests", ["tests/unit/skipped.py"])
    result, code, _ = run_fixture(
        tmp_path, [task],
        {"tests/unit/skipped.py": "import pytest\n\n\n@pytest.mark.skip(reason='fixture')\n"
                                  "def test_skipped():\n    assert True\n"})
    assert code == 3
    assert result["status"] == "not_run" and result["counts"]["skipped"] == 1
    assert result["counts"]["passed"] == 0


def test_ts_all_skipped_or_todo_is_not_run(tmp_path):
    task = make_task("FIX.TSSKIP", "ts", "targeted_tests", ["tests/unit/skip.test.ts"])
    pack = write_pack(tmp_path, [task])
    repo = fixture_repo(tmp_path, {
        "package.json": VITEST_PACKAGE,
        "tests/unit/skip.test.ts": (
            'import { describe, it } from "vitest";\n'
            'describe("fixture", () => {\n'
            '  it.skip("skipped", () => {});\n'
            '  it.todo("todo");\n'
            "});\n"),
    })
    link_node_modules(repo)
    result, code = vt.verify("FIX.TSSKIP", repo_root=repo, pack_dir=pack)
    assert code == 3
    assert result["status"] == "not_run" and result["counts"]["passed"] == 0
    assert result["counts"]["skipped"] == result["counts"]["collected"] == 2


def test_ts_file_without_cases_never_passes(tmp_path):
    task = make_task("FIX.TS.EMPTY", "ts", "targeted_tests", ["tests/unit/empty.test.ts"])
    pack = write_pack(tmp_path, [task])
    repo = fixture_repo(tmp_path, {
        "package.json": VITEST_PACKAGE,
        "tests/unit/empty.test.ts": "export const helper = 1;\n",
    })
    link_node_modules(repo)
    result, code = vt.verify("FIX.TS.EMPTY", repo_root=repo, pack_dir=pack)
    assert code != 0 and result["status"] != "passed"


def test_partial_missing_tests_block_every_runner(tmp_path):
    sentinel = tmp_path / "repo" / "ran.marker"
    task = make_task("FIX.PARTIAL", "py", "targeted_tests",
                     ["tests/unit/ok.py", "tests/unit/missing.py"])
    files = {"tests/unit/ok.py": (
        "from pathlib import Path\n\n\ndef test_ok():\n"
        f"    Path({str(sentinel)!r}).write_text('ran', encoding='utf-8')\n")}
    result, code, repo = run_fixture(tmp_path, [task], files)
    assert code == 3
    assert result["status"] == "not_run" and result["executed"] is False
    assert result["reason"].startswith("missing_test_files") and result["commands"] == []
    assert not (repo / "ran.marker").exists()


@pytest.mark.parametrize("kind,paths", [
    ("py", ["tests/unit/ok.py", "tests/unit/missing.test.ts"]),
    ("ts", ["tests/unit/ok.test.ts", "tests/unit/missing.py"]),
])
def test_mixed_test_types_close_entire_task_before_runner(tmp_path, monkeypatch, kind, paths):
    task = make_task("FIX.MIXED", kind, "targeted_tests", paths)
    files = {paths[0]: "def test_ok(): assert True\n" if kind == "py" else
             "import { it } from 'vitest'; it('ok', () => {});\n"}
    monkeypatch.setattr(vt, "_run", lambda *args: pytest.fail("runner must not start"))
    for chosen in (None, paths[0]):
        result, code, _ = run_fixture(tmp_path, [task], files, test=chosen)
        assert code == 3 and result["status"] == "not_run"
        assert result["executed"] is False and result["commands"] == []
        assert result["reason"].startswith("unsupported_test_types")


def test_formal_mixed_tasks_are_detected_without_execution(tmp_path, monkeypatch):
    monkeypatch.setattr(vt, "_run", lambda *args: pytest.fail("runner must not start"))
    for task_id in ("M00.6.05", "M04.1.01", "M04.4.02"):
        result, code = vt.verify(task_id)
        assert code == 3 and result["reason"].startswith("unsupported_test_types")
        assert result["executed"] is False


def test_timeout_terminates_its_own_process_tree(tmp_path):
    sentinel = tmp_path / "repo" / "finished.marker"
    task = make_task("FIX.SLOW", "py", "targeted_tests", ["tests/unit/slow.py"])
    files = {"tests/unit/slow.py": (
        "import time\nfrom pathlib import Path\n\n\ndef test_slow():\n    time.sleep(30)\n"
        f"    Path({str(sentinel)!r}).write_text('done', encoding='utf-8')\n")}
    started = time.monotonic()
    result, code, repo = run_fixture(tmp_path, [task], files, timeout=2)
    elapsed = time.monotonic() - started
    assert code == 1
    assert result["status"] == "failed" and result["reason"].startswith("timeout")
    assert result["commands"][0]["timed_out"] is True
    assert elapsed < 25
    time.sleep(1)
    assert not (repo / "finished.marker").exists()


# --------------------------------------------------------------------------- 非自动任务

@pytest.mark.parametrize("kind,mode", [
    ("manual", "visual_or_configuration_review"),
    ("bootstrap", "bootstrap_smoke"),
    ("doc", "document_review"),
    ("live", "real_integration_required"),
])
def test_non_automatic_tasks_are_not_run(tmp_path, kind, mode):
    task = make_task("FIX.MODE", kind, mode, ["tests/unit/ok.py"])
    result, code, repo = run_fixture(
        tmp_path, [task], {"tests/unit/ok.py": "def test_ok():\n    assert True\n"})
    assert code == 3
    assert result["status"] == "not_run" and result["executed"] is False
    assert result["commands"] == [] and result["reason"].startswith("not_automatic")


def test_no_test_paths_is_not_run(tmp_path):
    task = make_task("FIX.NONE", "py", "targeted_tests", [])
    result, code, _ = run_fixture(tmp_path, [task], {})
    assert code == 3 and result["status"] == "not_run"
    assert result["reason"].startswith("no_test_files")


# --------------------------------------------------------------------------- 路径校验

BAD_PATHS = [
    "../evil.py",
    "..\\evil.py",
    "tests/unit/../../evil.py",
    "C:/tmp/evil.py",
    "C:\\tmp\\evil.py",
    "/etc/passwd",
    "\\\\server\\share\\evil.py",
    "//server/share/evil.py",
    "tests/unit/ok.py:stream",
    "tests/*.py",
    "tests/unit/?.py",
    "tests/unit/[a].py",
    "tests/unit/{a,b}.py",
    "tests/unit/!(ok).py",
    "tests/unit/+(ok).py",
    "-x.py",
    "tests/unit/ok\x00.py",
    " tests/unit/ok.py",
    "tests/unit",
]


@pytest.mark.parametrize("bad", BAD_PATHS)
def test_bad_test_paths_are_rejected(tmp_path, bad):
    task = make_task("FIX.PATH", "py", "targeted_tests", ["tests/unit/ok.py"])
    result, code, _ = run_fixture(
        tmp_path, [task], {"tests/unit/ok.py": "def test_ok():\n    assert True\n"}, test=bad)
    assert code == 2
    assert result["status"] == "failed" and result["executed"] is False
    assert result["commands"] == [] and "rejected_test_path" in result["reason"]


def test_bad_test_path_is_rejected_even_for_non_automatic_tasks(tmp_path):
    task = make_task("FIX.EARLY", "bootstrap", "bootstrap_smoke", [])
    result, code, _ = run_fixture(tmp_path, [task], {}, test="../evil.py")
    assert code == 2 and result["status"] == "failed" and result["commands"] == []
    assert "rejected_test_path" in result["reason"]


def test_test_path_outside_the_task_whitelist_is_rejected(tmp_path):
    task = make_task("FIX.WHITELIST", "py", "targeted_tests", ["tests/unit/ok.py"])
    files = {"tests/unit/ok.py": "def test_ok():\n    assert True\n",
             "tests/unit/other.py": "def test_other():\n    assert True\n"}
    result, code, _ = run_fixture(tmp_path, [task], files, test="tests/unit/other.py")
    assert code == 2 and "not in this task's test_paths" in result["reason"]


def test_manifest_declared_path_outside_repo_is_rejected(tmp_path):
    task = make_task("FIX.ESCAPE", "py", "targeted_tests", ["../outside/evil.py"])
    result, code, _ = run_fixture(tmp_path, [task], {})
    assert code == 2 and result["status"] == "failed"
    assert "rejected_test_path" in result["reason"] and result["commands"] == []


def test_junction_escape_is_rejected(tmp_path):
    outside = tmp_path / "outside"
    write_repo(outside, {"evil.py": "def test_evil():\n    assert True\n"})
    task = make_task("FIX.JUNCTION", "py", "targeted_tests", ["escape/evil.py"])
    pack = write_pack(tmp_path, [task])
    repo = fixture_repo(tmp_path, {"tests/unit/ok.py": "def test_ok():\n    assert True\n"})
    try:
        import _winapi
    except ImportError:  # pragma: no cover - 非 Windows
        pytest.skip("junction helper requires Windows _winapi")
    _winapi.CreateJunction(str(outside), str(repo / "escape"))
    result, code = vt.verify("FIX.JUNCTION", repo_root=repo, pack_dir=pack)
    assert code == 2
    assert "rejected_test_path" in result["reason"] and result["commands"] == []


# --------------------------------------------------------------------------- 清单校验

def test_stale_spec_hash_is_a_tool_error(tmp_path):
    task = make_task("FIX.SPEC", "py", "targeted_tests", ["tests/unit/ok.py"])
    result, code, _ = run_fixture(
        tmp_path, [task], {"tests/unit/ok.py": "def test_ok():\n    assert True\n"},
        stale_spec=True)
    assert code == 2
    assert result["status"] == "failed" and result["reason"].startswith("manifest_error")
    assert "Specification hash mismatch" in result["reason"] and result["commands"] == []


def test_stale_architecture_hash_is_a_tool_error(tmp_path):
    task = make_task("FIX.ARCH", "py", "targeted_tests", ["tests/unit/ok.py"])
    result, code, _ = run_fixture(
        tmp_path, [task], {"tests/unit/ok.py": "def test_ok():\n    assert True\n"},
        stale_arch=True)
    assert code == 2
    assert "Architecture changed" in result["reason"] and result["commands"] == []


def test_invalid_timeout_is_rejected(tmp_path):
    task = make_task("FIX.TIMEOUT", "py", "targeted_tests", ["tests/unit/ok.py"])
    for bad in (0, 301, -1, True):
        result, code, _ = run_fixture(
            tmp_path, [task], {"tests/unit/ok.py": "def test_ok():\n    assert True\n"},
            timeout=bad)
        assert code == 2 and result["reason"].startswith("invalid_timeout")
        assert result["commands"] == []


# --------------------------------------------------------------------------- 命令与报告构建

class FakeProc:
    returncode = 0

    def communicate(self, timeout=None):
        return "", ""

    def poll(self):
        return 0

    def kill(self):
        pass

    def wait(self, timeout=None):
        return 0


@pytest.mark.parametrize("kind,test_file", [("py", "tests/unit/ok.py"), ("ts", "tests/unit/ok.test.ts")])
def test_fixed_argv_and_shell_false(tmp_path, monkeypatch, kind, test_file):
    calls = []

    def fake_popen(argv, **kwargs):
        calls.append((argv, kwargs))
        return FakeProc()

    monkeypatch.setattr(vt.subprocess, "Popen", fake_popen)
    task = make_task("FIX.ARGV", kind, "targeted_tests", [test_file])
    result, code, _ = run_fixture(tmp_path, [task], {test_file: ""})
    assert calls, "runner must be launched as a real child process"
    argv, kwargs = calls[0]
    assert isinstance(argv, list) and all(isinstance(part, str) for part in argv)
    assert kwargs.get("shell") is False
    assert calls[0][1]["cwd"] == str((tmp_path / "repo").resolve())
    if kind == "py":
        assert argv[:4] == [str(vt.PYTHON_EXE), "-m", "pytest", "-p"]
        assert len([p for p in argv if p.startswith("--junitxml=")]) == 1
    else:
        assert argv[:5] == [str(vt.NODE_EXE), str(vt.NPM_CLI), "run", "test:unit", "--"]
        assert len([p for p in argv if p.startswith("--outputFile=")]) == 1
        assert "--config" in argv and test_file not in argv
    if kind == "py":
        assert argv[-1] == test_file
    assert code == 2 and "report_corrupt" in result["reason"]


def test_manifest_shell_strings_are_never_executed(tmp_path):
    payload = "echo pwned > pwned.txt"
    task = make_task("FIX.SHELL", "py", "targeted_tests", ["tests/unit/test_ok & echo pwned.py"],
                     verification_commands=[["cmd", "/c", payload], ["bash", "-c", payload]])
    files = {"tests/unit/test_ok & echo pwned.py": "def test_ok():\n    assert True\n"}
    result, code, repo = run_fixture(tmp_path, [task], files)
    assert code == 0 and result["status"] == "passed"
    assert not (repo / "pwned.txt").exists() and not (PROJECT_ROOT / "pwned.txt").exists()
    assert all(part not in payload for part in result["commands"][0]["argv"])


def test_damaged_machine_report_is_never_passed(tmp_path, monkeypatch):
    task = make_task("FIX.REPORT", "py", "targeted_tests", ["tests/unit/ok.py"])
    files = {"tests/unit/ok.py": "def test_ok():\n    assert True\n"}

    def corrupt_command(report, paths):
        report.write_text("not xml at all", encoding="utf-8")
        return [str(vt.PYTHON_EXE), "-c", "pass"]

    monkeypatch.setitem(vt.RUNNERS["py"], "command", corrupt_command)
    result, code, _ = run_fixture(tmp_path, [task], files)
    assert code == 2 and result["status"] == "failed"
    assert result["reason"].startswith("report_corrupt") and result["counts"] is None


def test_failing_runner_without_report_is_failed(tmp_path, monkeypatch):
    task = make_task("FIX.NOREPORT", "py", "targeted_tests", ["tests/unit/ok.py"])
    files = {"tests/unit/ok.py": "def test_ok():\n    assert True\n"}
    monkeypatch.setitem(vt.RUNNERS["py"], "command",
                        lambda report, paths: [str(vt.PYTHON_EXE), "-c", "import sys; sys.exit(1)"])
    result, code, _ = run_fixture(tmp_path, [task], files)
    assert code == 1 and result["status"] == "failed" and "without a readable machine report" in result["reason"]


def test_counts_parsers_reject_zero_and_inconsistent_reports(tmp_path):
    junit = tmp_path / "empty.xml"
    junit.write_text('<?xml version="1.0"?><testsuites><testsuite tests="0" failures="0" '
                     'errors="0" skipped="0"/></testsuites>', encoding="utf-8")
    counts = vt.pytest_counts(junit)
    assert counts == {"collected": 0, "passed": 0, "failed": 0, "skipped": 0}
    junit.write_text("<broken", encoding="utf-8")
    with pytest.raises(Exception):
        vt.pytest_counts(junit)

    report = tmp_path / "vitest.json"
    report.write_text(json.dumps({"numTotalTests": 3, "numPassedTests": 3, "numFailedTests": 3,
                                  "numPendingTests": 0, "numTodoTests": 0}), encoding="utf-8")
    with pytest.raises(ValueError):
        vt.vitest_counts(report)
    report.write_text("{not json", encoding="utf-8")
    with pytest.raises(Exception):
        vt.vitest_counts(report)


@pytest.mark.parametrize("xml", [
    '<testsuites><testsuite tests="2" failures="0" errors="0" skipped="-1"/></testsuites>',
    '<testsuites><testsuite tests="true" failures="0" errors="0" skipped="0"/></testsuites>',
    '<testsuites><testsuite tests="1.5" failures="0" errors="0" skipped="0"/></testsuites>',
    '<testsuites><testsuite tests="2" failures="0" errors="0" skipped="0"/></testsuites>',
    '<testsuites><testsuite tests="1" failures="0" errors="0" skipped="0"><testcase name="a"/><testcase name="b"/></testsuite></testsuites>',
    '<testsuites tests="2"><testsuite tests="1" failures="0" errors="0" skipped="0"><testcase name="a"/></testsuite></testsuites>',
    '<report><testsuite tests="1" failures="0" errors="0" skipped="0"><testcase name="a"/></testsuite></report>',
])
def test_pytest_parser_rejects_inconsistent_structure(tmp_path, xml):
    report = tmp_path / "bad.xml"
    report.write_text(xml, encoding="utf-8")
    with pytest.raises(ValueError):
        vt.pytest_counts(report)


def test_pytest_parser_validates_case_outcomes(tmp_path):
    report = tmp_path / "cases.xml"
    report.write_text(
        '<testsuites><testsuite tests="4" failures="1" errors="1" skipped="1">'
        '<testcase name="pass"/><testcase name="skip"><skipped/></testcase>'
        '<testcase name="fail"><failure/></testcase>'
        '<testcase name="error"><error/></testcase>'
        '</testsuite></testsuites>', encoding="utf-8")
    assert vt.pytest_counts(report) == {"collected": 4, "passed": 1, "failed": 2, "skipped": 1}
    report.write_text(report.read_text(encoding="utf-8").replace(
        '<testcase name="fail"><failure/></testcase>',
        '<testcase name="fail"><failure/><skipped/></testcase>'), encoding="utf-8")
    with pytest.raises(ValueError):
        vt.pytest_counts(report)


@pytest.mark.parametrize("field,value", [
    ("numTotalTests", -1), ("numPassedTests", True), ("numFailedTests", "0"),
    ("numPendingTests", 0.5), ("numTotalTestSuites", -1),
])
def test_vitest_parser_rejects_invalid_numbers(tmp_path, field, value):
    data = valid_vitest_report()
    data[field] = value
    report = tmp_path / "bad.json"
    report.write_text(json.dumps(data), encoding="utf-8")
    with pytest.raises(ValueError):
        vt.vitest_counts(report)


def valid_vitest_report():
    return {"numTotalTestSuites": 1, "numPassedTestSuites": 1,
            "numFailedTestSuites": 0, "numPendingTestSuites": 0,
            "numTotalTests": 1, "numPassedTests": 1, "numFailedTests": 0,
            "numPendingTests": 0, "numTodoTests": 0, "success": True,
            "testResults": [{"name": "C:/fixture/ok.test.ts", "status": "passed",
                             "assertionResults": [{"status": "passed", "ancestorTitles": []}]}]}


def test_vitest_parser_accepts_consistent_case_and_suite(tmp_path):
    report = tmp_path / "valid.json"
    report.write_text(json.dumps(valid_vitest_report()), encoding="utf-8")
    assert vt.vitest_counts(report) == {"collected": 1, "passed": 1,
                                       "failed": 0, "skipped": 0}


@pytest.mark.parametrize("mutate", [
    lambda d: d.update(testResults=[]),
    lambda d: d.update(numTotalTests=2),
    lambda d: d.update(numPassedTestSuites=2),
    # A larger suite count can be valid: duplicate titles or empty suites have no unique
    # identity in assertionResults. A count below the visible file root is contradictory.
    lambda d: d.update(numTotalTestSuites=0, numPassedTestSuites=0),
    lambda d: d["testResults"][0]["assertionResults"][0].update(ancestorTitles=["group"]),
    lambda d: d["testResults"][0].update(assertionResults=[]),
    lambda d: d["testResults"][0]["assertionResults"][0].update(status="unknown"),
    lambda d: d.update(success=False),
])
def test_vitest_parser_rejects_inconsistent_cases_and_suites(tmp_path, mutate):
    data = valid_vitest_report()
    mutate(data)
    report = tmp_path / "bad.json"
    report.write_text(json.dumps(data), encoding="utf-8")
    with pytest.raises(ValueError):
        vt.vitest_counts(report)


# --------------------------------------------------------------------------- 无模型/账号调用

def test_no_model_or_account_calls(tmp_path, monkeypatch):
    source = (PROJECT_ROOT / "tools" / "verify_task.py").read_text(encoding="utf-8").lower()
    for token in ("openai", "anthropic", "gemini", "ollama", "api_key", "apikey", "bearer",
                  "socket", "requests", "httpx", "urllib", "aiohttp"):
        assert token not in source, f"verifier must not reference {token}"
    for name in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "COMPANION_API_KEY", "COMPANION_TOKEN"):
        monkeypatch.setenv(name, "sentinel-not-a-real-key")
    task = make_task("FIX.LIVE", "live", "real_integration_required", ["tests/unit/ok.py"])
    result, code, _ = run_fixture(
        tmp_path, [task], {"tests/unit/ok.py": "def test_ok():\n    assert True\n"})
    assert code == 3
    assert result["status"] == "not_run" and result["executed"] is False
    assert result["commands"] == [] and "sentinel-not-a-real-key" not in json.dumps(result)


def test_verifier_works_from_any_cwd(tmp_path):
    with tempfile.TemporaryDirectory(prefix="verify-task-cwd-") as other:
        proc = subprocess.run([str(vt.PYTHON_EXE), str(PROJECT_ROOT / "tools" / "verify_task.py"),
                               "--task", "M00.0.04"], cwd=other, capture_output=True, text=True,
                              encoding="utf-8", errors="replace", timeout=120)
    assert proc.returncode == 3
    assert json.loads(proc.stdout)["task_id"] == "M00.0.04"
    assert os.path.isabs(str(vt.PROJECT_ROOT))
