"""控制服务的最小设置：只读取 COMPANION_ 前缀的本服务项，不扫描、不回显整个环境。"""

from __future__ import annotations

import os
from collections.abc import Mapping
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

ENV_PREFIX = "COMPANION_"

# 只有这张表里的键会被读取；其他前缀（含常见的 *_API_KEY）既不读取也不进入设置对象。
ENV_FIELDS: Mapping[str, str] = {
    "COMPANION_MODE": "mode",
    "COMPANION_HOST": "host",
    "COMPANION_PORT": "port",
    "COMPANION_LOG_LEVEL": "log_level",
    "COMPANION_ENVIRONMENT": "environment",
}

FIELD_ENV: Mapping[str, str] = {field: name for name, field in ENV_FIELDS.items()}

FIELD_HINTS: Mapping[str, str] = {
    "mode": "本阶段仅支持 local",
    "host": "需为非空主机字面量，且不含空白或 '/'",
    "port": "需为 1–65535 的整数",
    "log_level": "只能是 critical/debug/error/info/warning 之一",
    "environment": "只能是 local/test 之一",
}


class SettingsError(ValueError):
    """设置缺失、非法或含未知项；只报字段/键名，不回显环境值。"""


class Settings(BaseModel):
    """不可变设置对象；默认值即本地开发配置，本阶段不含任何凭据字段。"""

    model_config = ConfigDict(extra="forbid", frozen=True)

    mode: Literal["local"] = "local"
    host: str = "127.0.0.1"
    port: int = Field(default=8000, ge=1, le=65535)
    log_level: Literal["debug", "info", "warning", "error", "critical"] = "info"
    environment: Literal["local", "test"] = "local"

    @field_validator("host")
    @classmethod
    def _host_is_literal(cls, value: str) -> str:
        text = value.strip()
        if not text or "/" in text or any(char.isspace() for char in text):
            raise ValueError(FIELD_HINTS["host"])
        return text

    @classmethod
    def from_env(cls, environ: Mapping[str, str] | None = None) -> "Settings":
        """显式读取环境：只取值于 ENV_FIELDS 列出的键，未知的 COMPANION_ 键直接失败。"""
        source = os.environ if environ is None else environ
        raw: dict[str, object] = {}
        unknown: list[str] = []
        for name in source:
            if not name.startswith(ENV_PREFIX):
                continue
            field = ENV_FIELDS.get(name)
            if field is None:
                unknown.append(name)
            else:
                raw[field] = source[name]
        if unknown:
            raise SettingsError(
                f"未知的 {ENV_PREFIX} 设置项：{', '.join(sorted(unknown))}"
                f"；本阶段支持：{', '.join(sorted(ENV_FIELDS))}"
            )
        if "port" in raw:
            try:
                raw["port"] = int(str(raw["port"]))
            except (TypeError, ValueError):
                raise SettingsError(
                    f"COMPANION_PORT 非法：{FIELD_HINTS['port']}"
                ) from None
        try:
            return cls(**raw)
        except ValidationError as exc:
            names = sorted(
                {str(error["loc"][0]) for error in exc.errors() if error.get("loc")}
            )
            detail = "；".join(
                f"{FIELD_ENV[name]}：{FIELD_HINTS[name]}"
                for name in names
                if name in FIELD_ENV
            )
            raise SettingsError(f"设置项非法：{detail}") from None
