"""受白名单约束的单任务验证入口。

只从根目录的 docs/execution/microtasks.json 读取任务，复用 docs/execution/taskctl.py
的只读清单校验；只用固定 argv 启动本仓库既有 pytest / Vitest，并用它们的机器报告
判定是否真有测试执行。本工具只报告技术检查结果：不修改 reports/reviews，不写
accepted，不执行业务任务，不读密钥，不调用任何模型或账号，不执行清单里的
verification_commands（那会递归调用本工具）。

用法：.venv/Scripts/python.exe tools/verify_task.py --task <ID> [--test <路径>] [--timeout 秒]

返回码：0=确有测试执行且通过；1=测试失败或超时；2=输入/清单/路径/工具错误；
3=not_run（人工/bootstrap/live、无可用测试文件或测试全部跳过）。
stdout 只输出一个机器可读 JSON（其中 commands 内仅保留输出尾部）；子进程完整
stdout/stderr 原样写到本工具自己的 stderr。
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PACK_DIR = PROJECT_ROOT / "docs" / "execution"
MANIFEST_NAME = "microtasks.json"
TASKCTL = PACK_DIR / "taskctl.py"
PYTHON_EXE = PROJECT_ROOT / ".venv" / "Scripts" / "python.exe"
NODE_DIR = PROJECT_ROOT / ".local-tools" / "node-v24.21.0-win-x64"
NODE_EXE = NODE_DIR / "node.exe"
NPM_CLI = NODE_DIR / "node_modules" / "npm" / "bin" / "npm-cli.js"
NPM_SCRIPT = "test:unit"

PY_SUFFIX = ".py"
TS_SUFFIX = ".test.ts"
AUTOMATIC_KINDS = {"py": PY_SUFFIX, "ts": TS_SUFFIX}
TARGETED_MODE = "targeted_tests"

DEFAULT_TIMEOUT = 120
MAX_TIMEOUT = 300
OUTPUT_TAIL = 1500
FORBIDDEN_PATH_CHARS = set('*?[]{}()!+@"\'')

PASSED, FAILED, NOT_RUN = "passed", "failed", "not_run"
EXIT_PASSED, EXIT_TEST_FAILED, EXIT_TOOL_ERROR, EXIT_NOT_RUN = 0, 1, 2, 3

_TASKCTL_MODULE = None


class ToolError(Exception):
    """输入/路径/环境错误，映射到退出码 2。"""


class NotRun(Exception):
    """not_run 场景，映射到退出码 3。"""


def _result(task_id, status, reason, *, executed=False, test_files=(), exit_code=None,
            counts=None, commands=()):
    return {
        "task_id": task_id,
        "status": status,
        "reason": reason,
        "executed": bool(executed),
        "test_files": list(test_files),
        "exit_code": exit_code,
        "counts": counts,
        "commands": [dict(c) for c in commands],
    }


def _taskctl():
    global _TASKCTL_MODULE
    if _TASKCTL_MODULE is None:
        spec = importlib.util.spec_from_file_location("_verify_task_taskctl", TASKCTL)
        if spec is None or spec.loader is None:
            raise ToolError(f"taskctl_unavailable: {TASKCTL.name} cannot be loaded")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        _TASKCTL_MODULE = module
    return _TASKCTL_MODULE


def load_manifest(pack_dir: Path):
    """复用 taskctl.manifest() 的只读校验；pack_dir 仅测试注入用，CLI 不暴露。"""
    module = _taskctl()
    original = module.PACK
    module.PACK = Path(pack_dir)
    try:
        return module.manifest()
    finally:
        module.PACK = original


def _check_relative(raw):
    if not isinstance(raw, str) or not raw or raw != raw.strip():
        raise ToolError(f"rejected_test_path: not a plain relative path ({raw!r})")
    if "\x00" in raw:
        raise ToolError("rejected_test_path: NUL byte is not allowed")
    if any(ch in FORBIDDEN_PATH_CHARS for ch in raw):
        raise ToolError(f"rejected_test_path: wildcards/quotes are not allowed ({raw})")
    if raw.startswith("-"):
        raise ToolError(f"rejected_test_path: must not start with '-' ({raw})")
    normalized = raw.replace("\\", "/")
    if normalized.startswith("/") or normalized.startswith("//"):
        raise ToolError(f"rejected_test_path: absolute or UNC path is not allowed ({raw})")
    if ":" in normalized:
        raise ToolError(f"rejected_test_path: drive letters and NTFS ADS are not allowed ({raw})")
    parts = normalized.split("/")
    if any(part in ("", ".", "..") for part in parts):
        raise ToolError(f"rejected_test_path: empty/'.'/'..' segments are not allowed ({raw})")
    return "/".join(parts)


def _resolve_in_repo(relative, repo_root: Path):
    repo = Path(repo_root).resolve()
    target = (repo / relative).resolve()
    if target == repo or repo not in target.parents:
        raise ToolError(f"rejected_test_path: resolves outside the repository ({relative})")
    return target


def _select_test_files(task, requested, repo_root: Path):
    kind = task.get("kind")
    suffix = AUTOMATIC_KINDS[kind]
    declared = [_check_relative(p) for p in task.get("test_paths") or []]
    for relative in declared:
        target = _resolve_in_repo(relative, repo_root)
        if target.is_dir():
            raise ToolError(f"rejected_test_path: directories are not allowed ({relative})")
    unsupported = [p for p in declared if not p.endswith(suffix)]
    if unsupported:
        raise NotRun(f"unsupported_test_types: kind={kind} cannot run all declared test_paths; "
                     f"unsupported: {'; '.join(unsupported)}")
    if not declared:
        raise NotRun(f"no_test_files: kind={kind} declares no {suffix} test files")
    if requested is not None:
        wanted = _check_relative(requested)
        if wanted not in declared:
            raise ToolError(f"rejected_test_path: not in this task's test_paths ({wanted})")
        runnable = [wanted]
    else:
        runnable = declared
    selected, missing = [], []
    for relative in runnable:
        target = _resolve_in_repo(relative, repo_root)
        if target.is_dir():
            raise ToolError(f"rejected_test_path: directories are not allowed ({relative})")
        if not target.is_file():
            missing.append(relative)
        else:
            selected.append(relative)
    if missing:
        raise NotRun(f"missing_test_files: {'; '.join(missing)} "
                     "(all declared test files must exist before any runner starts)")
    return selected


def py_command(report: Path, files):
    return [str(PYTHON_EXE), "-m", "pytest", "-p", "no:cacheprovider",
            f"--junitxml={report}", *files]


def ts_command(report: Path, files, config: Path):
    return [str(NODE_EXE), str(NPM_CLI), "run", NPM_SCRIPT, "--",
            "--config", str(config), "--reporter=json", f"--outputFile={report}"]


def _write_vitest_config(config: Path, repo: Path, files):
    """Vitest 5 的 include 是收集前的 glob；路径已校验，元字符已拒绝。"""
    content = ("export default { root: " + json.dumps(str(repo)) + ", test: { include: "
               + json.dumps(files) + ", environment: 'node', passWithNoTests: false } };\n")
    config.write_text(content, encoding="utf-8")


def _child_env(kind):
    env = dict(os.environ)
    if kind == "py":
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONDONTWRITEBYTECODE"] = "1"
    else:
        env["PATH"] = str(NODE_DIR) + os.pathsep + env.get("PATH", "")
        env["NO_COLOR"] = "1"
    return env


def _terminate_tree(proc):
    """只结束本工具启动并拥有的进程树（按 PID，不按进程名）。"""
    if proc.poll() is not None:
        return
    if os.name == "nt":
        try:
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                           shell=False, capture_output=True, check=False)
        except OSError:
            proc.kill()
    else:
        proc.kill()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=10)


def _run(argv, cwd: Path, env, timeout):
    proc = subprocess.Popen(argv, cwd=str(cwd), env=env, shell=False,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            text=True, encoding="utf-8", errors="replace")
    try:
        out, err = proc.communicate(timeout=timeout)
        return proc.returncode, out, err, False
    except subprocess.TimeoutExpired:
        _terminate_tree(proc)
        out, err = proc.communicate()
        return proc.returncode, out, err, True


def pytest_counts(report: Path):
    root = ET.parse(report).getroot()
    if root.tag == "testsuite":
        suites = [root]
    elif root.tag == "testsuites":
        suites = list(root)
    else:
        raise ValueError("pytest report root must be testsuite or testsuites")
    if not suites or any(s.tag != "testsuite" for s in suites):
        raise ValueError("pytest report requires testsuite elements")
    totals = {key: 0 for key in ("tests", "failures", "errors", "skipped")}
    for suite in suites:
        declared = {key: _nonnegative_int(suite.get(key), f"pytest suite {key}", xml=True)
                    for key in totals}
        actual = {key: 0 for key in totals}
        for case in suite:
            if case.tag in {"properties", "system-out", "system-err"}:
                continue
            if case.tag != "testcase" or not case.get("name"):
                raise ValueError("pytest suite contains an invalid testcase")
            actual["tests"] += 1
            outcomes = [child.tag for child in case
                        if child.tag not in {"system-out", "system-err"}]
            if len(outcomes) > 1 or any(tag not in {"failure", "error", "skipped"}
                                         for tag in outcomes):
                raise ValueError("pytest testcase has an invalid outcome")
            if outcomes:
                actual[{"failure": "failures", "error": "errors",
                        "skipped": "skipped"}[outcomes[0]]] += 1
        if actual != declared:
            raise ValueError(f"pytest suite counts disagree with testcase outcomes: {declared} != {actual}")
        for key in totals:
            totals[key] += actual[key]
    if root.tag == "testsuites":
        for key in totals:
            if key in root.attrib and _nonnegative_int(root.get(key), f"pytest root {key}", xml=True) != totals[key]:
                raise ValueError(f"pytest root {key} disagrees with suites")
    return {"collected": totals["tests"],
            "passed": totals["tests"] - totals["failures"] - totals["errors"] - totals["skipped"],
            "failed": totals["failures"] + totals["errors"],
            "skipped": totals["skipped"]}


def _nonnegative_int(value, label, *, xml=False):
    if xml:
        if not isinstance(value, str) or not value.isdecimal():
            raise ValueError(f"{label} must be a nonnegative integer")
        return int(value)
    if type(value) is not int or value < 0:
        raise ValueError(f"{label} must be a nonnegative integer")
    return value


def vitest_counts(report: Path, *, expected_files=None, repo_root=None):
    data = json.loads(report.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("vitest report must be an object")
    keys = ("numTotalTests", "numPassedTests", "numFailedTests", "numPendingTests",
            "numTodoTests", "numTotalTestSuites", "numPassedTestSuites",
            "numFailedTestSuites", "numPendingTestSuites")
    numbers = {key: _nonnegative_int(data.get(key), f"vitest {key}") for key in keys}
    collected, passed, failed = (numbers[key] for key in keys[:3])
    skipped = numbers["numPendingTests"] + numbers["numTodoTests"]
    if passed + failed + skipped != collected:
        raise ValueError("vitest test totals disagree")
    if (numbers["numPassedTestSuites"] + numbers["numFailedTestSuites"]
            + numbers["numPendingTestSuites"] != numbers["numTotalTestSuites"]):
        raise ValueError("vitest suite totals disagree")
    files = data.get("testResults")
    if not isinstance(files, list) or numbers["numTotalTestSuites"] < len(files):
        raise ValueError("vitest testResults structure disagrees with suites")
    actual = {"passed": 0, "failed": 0, "pending": 0, "todo": 0}
    names = []
    failed_files = 0
    minimum_suites = 0
    for file in files:
        if not isinstance(file, dict) or not isinstance(file.get("name"), str) or not file["name"]:
            raise ValueError("vitest testResults contains an invalid file")
        names.append(file["name"])
        assertions = file.get("assertionResults")
        if not isinstance(assertions, list) or file.get("status") not in {"passed", "failed"}:
            raise ValueError("vitest file result is malformed")
        # Vitest JSON only carries ancestor titles, not suite IDs. Distinct title
        # paths prove a lower bound; duplicate names and empty suites can add more.
        suite_paths = {()}
        for assertion in assertions:
            if not isinstance(assertion, dict):
                raise ValueError("vitest assertion result is malformed")
            ancestors = assertion.get("ancestorTitles")
            if (not isinstance(ancestors, list)
                    or any(not isinstance(title, str) for title in ancestors)):
                raise ValueError("vitest assertion suite path is malformed")
            for depth in range(1, len(ancestors) + 1):
                suite_paths.add(tuple(ancestors[:depth]))
            state = assertion.get("status")
            if state == "skipped":
                state = "pending"
            if state not in actual:
                raise ValueError("vitest assertion has an unsupported status")
            actual[state] += 1
        minimum_suites += len(suite_paths)
        if file["status"] == "failed":
            failed_files += 1
        elif any(a.get("status") == "failed" for a in assertions):
            raise ValueError("vitest passed file contains a failed assertion")
    if (actual["passed"] != passed or actual["failed"] != failed
            or actual["pending"] != numbers["numPendingTests"]
            or actual["todo"] != numbers["numTodoTests"]):
        raise ValueError("vitest summary disagrees with assertion results")
    if numbers["numTotalTestSuites"] < minimum_suites:
        raise ValueError("vitest suite summary is smaller than visible assertion suite paths")
    if (failed_files > 0) != (numbers["numFailedTestSuites"] > 0):
        raise ValueError("vitest failed files disagree with suite summary")
    expected_success = bool(files) and failed_files == 0 and failed == 0
    if type(data.get("success")) is not bool or data["success"] != expected_success:
        raise ValueError("vitest success disagrees with report outcomes")
    if expected_files is not None:
        repo = Path(repo_root).resolve()
        expected = {_resolve_in_repo(p, repo) for p in expected_files}
        actual_files = [Path(name).resolve() for name in names]
        if len(actual_files) != len(set(actual_files)) or set(actual_files) != expected:
            raise ValueError("vitest executed files disagree with the exact task whitelist")
    return {"collected": collected, "passed": passed, "failed": failed, "skipped": skipped}


RUNNERS = {
    "py": {"command": py_command, "report_name": "pytest-junit.xml", "parse": pytest_counts},
    "ts": {"command": ts_command, "report_name": "vitest-report.json", "parse": vitest_counts},
}


def _summary(runner, counts):
    return (f"{runner} {counts['collected']} collected, {counts['passed']} passed, "
            f"{counts['failed']} failed, {counts['skipped']} skipped")


def verify(task_id, *, test=None, timeout=None, repo_root=None, pack_dir=None):
    """返回 (result_dict, exit_code)。repo_root/pack_dir 仅供测试注入，CLI 不暴露。"""
    repo = Path(repo_root).resolve() if repo_root is not None else PROJECT_ROOT
    pack = Path(pack_dir).resolve() if pack_dir is not None else PACK_DIR
    budget = DEFAULT_TIMEOUT if timeout is None else timeout
    if isinstance(budget, bool) or not isinstance(budget, int) or not 1 <= budget <= MAX_TIMEOUT:
        return (_result(task_id, FAILED, f"invalid_timeout: must be an integer 1..{MAX_TIMEOUT}"),
                EXIT_TOOL_ERROR)
    if not isinstance(task_id, str) or not task_id:
        return _result(task_id, FAILED, "unknown_task_id: --task is required"), EXIT_TOOL_ERROR

    try:
        data, tasks = load_manifest(pack)
    except Exception as exc:  # noqa: BLE001 - any loader failure is a tool/manifest error
        return _result(task_id, FAILED, f"manifest_error: {exc}"), EXIT_TOOL_ERROR
    if task_id not in tasks:
        return _result(task_id, FAILED, "unknown_task_id: not present in the manifest"), EXIT_TOOL_ERROR
    task = tasks[task_id]

    if test is not None:
        try:
            wanted = _check_relative(test)
            declared = [_check_relative(p) for p in task.get("test_paths") or []]
        except ToolError as exc:
            return _result(task_id, FAILED, str(exc)), EXIT_TOOL_ERROR
        if wanted not in declared:
            return (_result(task_id, FAILED,
                            f"rejected_test_path: not in this task's test_paths ({wanted})"),
                    EXIT_TOOL_ERROR)

    kind = task.get("kind")
    mode = task.get("verification_mode")
    if kind not in AUTOMATIC_KINDS:
        return (_result(task_id, NOT_RUN,
                        f"not_automatic: kind={kind} needs manual/bootstrap evidence; "
                        "this entry point does not run it"), EXIT_NOT_RUN)
    if mode != TARGETED_MODE:
        return (_result(task_id, NOT_RUN,
                        f"not_automatic: verification_mode={mode} needs real integration "
                        "evidence; this entry point does not call models, accounts or "
                        "external services"), EXIT_NOT_RUN)

    try:
        files = _select_test_files(task, test, repo)
    except NotRun as exc:
        return _result(task_id, NOT_RUN, str(exc)), EXIT_NOT_RUN
    except ToolError as exc:
        return _result(task_id, FAILED, str(exc)), EXIT_TOOL_ERROR

    runner = RUNNERS[kind]
    workdir = Path(tempfile.mkdtemp(prefix="verify-task-"))
    try:
        report = workdir / runner["report_name"]
        if kind == "ts":
            config = workdir / "vitest.config.mjs"
            _write_vitest_config(config, repo, files)
            argv = runner["command"](report, files, config)
        else:
            argv = runner["command"](report, files)
        rc, out, err, timed_out = _run(argv, repo, _child_env(kind), budget)
        if out:
            print(out, file=sys.stderr, end="" if out.endswith("\n") else "\n")
        if err:
            print(err, file=sys.stderr, end="" if err.endswith("\n") else "\n")
        commands = [{"argv": argv,
                     "cwd": ".",
                     "exit_code": rc,
                     "timed_out": timed_out,
                     "report_kind": runner["report_name"],
                     "stdout_tail": out[-OUTPUT_TAIL:],
                     "stderr_tail": err[-OUTPUT_TAIL:]}]
        common = {"executed": True, "test_files": files, "exit_code": rc, "commands": commands}
        if timed_out:
            return (_result(task_id, FAILED,
                            f"timeout: exceeded {budget}s; this entry point's process tree "
                            "was terminated", **common), EXIT_TEST_FAILED)
        try:
            if kind == "ts":
                counts = runner["parse"](report, expected_files=files, repo_root=repo)
            else:
                counts = runner["parse"](report)
        except Exception as exc:  # noqa: BLE001 - missing/damaged machine report is never a pass
            detail = f"{type(exc).__name__}: {exc}"
            if rc == 0:
                return (_result(task_id, FAILED,
                                f"report_corrupt: runner exited 0 but its machine report is "
                                f"invalid ({detail})", counts=None, **common), EXIT_TOOL_ERROR)
            return (_result(task_id, FAILED, f"report_corrupt: {kind} runner exited {rc} without "
                            f"a readable machine report ({detail})", counts=None, **common), EXIT_TEST_FAILED)
        common["counts"] = counts
        label = "pytest" if kind == "py" else "vitest"
        if kind == "ts" and rc == 0 and not json.loads(report.read_text(encoding="utf-8"))["success"]:
            return (_result(task_id, FAILED,
                            "report_corrupt: vitest exited 0 but reported unsuccessful suites",
                            **common), EXIT_TOOL_ERROR)
        if counts["collected"] == 0 and (rc == 0 or (kind == "py" and rc == 5)):
            return (_result(task_id, NOT_RUN, f"not_run: {label} collected no tests",
                            **common), EXIT_NOT_RUN)
        if counts["failed"]:
            return (_result(task_id, FAILED, f"tests_failed: {_summary(label, counts)}",
                            **common), EXIT_TEST_FAILED)
        if rc != 0:
            return (_result(task_id, FAILED,
                            f"tests_failed: {label} exited {rc} despite no failed testcase "
                            f"({_summary(label, counts)})", **common), EXIT_TEST_FAILED)
        if counts["passed"] == 0 or counts["skipped"] == counts["collected"]:
            return (_result(task_id, NOT_RUN,
                            f"not_run: {label} reported no executed test "
                            f"({_summary(label, counts)})", **common), EXIT_NOT_RUN)
        return (_result(task_id, PASSED, f"tests_passed: {_summary(label, counts)}",
                        **common), EXIT_PASSED)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def main(argv=None):
    parser = argparse.ArgumentParser(
        prog="verify_task.py",
        description="受白名单约束的单任务验证入口（只报告的只读检查工具）。")
    parser.add_argument("--task", required=True, help="清单中的任务 ID")
    parser.add_argument("--test", help="从该任务 test_paths 中精确选择一个仓库相对路径")
    parser.add_argument("--timeout", type=int, help=f"子进程整体墙钟预算，1..{MAX_TIMEOUT} 秒")
    args = parser.parse_args(argv)
    result, code = verify(args.task, test=args.test, timeout=args.timeout)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return code


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        raise SystemExit(main())
    except SystemExit:
        raise
    except (ToolError, OSError) as exc:
        print(json.dumps(_result("", FAILED, f"tool_error: {exc}"), ensure_ascii=False, indent=2))
        raise SystemExit(EXIT_TOOL_ERROR)
