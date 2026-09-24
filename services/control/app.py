"""控制服务的最小装配：create_app 工厂与供 uvicorn 使用的模块级 app。"""

from __future__ import annotations

from fastapi import FastAPI

from .routes import router
from .settings import Settings


def create_app(settings: Settings | None = None) -> FastAPI:
    """集中装配点：读取本服务环境设置，只构造纯本地对象。"""
    resolved = Settings.from_env() if settings is None else settings
    app = FastAPI(
        title="Companion Agent 控制服务（M00.0.05 最小健康服务）",
        version="0.0.0",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        redirect_slashes=False,
    )
    app.state.settings = resolved
    app.include_router(router)
    return app


app = create_app()
