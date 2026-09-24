# desktop-local/1 Python 入口

`tools/desktop_bridge.py` 是固定的单请求 stdio 入口。它使用 `-I` 启动，一次读取不超过 384 KiB UTF-8 JSON，输出一个不超过 1 MiB 的 JSON 行，然后退出。唯一公开开发数据根是 `reports/evidence/BATCH-016/runtime/`；请求或环境变量不能改变根目录。除 `bootstrap` 外，读写均要求已初始化。根路径及 SQLite/锁文件逐段拒绝符号链接和 Windows junction。

`RequestEnvelope` 和 `ResponseEnvelope` 由本包的 Pydantic 模型约束；`packages/contracts/desktop-local/schema.json` 由 `python -m services.desktop_bridge.schema` 生成，`--check` 只核对现有文件。业务 payload 与返回值调用已存在的 personal_ai/local_tasks Pydantic 模型，不能把这层包络当成完整业务 Schema。

只有测试内可信工厂 `create_app(root)` 与 `handle_bytes(raw, root=...)` 可以注入本批临时根。公开脚本不解析额外 argv、不接受可执行代码或通用 shell 命令。`worker.run-next` 每次仅运行已有固定 `csv_audit/1`，并由原 SQLite/OS 锁维护状态。异常的 stdout 不含原输入；业务错误以带关联 ID 的包络返回，协议及进程错误由 Node host 分类。
