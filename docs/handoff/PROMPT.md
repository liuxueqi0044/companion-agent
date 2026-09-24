请在当前单一开发对话连续完成BATCH-016六包，约18个小任务，包间checkpoint后继续，批末统一submitted。
唯一工作区：C:\Users\xiayu\Documents\Codex\companion-agent

先读AGENTS.md、reviews/BATCH-015.md、docs/decisions/ADR-007-desktop-local-bridge.md，再完整读docs/handoff/BATCH-016.md。旧CURRENT-TASK不是入口。

BATCH-015已独立通过本地确定性任务流程，54测通过/1系统symlink跳过，014两项问题关闭。下一步把真实服务接到前端可调用的非视觉桌面连接层：
A Python stdio包络/固定入口，复用业务Pydantic与服务。
B Node受限进程桥：固定spawn、关联响应、限额、超时和不确定回执。
C 长worker与查询/取消并行协调，显式故障恢复，不伪造终态。
D 无视觉client控制器：订阅、快照/事件、分页、旧响应防覆盖、dispose。
E 真Node→Python→SQLite→CSV跨语言集成和故障回归。
F 无视觉演示脚本、前端接线说明、统一验收。

要跑真实本地能力，不只交mock接口。一次请求一个受控子进程，worker独立运行，取消/查询不被阻塞；不新造Agent/常驻daemon/通用Schema编译器。业务payload仍Python单源，Node只验证包络，不手工复制整套业务契约。

精确写集以派工§8为准：新desktop_bridge Python/CLI、apps/desktop/bridge host/client及局部配置、新内部Schema和局部测试/证据。旧personal_ai/local_tasks/CLI/worker/renderer/全部历史DB和账本只读。固定新runtime根reports/evidence/BATCH-016/runtime，测试可内部注入临时根，页面请求不可改路径/命令/环境。

模型/HTTP/凭据/安装0，不开Agent/子智能体/新会话，不启动Electron/浏览器/网络服务。初始视觉与UI实现仍由交接方架构师负责，开始前通知用户等待调档，你不做页面/组件/配色。原生隔离/真实Electron/语义理解继续not_run。禁止执行模型代码，不读holdout，不绕过旧浏览器/截图/删除拒绝，不提交Git/部署。

使用check_batch016_scope.py与BATCH-016-BASELINE.json，按B16-A01…F01留真实证据，统一submitted后停止。result_ref定义为canonical artifacts列表hash，另列manifest_file_sha256。原accepted仍12，不自写accepted。
