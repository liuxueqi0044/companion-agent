# desktop-local/1

本契约仅覆盖 request_id、action、payload 和传输回执。`schema.json` 从 `services.desktop_bridge.models` 确定性生成；业务 payload 与结果继续由已有个人 AI / local-task Pydantic 模型验证。它不是通用 JSON Schema→TypeScript 编译器，也不扩展公共 C01–C11 契约。
