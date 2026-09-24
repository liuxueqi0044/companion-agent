"""M00.0.05 的真实测试：设置校验、装配工厂、健康入口与本地进程联网边界。

只用标准库驱动 ASGI / HTTP（不用 httpx、pytest-asyncio）；真实 uvicorn 与导入探针跑在独立子进程里。
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest
from pydantic import ValidationError

from services.control.app import app as module_app
from services.control.app import create_app
from services.control.settings import ENV_FIELDS, Settings, SettingsError

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SERVICES_DIR = PROJECT_ROOT / "services" / "control"

SENSITIVE_ENV = re.compile(
    r"(?i)(key|token|secret|password|passwd|credential|authorization|auth|cookie"
    r"|anthropic|openai|claude|ollama|gemini|proxy|api)"
)

HEALTH_PATHS_404 = (
    "/health/",
    "/healthz",
    "/health/extra",
    "/api",
    "/api/v1",
    "/api/v1/tasks",
    "/api/v1/tasks/m00",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/",
    "//health",
)


def call_asgi(app, path: str, method: str = "GET", headers: list | None = None):
    """标准库 asyncio 直接驱动 ASGI，返回 (状态码, 响应头, 正文文本)。"""
    messages: list[dict] = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        messages.append(message)

    raw_headers = headers or [(b"host", b"127.0.0.1:8000")]
    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": method.upper(),
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("utf-8"),
        "query_string": b"",
        "root_path": "",
        "headers": raw_headers,
        "client": ("127.0.0.1", 51000),
        "server": ("127.0.0.1", 8000),
    }
    asyncio.run(app(scope, receive, send))
    start = next(m for m in messages if m["type"] == "http.response.start")
    body = b"".join(
        m.get("body", b"") for m in messages if m["type"] == "http.response.body"
    )
    response_headers = {
        key.decode("latin-1").lower(): value.decode("latin-1")
        for key, value in start["headers"]
    }
    return start["status"], response_headers, body.decode("utf-8")


def route_table(app) -> dict:
    """递归收集实际注册的路径与方法；include_router 在新版 FastAPI 里保持为嵌套对象。"""
    table: dict[str, set] = {}

    def walk(routes) -> None:
        for route in routes:
            path = getattr(route, "path", None)
            methods = getattr(route, "methods", None)
            if path is not None and methods:
                table.setdefault(path, set()).update(methods)
            nested = getattr(route, "routes", None)
            if nested is None:
                nested = getattr(getattr(route, "original_router", None), "routes", None)
            if nested:
                walk(nested)

    walk(app.routes)
    return table


def client_env(extra: dict) -> dict:
    env = {
        name: value
        for name, value in os.environ.items()
        if not SENSITIVE_ENV.search(name) and not name.startswith("COMPANION_")
    }
    env["PYTHONIOENCODING"] = "utf-8"
    env.update(extra)
    return env


def free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def http_request(port: int, path: str, method: str = "GET", timeout: float = 5.0):
    data = b"" if method.upper() == "POST" else None
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}{path}", data=data, method=method.upper()
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, dict(response.headers), response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers), error.read().decode("utf-8")


def wait_until_serving(port: int, process: subprocess.Popen, deadline: float = 25.0) -> None:
    end = time.monotonic() + deadline
    while time.monotonic() < end:
        if process.poll() is not None:
            raise AssertionError(
                "uvicorn 子进程提前退出：\n" + (process.stdout.read() if process.stdout else "")
            )
        try:
            status, _, _ = http_request(port, "/health", timeout=0.5)
            if status == 200:
                return
        except OSError:
            pass
        time.sleep(0.1)
    raise AssertionError(f"本地 uvicorn 在 {deadline} 秒内没有开始响应 127.0.0.1:{port}")


# ---------------------------------------------------------------- settings


def test_defaults_are_local_loopback_8000():
    settings = Settings()
    assert settings.mode == "local"
    assert settings.host == "127.0.0.1"
    assert settings.port == 8000
    assert settings.log_level == "info"
    assert settings.environment == "local"
    assert Settings.from_env({}) == settings


def test_env_table_covers_exactly_the_settings_fields():
    assert set(ENV_FIELDS.values()) == set(Settings.model_fields)


def test_from_env_applies_every_known_field():
    settings = Settings.from_env(
        {
            "COMPANION_MODE": "local",
            "COMPANION_HOST": "127.0.0.2",
            "COMPANION_PORT": "8123",
            "COMPANION_LOG_LEVEL": "warning",
            "COMPANION_ENVIRONMENT": "test",
            "PATH": "ignored",
        }
    )
    assert settings == Settings(
        host="127.0.0.2", port=8123, log_level="warning", environment="test"
    )


def test_unrelated_env_values_are_never_read_or_echoed():
    sentinels = {
        "OPENAI_API_KEY": "SENTINEL-OPENAI-VALUE",
        "ANTHROPIC_API_KEY": "SENTINEL-ANTHROPIC-VALUE",
        "AWS_SECRET_ACCESS_KEY": "SENTINEL-AWS-VALUE",
        "COMPANIONISH_PORT": "SENTINEL-NEAR-MISS-VALUE",
    }
    settings = Settings.from_env(sentinels)
    assert settings == Settings()
    text = f"{settings!r}{settings!s}{settings.model_dump()}"
    assert "SENTINEL" not in text


def test_unknown_companion_key_fails_without_echoing_value():
    with pytest.raises(SettingsError) as info:
        Settings.from_env({"COMPANION_API_KEY": "SENTINEL-KEY-VALUE"})
    message = str(info.value)
    assert "COMPANION_API_KEY" in message
    assert "SENTINEL-KEY-VALUE" not in message


@pytest.mark.parametrize("port", [1, 80, 8000, 65535])
def test_valid_ports_are_accepted(port):
    assert Settings.from_env({"COMPANION_PORT": str(port)}).port == port


@pytest.mark.parametrize("value", ["0", "65536", "-1", "abc", "", "8000.5", "0x10", "1e3"])
def test_invalid_ports_fail(value):
    with pytest.raises(SettingsError) as info:
        Settings.from_env({"COMPANION_PORT": value})
    message = str(info.value)
    assert "COMPANION_PORT" in message
    assert "1–65535" in message
    if value.strip():
        assert value not in message


@pytest.mark.parametrize(
    "level", ["debug", "info", "warning", "error", "critical"]
)
def test_valid_log_levels_are_accepted(level):
    assert Settings.from_env({"COMPANION_LOG_LEVEL": level}).log_level == level


@pytest.mark.parametrize("level", ["verbose", "warn", "INFO", "Info", "", "10"])
def test_invalid_log_levels_fail(level):
    with pytest.raises(SettingsError) as info:
        Settings.from_env({"COMPANION_LOG_LEVEL": level})
    assert "COMPANION_LOG_LEVEL" in str(info.value)


@pytest.mark.parametrize("environment", ["local", "test"])
def test_valid_environments_are_accepted(environment):
    assert Settings.from_env({"COMPANION_ENVIRONMENT": environment}).environment == environment


@pytest.mark.parametrize("environment", ["prod", "staging", "LOCAL", "dev", ""])
def test_invalid_environments_fail(environment):
    with pytest.raises(SettingsError) as info:
        Settings.from_env({"COMPANION_ENVIRONMENT": environment})
    assert "COMPANION_ENVIRONMENT" in str(info.value)


def test_mode_is_local_only_this_stage():
    assert Settings.from_env({"COMPANION_MODE": "local"}).mode == "local"
    for value in ("remote", "server", "hosted", "LOCAL", ""):
        with pytest.raises(SettingsError) as info:
            Settings.from_env({"COMPANION_MODE": value})
        assert "COMPANION_MODE" in str(info.value)


@pytest.mark.parametrize("host", ["127.0.0.1", "127.0.0.2", "localhost", "::1"])
def test_valid_hosts_are_accepted(host):
    assert Settings.from_env({"COMPANION_HOST": host}).host == host


@pytest.mark.parametrize(
    "host", ["", "   ", "127.0.0.1/x", "127.0.0.1 8000", "http://127.0.0.1", "a\tb"]
)
def test_invalid_hosts_fail(host):
    with pytest.raises(SettingsError) as info:
        Settings.from_env({"COMPANION_HOST": host})
    message = str(info.value)
    assert "COMPANION_HOST" in message
    if host.strip():
        assert host.strip() not in message


def test_invalid_value_messages_never_echo_the_raw_value():
    with pytest.raises(SettingsError) as info:
        Settings.from_env({"COMPANION_ENVIRONMENT": "SENTINEL-ENV-VALUE"})
    assert "SENTINEL-ENV-VALUE" not in str(info.value)


def test_settings_are_immutable_and_hashable():
    settings = Settings()
    with pytest.raises(ValidationError):
        settings.port = 9000
    assert isinstance(hash(settings), int)


def test_settings_forbid_extra_fields_including_api_keys():
    with pytest.raises(ValidationError):
        Settings(api_key="SENTINEL-VALUE")


def test_settings_directly_reject_invalid_port():
    with pytest.raises(ValidationError):
        Settings(port=0)


# ---------------------------------------------------------------- app / routes


def test_health_returns_200_with_fixed_body_and_no_credentials():
    status, headers, body = call_asgi(create_app(), "/health")
    assert status == 200
    assert json.loads(body) == {"status": "ok"}
    assert headers["content-type"].startswith("application/json")
    for name in ("set-cookie", "www-authenticate", "access-control-allow-origin"):
        assert name not in headers


def test_health_works_without_any_credential_header():
    status, _, body = call_asgi(
        create_app(),
        "/health",
        headers=[(b"host", b"127.0.0.1:8000")],
    )
    assert (status, json.loads(body)) == (200, {"status": "ok"})
    status, _, body = call_asgi(
        create_app(),
        "/health",
        headers=[
            (b"host", b"127.0.0.1:8000"),
            (b"authorization", b"Bearer SENTINEL-TOKEN"),
        ],
    )
    assert (status, json.loads(body)) == (200, {"status": "ok"})
    assert "SENTINEL-TOKEN" not in body


@pytest.mark.parametrize("path", HEALTH_PATHS_404)
def test_unregistered_paths_return_404_without_health_payload(path):
    status, _, body = call_asgi(create_app(), path)
    assert status == 404
    assert "ok" not in json.loads(body)
    assert str(PROJECT_ROOT) not in body


def test_post_to_health_is_method_not_allowed():
    status, headers, body = call_asgi(create_app(), "/health", method="POST")
    assert status == 405
    assert json.loads(body) != {"status": "ok"}
    assert "GET" in headers.get("allow", "")


def test_docs_redoc_and_openapi_are_disabled():
    app = create_app()
    assert app.docs_url is None
    assert app.redoc_url is None
    assert app.openapi_url is None
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert call_asgi(app, path)[0] == 404


def test_only_health_route_is_registered():
    table = route_table(create_app())
    assert set(table) == {"/health"}
    assert "GET" in table["/health"]
    assert not any(path.startswith("/api") for path in table)


def test_no_middleware_or_cors_is_added():
    assert create_app().user_middleware == []


def test_error_and_health_bodies_contain_no_machine_specific_information():
    for path in ("/health", "/api/v1/tasks"):
        status, _, body = call_asgi(create_app(), path)
        assert status in (200, 404)
        assert str(PROJECT_ROOT) not in body
        assert "COMPANION_" not in body
        assert sys.version.split()[0] not in body


def test_module_level_app_is_the_uvicorn_entry_point():
    from fastapi import FastAPI

    assert isinstance(module_app, FastAPI)
    assert "/health" in route_table(module_app)
    assert module_app.state.settings == Settings()
    assert call_asgi(module_app, "/health")[0] == 200


def test_create_app_uses_the_passed_settings_instance():
    settings = Settings(port=8123, log_level="error")
    app = create_app(settings)
    assert app.state.settings is settings
    assert app.state.settings.port == 8123


def test_explicit_settings_take_priority_over_invalid_environment(monkeypatch):
    monkeypatch.setenv("COMPANION_PORT", "not-a-port")
    injected = Settings(port=8123, environment="test")
    assert create_app(injected).state.settings is injected


def test_fresh_process_default_factory_and_module_app_read_valid_environment():
    script = ("import json\n"
              "from services.control.app import app, create_app\n"
              "print(json.dumps({'module': app.state.settings.model_dump(), "
              "'factory': create_app().state.settings.model_dump()}))\n")
    env = client_env({"COMPANION_PORT": "8123", "COMPANION_ENVIRONMENT": "test",
                      "COMPANION_LOG_LEVEL": "warning"})
    proc = subprocess.run([sys.executable, "-c", script], cwd=str(PROJECT_ROOT), env=env,
                          capture_output=True, text=True, encoding="utf-8", timeout=30)
    assert proc.returncode == 0, proc.stderr
    data = json.loads(proc.stdout)
    for entry in (data["module"], data["factory"]):
        assert entry["port"] == 8123
        assert entry["environment"] == "test"
        assert entry["log_level"] == "warning"


@pytest.mark.parametrize("key,value", [
    ("COMPANION_PORT", "not-a-port"),
    ("COMPANION_ENVIRONMENT", "invalid-environment"),
    ("COMPANION_LOG_LEVEL", "verbose"),
])
def test_fresh_process_module_app_rejects_invalid_environment(key, value):
    env = client_env({key: value})
    proc = subprocess.run([sys.executable, "-c", "from services.control.app import app"],
                          cwd=str(PROJECT_ROOT), env=env, capture_output=True, text=True,
                          encoding="utf-8", timeout=30)
    assert proc.returncode != 0
    assert "SettingsError" in proc.stderr and key in proc.stderr
    assert value not in proc.stderr


def test_two_factory_instances_do_not_share_mutable_state():
    first, second = create_app(), create_app()
    assert first is not second
    assert first.state.settings == second.state.settings
    assert first.state.settings is not second.state.settings
    first.state.settings = Settings(port=1234)
    assert second.state.settings.port == 8000
    first.get("/probe")(lambda: {"status": "probe"})
    assert "/probe" in route_table(first)
    assert "/probe" not in route_table(second)
    assert call_asgi(second, "/probe")[0] == 404


def test_service_sources_have_no_model_or_http_client_references():
    forbidden = (
        "openai",
        "anthropic",
        "gemini",
        "ollama",
        "requests",
        "httpx",
        "aiohttp",
        "urllib",
        "socket",
        "dotenv",
        "bearer",
    )
    for name in ("app.py", "routes.py", "settings.py"):
        text = (SERVICES_DIR / name).read_text(encoding="utf-8").lower()
        for token in forbidden:
            assert token not in text, f"{name} 含禁止 token：{token}"


# ---------------------------------------------------------------- 子进程证据


IMPORT_PROBE = '''import json
import socket
import threading

CALLS = []


def _record(name):
    def wrapper(*args, **kwargs):
        CALLS.append(name)
        raise AssertionError("import 期间出现网络调用：" + name)
    return wrapper


socket.socket.connect = _record("connect")
socket.socket.connect_ex = _record("connect_ex")
socket.socket.bind = _record("bind")
socket.socket.listen = _record("listen")
socket.socket.accept = _record("accept")
socket.socket.sendto = _record("sendto")
socket.create_connection = _record("create_connection")
socket.getaddrinfo = _record("getaddrinfo")
socket.gethostbyname = _record("gethostbyname")
socket.socketpair = _record("socketpair")

threads_before = {thread.ident for thread in threading.enumerate()}

import services.control.app as app_module
from services.control.app import create_app
from services.control.routes import router
from services.control.settings import Settings

instance = create_app()

threads_after = {thread.ident for thread in threading.enumerate()}

print(json.dumps({
    "network_calls": CALLS,
    "app_type": type(instance).__name__,
    "module_app_type": type(app_module.app).__name__,
    "module_file": app_module.__file__,
    "router_routes": sorted(getattr(route, "path", "?") for route in router.routes),
    "new_threads": sorted(threads_after - threads_before),
    "thread_count": threading.active_count(),
}, sort_keys=True))
'''


def test_import_is_network_free_in_a_fresh_process(tmp_path):
    script = tmp_path / "import_probe.py"
    script.write_text(IMPORT_PROBE, encoding="utf-8")
    completed = subprocess.run(
        [sys.executable, str(script)],
        cwd=str(PROJECT_ROOT),
        env=client_env({}),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=120,
    )
    assert completed.returncode == 0, completed.stdout + completed.stderr
    report = json.loads(completed.stdout.strip().splitlines()[-1])
    print(f"import probe argv: {[sys.executable, str(script)]}")
    print(f"import probe report: {json.dumps(report, sort_keys=True)}")
    assert report["network_calls"] == []
    assert report["app_type"] == "FastAPI"
    assert report["module_app_type"] == "FastAPI"
    assert str(PROJECT_ROOT) in report["module_file"]
    assert report["router_routes"] == ["/health"]
    assert report["new_threads"] == []
    assert report["thread_count"] == 1


SMOKE_SERVER = '''from services.control.app import create_app
from services.control.settings import Settings
import uvicorn

settings = Settings.from_env()
print(
    "smoke-server settings"
    f" host={settings.host} port={settings.port} log_level={settings.log_level}"
    f" environment={settings.environment} mode={settings.mode}",
    flush=True,
)
uvicorn.run(
    create_app(),
    host=settings.host,
    port=settings.port,
    log_level=settings.log_level,
    access_log=False,
)
'''


def test_real_uvicorn_serves_health_200_and_404s(tmp_path):
    script = tmp_path / "smoke_server.py"
    script.write_text(SMOKE_SERVER, encoding="utf-8")
    port = free_port()
    injected = {
        "COMPANION_HOST": "127.0.0.1",
        "COMPANION_PORT": str(port),
        "COMPANION_LOG_LEVEL": "info",
    }
    env = client_env(injected)
    assert not any(SENSITIVE_ENV.search(name) for name in env)

    request = [sys.executable, str(script)]
    process = subprocess.Popen(
        request,
        cwd=str(PROJECT_ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    observed: list[tuple[str, str, int]] = []
    try:
        wait_until_serving(port, process)
        cases = [
            ("/health", "GET", 200),
            ("/health", "POST", 405),
            ("/health/", "GET", 404),
            ("/api/v1/tasks", "GET", 404),
            ("/api/v1/tasks", "POST", 404),
            ("/docs", "GET", 404),
            ("/redoc", "GET", 404),
            ("/openapi.json", "GET", 404),
            ("/unknown", "GET", 404),
            ("//health", "GET", 404),
        ]
        for path, method, expected in cases:
            status, headers, body = http_request(port, path, method)
            observed.append((path, method, status))
            assert status == expected, (path, method, status, body)
            assert str(PROJECT_ROOT) not in body
            if status == 200:
                assert json.loads(body) == {"status": "ok"}
                assert headers["content-type"].startswith("application/json")
            else:
                assert json.loads(body) != {"status": "ok"}
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(process.pid)],
                capture_output=True,
                timeout=30,
            )
            process.wait(timeout=10)
        output = process.stdout.read() if process.stdout else ""

    print(f"smoke argv: {request}")
    print(
        "smoke env: 子进程环境已剔除全部 key/token/secret/凭据/模型供应商/代理变量，"
        f"只注入 {', '.join(f'{name}={value}' for name, value in sorted(injected.items()))}"
    )
    print(f"smoke listening: 127.0.0.1:{port}")
    for path, method, status in observed:
        print(f"smoke response: {method} {path} -> {status}")
    print("smoke server output:")
    print(output)

    assert f"Uvicorn running on http://127.0.0.1:{port}" in output
    assert f"port={port}" in output
    end = time.monotonic() + 5.0
    while time.monotonic() < end:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.3):
                pass
        except OSError:
            break
        time.sleep(0.2)
    else:
        raise AssertionError("服务器进程结束后端口仍可连接")
