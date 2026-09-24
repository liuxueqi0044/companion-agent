"""控制服务的集中路由装配点：本阶段只注册本地健康入口，不注册业务路由。"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health() -> dict[str, str]:
    """只表示本地进程可响应；不代表模型、数据库已连接或服务 ready。"""
    return {"status": "ok"}
