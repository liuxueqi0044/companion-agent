# BATCH-004：受约束的验证入口与最小健康服务

工作目录：C:\Users\xiayu\Documents\Codex\companion-agent。
当前派工只认本文件；CURRENT-TASK.md、BATCH-003.md 是历史证据，字节不变。

## 1. 顺序、依赖与停止

前置三卡已独立 accepted（reviews/BATCH-003.md）；累计 9 卡 accepted。
本批顺序：M00.0.04（验证入口）→ M00.0.05（FastAPI 健康服务）。先读 AGENTS.md、本文件、上轮复核、原两卡、共用 ARCHITECTURE、M00 模块和 C01–C04。旧材料只按需读，不全量重载。

架构负责人明确授权本批内“前卡真实自检无阻塞后串行继续、两卡批末集中复核”。不必卡间等 accepted；不修改原卡依赖/规范，不伪造 reviews，不把单测 passed 当作任务 accepted。任一卡阻塞则停止依赖它的后续卡。完成两卡 submitted 后停止，不启动 M00.3、Hermes、模型调用、完整 API 或 UI。

单一 Claude Code 会话；不使用子智能体/Agent Teams/额外模型会话。禁止访问账号、订阅或真实凭据。包下载和本机回环测试可用，不部署、不推送、不发消息。

## 2. 现有工具与本轮允许的依赖改动

- Python 测试明确使用 `.venv/Scripts/python.exe`；安装工具 `.local-tools/uv-0.12.18/uv.exe`，解释器 `.local-tools/python-3.13.15/python.exe`。不要使用 PATH 上裸 python，它可能属于用户已安装 Hermes。
- Node 使用 `.local-tools/node-v24.21.0-win-x64/node.exe`（24.21.0），npm 通过同目录 `node_modules/npm/bin/npm-cli.js` 调用（11.19.0）；运行 npm 脚本时只在子进程 PATH 前置该 Node 目录。无需再次下载工具。
- 上轮 Python 安装器已注册用户级 Python 路径；本轮只复用。不得重新运行安装器、全局 pip/npm、修改系统或用户 PATH/profile/注册表，也不得擅自卸载。
- M00.0.05 获准在根 pyproject.toml 增加已冻结 `fastapi==0.141.1`、`uvicorn==0.53.0`；保持 pydantic/pytest/hatchling 原钉版及打包设置。真实 uv 解析更新 uv.lock，并重新 uv export --locked 导出 requirements-dev.txt。生成物不是手写依赖解析结果。
- 不需要额外 HTTP 测试库：可用标准库 urllib 对本机 uvicorn 做 HTTP smoke，或 asyncio.run 驱动 ASGI。settings 用现有 Pydantic 和 os.environ，不新增 pydantic-settings/httpx/pytest-asyncio。
- 若实际依赖冲突或冻结版本不可用，保存原始错误、给出最小建议并停止；不得悄悄降版或改已 accepted 的 selected/ADR。仅访问官方包源，进程内覆盖镜像配置，不改用户配置。

本轮允许替换历史已 accepted 的 pyproject/uv.lock/requirements-dev，仅限上述明确新增依赖；.05 报告记录 supersedes 的原文件哈希和新哈希，根文件归 .05。历史 .01 的 accepted 指其提交时版本：原字节在 reviews/history/BATCH-003/submitted/ 可复核，不改其旧报告/manifest 迎合新文件。

## 3. M00.0.04：验证器的接口和权限边界

原卡写集：tools/verify_task.py、tests/unit/test_verify_task.py。
额外授权仅 vitest.config.ts：在保留原 include 的基础上增加 `tests/unit/**/*.test.ts`，使后续任务规范中的 TS 测试路径真正能被收集；不修改 npm scripts、版本或锁文件。此修改及哈希归 .04 的 dispatch_changed_files/manifest。

### 3.1 稳定行为

CLI：`.venv/Scripts/python.exe tools/verify_task.py --task <ID>`。
可选 `--test <仓库相对文件路径>` 只允许从该任务的 test_paths 精确选择子集；可选整数 --timeout（1–300 秒）。不接受 --command/--shell/任意 runner 参数、任意工作目录或任意 manifest 路径。不提供自动运行全部任务模式。

输出一个机器可读 JSON：task_id、status（passed/failed/not_run）、reason、executed（bool）、test_files、exit_code（未执行为 null）、counts（适用时包含 collected/passed/failed/skipped）、commands（固定参数数组，可脱敏的简短结果）。CLI 返回码：0=确有测试执行并通过；1=测试失败；2=输入/清单/路径/工具错误；3=not_run（手工、bootstrap、live、缺测试或全跳过）；超时返回非零并明确 timeout。测试 stdout/stderr 不混入顶层 JSON，可作为 JSON 字段/单独 stderr/明确日志，选一种保持一致。

此工具只报告技术检查结果，不修改 reports/reviews、不写 accepted、不执行业务任务、不验证账号。超时预算是子进程整体墙钟时间，不允许无限挂起。只结束本工具启动并拥有的子进程，不按进程名杀用户程序。

### 3.2 权威清单与命令构建

只从根目录推导出的 `docs/execution/microtasks.json` 读取任务，复用已有 `docs/execution/taskctl.py` 的只读清单校验能力，保留规范和架构哈希校验；不复制一套新任务数据库。不直接执行其中的 verification_commands：这类数组包含指向 verify_task 自身的入口，直接执行会递归，且任务描述不是任意 shell 授权。

- kind=py/ts 且 verification_mode=targeted_tests：只选任务 test_paths 中实际存在的测试文件，校验完才启动测试器。默认要求清单所有测试文件存在；部分缺失也不能把其余跑完后标整卡 passed。
- kind=manual/bootstrap/live（以及其他非自动模式）：输出 not_run，说明需要对应实测/人工证据；本工具不读密钥、不自行调用真实服务。尤其 M00.3.01 无论环境有没有账号都不能在此入口触发模型请求。
- py 构造 `[项目 .venv python, -m, pytest, 精确路径...]`；ts 构造 `[固定 node.exe, 固定 npm-cli.js, run, test:unit, --, 精确路径...]`。shell=False。不得拼接命令字符串或借 cmd /c、PowerShell 执行外部输入。
- Windows 的 .cmd 不是必须中转层，优先 node.exe 执行 npm-cli.js。npm 的固定脚本可以正常使用其既有机制，但不能允许输入改变 script 或注入 flags。
- 不用退出 0 单独推断有测试。采用 pytest/Vitest 已有机器报告（临时 JSON/JUnit）核对真正收集与执行，零测试/全跳过/全 todo/损坏报告都不能 passed。禁止 passWithNoTests 或吞错；不要实现脆弱的整段终端字符串解析作为唯一依据。

### 3.3 路径校验与测试要求

任务 ID 精确查表；用户路径与清单路径均校验。拒绝绝对路径、盘符/UNC、..、NUL、Windows ADS、通配符、目录、以 - 开头的参数、非允许文件或错误扩展名。统一分隔符并 resolve，确认最终路径仍在仓库内，防 symlink/junction 逃逸；文件必须在该卡 test_paths 白名单。不允许跨卡测试扩权；只读校验失败不得先启动任何进程。

单元测试覆盖：未知 ID；合法精确路径；全部/部分测试缺失；py/ts 固定 argv 与 shell=False；路径穿越/绝对路径/符号链接越界/参数注入；清单哈希不符；非自动任务 not_run；pytest 零测试/全 skipped、Vitest 全 skipped/todo、执行失败/超时/报告损坏；确保没有模型/账号调用。正向运行路径至少一次用真实 pytest 和一次真实 Vitest（测试 fixture 用临时仓库/内部依赖注入，不修改正式清单，不在生产 CLI 增加任意 manifest 入口）。

本卡自身原清单 kind=bootstrap、test_paths=[]，因此 `verify_task --task M00.0.04` 应返回 not_run。本卡单测由显式 `python -m pytest tests/unit/test_verify_task.py` 验证；不要篡改原清单使自举工具假装完成独立验收。临时 fixture 不是生产任务，不得新增正式卡或写 reviews。

## 4. M00.0.05：最小 FastAPI 服务

原卡写集：services/control/app.py、routes.py、settings.py。
额外授权：tests/unit/test_control_app.py，以及 §2 中三个根依赖文件。此处不接任务系统、认证、数据库或外部 SDK。

- settings.py：定义可测试的 Settings 与显式读取环境方法；只读取 `COMPANION_` 前缀的本服务设置，不扫描/回显整个环境。默认本地模式、127.0.0.1、8000；端口校验 1–65535、日志级别限定枚举、环境限定 local/test。未知/非法已知值明确失败，不静默吞错。本阶段配置不含 API key，不加载用户 .env。
- app.py：`create_app(settings=None)` 为集中装配工厂，并导出供 uvicorn 使用的 `app`。导入可以构造纯本地对象，不能启动线程/进程、绑定端口、发网络请求、初始化数据库、扫描凭据。两个工厂实例不共享可变用户状态。
- routes.py：仅注册 `GET /health`，无凭据返回 200 与固定 `{"status":"ok"}`。它只表示本地进程响应，不冒充模型/数据库已连接或服务 ready。
- 关闭自动 docs/redoc/openapi 路由；未注册路径（含 /api/v1/tasks）返回 404。不要用万能 catch-all 返回健康响应；不添加宽松 CORS、中间件认证或未来路由占位。前缀/行为是本轮局部接口决定，不提前冻结 C02 的未来业务 API。
- HTTP 错误、健康响应不包含机器绝对路径、环境快照、依赖连接信息或凭据。设置错误指出字段即可，不回显敏感环境值。

### 实际验收

1. 在受控、无模型密钥的子进程运行本地 uvicorn（127.0.0.1，临时空闲端口），用标准库客户端请求 /health 200、未知路径及 /api/v1/tasks 404、/docs 与 /openapi.json 404。保存响应与监听地址，结束自己启动的进程；不访问任何外部服务。
2. 测试导入不联网：在新进程、导入前拦截 socket 连接/监听调用，导入 services.control.app 和 create_app 成功且无调用；不要在已有模块缓存下证明“导入安全”。
3. 测试默认设置、端口/环境/日志级别非法值、多实例工厂，不靠复制实现的断言；无 key 也可启动。
4. 根依赖真实 uv lock/sync/export，保留 frozen direct versions；用隔离环境 frozen sync 验证，然后跑本批两组 Python 单测。无需为此次 Python 依赖新增重跑所有前端安装；.04 改了 Vitest include，须跑相关 Vitest 定向 smoke。

## 5. 所有权与报告

- .04：两个原卡文件 + vitest.config.ts + 本卡报告/检查点/evidence。
- .05：三个服务文件 + tests/unit/test_control_app.py + pyproject.toml/uv.lock/requirements-dev.txt + 本卡报告/检查点/evidence。
- 批次汇总仅 reports/BATCH-004.md。其他历史源码、报告、manifest、reviews、规则、派工、旧检查器/清单/契约/holdout 只读；不改 UI 或 Node 依赖。

权威范围检查：`.local-tools/python-3.13.15/python.exe docs/handoff/check_batch004_scope.py`；基线：docs/handoff/BATCH-004-BASELINE.json。不要调用旧批次 scope 作为本轮门槛。

各 report：status=submitted、batch_id=BATCH-004、dispatch_ref=docs/handoff/BATCH-004.md、base_ref=本批 snapshot_id，规范哈希用原卡。changed_files 列原卡范围与专属报告证据；额外授权写入 dispatch_changed_files 并指向本派工，仍全部受 scope 检查且进入对应最终成果 manifest。批次摘要列 batch_level_changed_files，不混入单卡范围。历史共享文件更新记录 supersedes=[{path,previous_sha256,new_sha256,reason}]，不篡改旧卡 accepted 报告。

manifest 只列最终业务代码/配置/锁文件，不把 manifest 自己、报告、日志混入循环哈希。每条命令保存实际 argv、cwd、exit_code 和真实日志路径；逐个原验收 ID 给证据，别把额外检查替换原 A01…定义。实际阻塞保留 unresolved，未来事项写 evaluator_followups。不得将 mock 说成真实接入。

收尾：两卡实际测试→报告/检查点/批次汇总→scope 输出落盘并复跑含自身→manifest/result_ref 复算→taskctl validate/next 留档。next 在本批独立复核前仍应停 M00.0.04、accepted=9。

45 分钟保存检查点；同因两次失败或单卡超 90 分钟仍无可验收结果，记录最小阻塞并停止。开发量不包括无必要的自检器/报告重复建设，复用 pytest/Vitest 和现有清单校验。两卡完成即 submitted，禁止批外扩展。
