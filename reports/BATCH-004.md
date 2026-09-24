# BATCH-004 交接摘要

派工来源：`docs/handoff/BATCH-004.md`（batch_id=BATCH-004）；基线快照 `sha256:9a2508e93f0db7e548a41835c51b32013b4e7cf215ec7014e1ae3a5e18ff2e67`（`docs/handoff/BATCH-004-BASELINE.json`，724 文件）。本批按 §1 串行授权一次交付两卡：M00.0.04（受白名单约束的单任务验证入口）→ M00.0.05（最小 FastAPI 服务、设置校验与 /health），前卡真实自检通过、无阻塞后继续下一卡，两卡完成后集中提交。两卡报告均为 `submitted`，**均未 accepted**——只有独立复核能给 accepted，submitted ≠ accepted。本批无 Git 提交（工作区不是 Git 仓库），任何哈希均为文件内容哈希。`CURRENT-TASK.md`、BATCH-003.md 等历史证据与全部已 accepted 产物字节未动。

按要求：本批全部为**真实依赖解析、真实服务进程、真实运行/测试**，不以配置文件或报告充数；未做任何系统/用户级安装升级，未改系统 PATH、用户 profile、`~/.npmrc` 或 pip 镜像配置。`taskctl next` 在本批独立复核前仍停 `M00.0.04`、`accepted=9`（原始输出见 `reports/evidence/M00.0.05/logs/14-batch-end-taskctl.txt`）。

## 1. 两卡状态

| 卡 | 状态 | 产物 | 报告 / 证据 |
| --- | --- | --- | --- |
| M00.0.04 受白名单约束的单任务验证入口 | submitted | `tools/verify_task.py`、`tests/unit/test_verify_task.py`、`vitest.config.ts`（include 追加） | `reports/M00.0.04.json`（`manifest-sha256:fd3ab4aa98a59f23219c515f863e9d8a912b2fb3ca9ec1615185baba000f9ebd`）；自检 `reports/evidence/M00.0.04/` |
| M00.0.05 最小 FastAPI 服务、设置校验与 /health | submitted | `services/control/settings.py`、`routes.py`、`app.py`、`tests/unit/test_control_app.py`、`pyproject.toml`/`uv.lock`/`requirements-dev.txt`（依赖授权更新） | `reports/M00.0.05.json`（`manifest-sha256:f946590daf0e183ff9ce0d8d46b5829e8b9a9448da8aae6953f95d3f8a89d456`）；自检 `reports/evidence/M00.0.05/` |

两卡各自 `reports/M00.0.0N.checkpoint.md` 已随卡保存，含下一步精确动作与禁止重复动作。规范哈希：M00.0.04 `b7f42e512a782b1619baf058c2a2e9b5aa9ee5d8c763e9ef5236bc4e36c361a3`、M00.0.05 `f2208cc8a424cd4246c1076b7db2fc955377d6e211ace5a4b423804590413174`（同 `docs/execution/microtasks.json` 对应条目）。`.local-tools/`、`.venv/`、`.venv-repro/`、`.uv-cache/`、`node_modules/`、`reports/evidence/**` 之外的生成目录按派工与 PRUNE 规则不入写集、不入清单、不随交付哈希。两卡依赖变更的原文件哈希→新哈希见 §2 说明与 `reports/M00.0.05.json` 的 `supersedes`。

## 2. 产物与哈希（sha256，收尾实测）

| # | 文件 | sha256 | 归属 manifest |
| --- | --- | --- | --- |
| 1 | `tools/verify_task.py` | `e2fd69da40d5631aea342af847d1599ec81345e3c4aa4642d2603e0f72b30821` | .04 |
| 2 | `tests/unit/test_verify_task.py` | `dee272d8d1a18bccba4dca62dd1601b9302be520050ecbb5e8bff13455d60c96` | .04 |
| 3 | `vitest.config.ts`（include 追加 `tests/unit/**/*.test.ts`） | `39fd2633e3b8f44d446a6d7e15e293b242f46079a51a83a67a3cb879c6abae92` | .04 |
| 4 | `services/control/settings.py` | `9f7aa58ffd2dd2d1a8cea1ee75c9cca285ac8b00ade32ca8ced9659a676f6d65` | .05 |
| 5 | `services/control/routes.py` | `d825505aae77391dadf9a513f1694de2acd50548a12b697a69706a76c2b4e6f2` | .05 |
| 6 | `services/control/app.py` | `bd4d62c7c720c1330ec296ca20918f15b1abda4084db5cfdedfb3183565430b5` | .05 |
| 7 | `tests/unit/test_control_app.py` | `e97618e8489b0c567cf70832f720a8549d67b6901ec042d14d9e6e6e1a10923f` | .05 |
| 8 | `pyproject.toml`（+fastapi/uvicorn 钉版） | `3be629a2d75c3b88248b92332a37bb955ec7d8bd668ccd565fa9b9979fe9ab4c` | .05 |
| 9 | `uv.lock`（真实 uv 解析，20 包） | `6647e4f1290bb2285186266d3af473954bcc584984537e82fbebb0a71cc6430d` | .05 |
| 10 | `requirements-dev.txt`（真实 uv export --locked） | `0a45546fdf6f570812c0b0da33cdbabc7537ea35a0577899b8b23eaeafc23b8b` | .05 |

清单归属：#1–3 见 `reports/evidence/M00.0.04/artifact-manifest.json`（`fd3ab4aa98a59f23219c515f863e9d8a912b2fb3ca9ec1615185baba000f9ebd`，3 文件）；#4–10 见 `reports/evidence/M00.0.05/artifact-manifest.json`（`f946590daf0e183ff9ce0d8d46b5829e8b9a9448da8aae6953f95d3f8a89d456`，7 文件）。收尾时两份 manifest 逐份复算：哈希等于各报告 `result_ref`，且 manifest 内每个文件的 sha256 与字节数均与磁盘一致（原始输出 `reports/evidence/M00.0.05/logs/13-batch-end-manifest-recompute.txt`）。

根依赖文件的历史替换（派工 §2 授权，仅 M00.0.05 新增依赖所需；旧字节在 `reviews/history/BATCH-003/submitted/` 可复核，旧报告/manifest 未改）：`pyproject.toml` `3a882095…`→`3be629a2…`；`uv.lock` `d252b1d2…`→`6647e4f1…`；`requirements-dev.txt` `2e7ba7e4…`→`0a45546f…`（进 `reports/M00.0.05.json` 的 `supersedes`）。`vitest.config.ts` 的 `55dd980c…`→`39fd2633…` 是 .04 的派工额外授权改动（进 `reports/M00.0.04.json` 的 `dispatch_changed_files`），与上述三文件同受 scope 检查并进入对应最终 manifest。

`holdout.json` 未改：`cfde4a5ddcaeb6b6c814ee6e9bc61a5ea9358528e9aa632e307ca81e272a93d6`（只核对哈希，未读内容，未用于生成测试或推导答案；见日志 13）。

## 3. 各卡做了什么

- **M00.0.04（验证入口）**：只写原卡两文件，并按派工 §3 给 `vitest.config.ts` 的 include 增加 `tests/unit/**/*.test.ts`（原 3 条规则、environment、passWithNoTests、npm scripts、版本与锁文件均未动）。`verify_task.py` 只从仓库根推导的 `docs/execution/microtasks.json` 读任务，复用 `docs/execution/taskctl.py` 的只读 `manifest()` 校验（依赖顺序、逐卡 spec_sha256、架构文件哈希、路径安全、acceptance/steps 非空、≤6 文件、task_count），不复制第二套任务库，也不执行清单里的 `verification_commands`（其首项指向本工具自身，直接执行会递归）。CLI 只接受 `--task <ID>`/`--test <仓库相对路径>`/`--timeout`（1–300 秒），无 `--command/--shell/--runner`/任意 manifest 入口，无全清单批跑模式；输出单个机器可读 JSON（task_id/status/reason/executed/test_files/exit_code/counts/commands），子进程完整输出只进 stderr。命令一律固定 argv 数组 + `shell=False`（py：`.venv` 的 python `-m pytest -p no:cacheprovider --junitxml=<临时>` 精确路径；ts：冻结 node.exe + 同目录 npm-cli.js `run test:unit -- --reporter=json --outputFile=<临时>` 精确路径），临时报告写系统临时目录。判定不靠退出码：解析 pytest junit XML 与 Vitest JSON，核对真实收集与执行；零收集/全 skipped/全 todo/报告缺失或损坏一律不得 passed（未使用 passWithNoTests、未吞错）。路径校验拒绝绝对路径/盘符/UNC/`..`/NUL/ADS/通配符/目录/前导 `-`，统一分隔符并 resolve 后必须仍在仓库内（防 junction/symlink 逃逸）且在该卡 test_paths 白名单；校验失败不启动任何进程。实测 55 项单测全过（含一次真实 pytest 与一次真实 Vitest 正向运行，fixture 用临时仓库 + 临时清单注入，未改正式清单）；真实清单 8 条 CLI 调用退出码 3/2/3/3/2/2/2/3 全部符合契约（含本卡自身 not_run、live 卡 M00.3.01 not_run、缺测试卡 not_run、未知 ID 与越界路径拒绝）；修改后的 `vitest.config.ts` 经全量运行（2 文件 6 测试）与一次性探针（`tests/unit` 下 `.test.ts` 被真实收集并执行 1 项，探针命令内创建、命令末删除）验证；.04 卡末范围检查 PASS（modified=1 / added=6 / missing=0）。
- **M00.0.05（最小健康服务）**：卡内三文件 + 派工额外授权的测试文件与三个根依赖文件。`settings.py` 以显式表 `ENV_FIELDS`（`COMPANION_MODE/HOST/PORT/LOG_LEVEL/ENVIRONMENT`）为唯一读取入口，非 `COMPANION_` 前缀键一律不取值，未知 `COMPANION_` 键与任何非法值抛 `SettingsError`（只报键名/字段名与允许范围，不回显原始环境值，不回显敏感值）；默认 local 模式、127.0.0.1、8000、info、local；端口 1–65535；日志级别/环境/mode 严格枚举；`Settings` 为 frozen + extra=forbid 的 pydantic 模型，本阶段无 API key 字段，不 import dotenv、不读 `.env`、不扫描凭据。`app.py` 提供 `create_app(settings=None)` 工厂与模块级 `app`；导入只构造纯本地对象（不起线程/进程、不绑端口、不发网络请求、不读凭据——用新进程导入前拦截 socket 层实测证明）；关闭 docs/redoc/openapi 三路由，`redirect_slashes=False` 使 `/health/` 直接 404 而非 307。`routes.py` 只注册 `GET /health` → 200 固定 `{"status":"ok"}`，无 catch-all、无 CORS、无认证中间件、无未来路由占位；错误与健康响应不含机器绝对路径、环境快照、依赖连接信息或凭据。依赖侧按 §2 只增冻结 `fastapi==0.141.1`、`uvicorn==0.53.0`（pydantic==2.13.5、pytest==9.1.1、hatchling==1.32.4 与打包设置原样）；真实 `uv lock`（20 包，无既有钉版变化）→ 真实 `uv sync` → 真实 `uv export --locked` 重新导出 requirements-dev.txt → `UV_PROJECT_ENVIRONMENT=.venv-repro uv sync --frozen` 隔离环境重建，两环境包集合逐项一致。实测：本卡单测 75 项全过（默认值与全部非法/边界值、未知键与不回显、多实例工厂不共享 state/路由、只注册 /health、无中间件、docs/redoc/openapi 与 /api/v1/tasks 404、响应体无仓库路径/环境快照）；受控子进程真实 uvicorn 在 127.0.0.1 + 临时空闲端口返回 /health 200、POST 405、其余 404（端口由 `COMPANION_PORT` 驱动，结束进程后端口关闭）；uvicorn CLI 生产入口 `services.control.app:app` 在无任何 `COMPANION_` 变量下同组响应亦通过；本批两组 Python 单测 130 passed；.04 改过 include 的 Vitest 定向 smoke 2 files/6 tests passed。全程子进程环境剔除全部 key/token/secret/凭据/模型供应商/代理变量，无模型、订阅或真实账户调用。

## 4. 关键自检结果与命令（原始输出：各卡 `reports/evidence/<ID>/verification.txt` 与 `logs/`）

| 命令（argv） | 退出码 | 结果 |
| --- | --- | --- |
| `.venv/Scripts/python.exe -m pytest tests/unit/test_verify_task.py -p no:cacheprovider -q`（.04） | 0 | `55 passed`（含真实 pytest/Vitest 正向路径、临时清单注入、超时与报告损坏负例；.04 日志 01） |
| 冻结 Node + npm-cli.js `run test:unit`（.04，全量） | 0 | 2 files / 6 tests passed（include 修改后既有收集未变；.04 日志 02） |
| 冻结 Node + npm-cli.js `run test:unit -- tests/unit/probe_include.test.ts`（.04 一次性探针） | 0 | 新 include 规则真实收集并执行 1 项；探针命令内创建、命令末删除（.04 日志 03） |
| `.venv/Scripts/python.exe tools/verify_task.py --task <真实清单 8 条>`（.04） | 3/2/3/3/2/2/2/3 | 未知 ID、越界路径、缺测试、live/手工卡 not_run、自身 not_run；真实清单只读未改（.04 日志 04） |
| `.local-tools/uv-0.12.18/uv.exe lock` / `sync` / `export --locked` / `lock --check` / `.venv-repro sync --frozen`（.05） | 0 | 锁 20 包（新增 8、既有钉版无变化）；`requirements-dev.txt` 为真实导出；隔离环境包集合与 `.venv` 逐项一致（.05 日志 01–03） |
| `.venv/Scripts/python.exe -m pytest tests/unit/test_control_app.py -p no:cacheprovider -q`（.05） | 0 | `75 passed`（.05 日志 04） |
| 同文件 `-k real_uvicorn`（.05） | 0 | 受控子进程真实 uvicorn（127.0.0.1:62526）→ 200/405/404 逐条响应 + 监听地址；结束进程后端口不可连接（.05 日志 05） |
| 同文件 `-k network_free`（.05） | 0 | 新进程导入前拦截 socket → `network_calls=[]`、`new_threads=[]`、`router_routes=["/health"]`（.05 日志 06） |
| `.venv/Scripts/python.exe -m pytest tests/unit/test_verify_task.py tests/unit/test_control_app.py -q`（.05 卡内） | 0 | `130 passed`（本批两组 Python 单测；.05 日志 07） |
| 冻结 Node + npm-cli.js `run test:unit -- reports/evidence/M00.0.02`（.05） | 0 | 2 files / 6 tests passed（定向 smoke；.05 日志 08） |
| `.venv/Scripts/python.exe tools/verify_task.py --task M00.0.05` / `--task M00.0.04`（.05 交叉核对） | 3 / 3 | 均 `not_run`（kind=bootstrap 需人工/自举证据，验证入口不冒充验收；.05 日志 09） |
| `.venv/Scripts/python.exe -m uvicorn services.control.app:app --host 127.0.0.1 --port <临时空闲> --log-level info`（.05 生产入口，无 `COMPANION_` 变量） | 0 | 127.0.0.1:59982；GET /health 200、POST /health 405、其余全 404；结束后端口关闭（驱动脚本经 stdin，未在仓库留文件；.05 日志 10） |
| 批末：`.venv/Scripts/python.exe -m pytest tests/unit/test_verify_task.py tests/unit/test_control_app.py -q` | 0 | 两卡实际测试最终态重跑 `130 passed`（日志 11） |
| 批末：冻结 Node + npm-cli.js `run test:unit -- reports/evidence/M00.0.02` | 0 | 2 files / 6 tests passed（日志 12） |
| 批末：`.local-tools/python-3.13.15/python.exe`（stdin 脚本）复算两卡 manifest/result_ref | 0 | 两份 manifest 哈希 = 各报告 `result_ref`；manifest 内 10 个文件逐条 sha256/字节数 OK；`holdout.json` = `cfde4a5d…`（日志 13） |
| 批末：`.local-tools/python-3.13.15/python.exe docs/execution/taskctl.py validate` | 0 | `{"valid": true, "tasks": 156, "first": "M00.1.01"}`（plan-only；日志 14） |
| 批末：`… taskctl.py next --reports-dir reports --reviews-dir reviews` | 0 | `{"task_id": "M00.0.04", "state": "submitted", "accepted": 9, "action": "review_or_resume_existing_work"}`——未伪造 accepted（日志 14） |

## 5. 来源证据与网络使用

- **Python 依赖（.05）**：只访问官方源 `pypi.org`/`files.pythonhosted.org`；全部 uv 调用在进程内以 `UV_INDEX_URL=https://pypi.org/simple` 覆盖镜像（uv 不读 pip 配置；用户 `%APPDATA%/pip/pip.ini` 的 tsinghua 镜像为既有配置，未读取、未修改）。锁文件与导出物均为真实解析/导出产物，非手写。
- **Node 侧**：本批未重跑前端安装（派工 §4 明确无需），只复用 .02/.03 既有 `node_modules` 运行 Vitest；冻结 Node 24.21.0 + npm 11.19.0，子进程 PATH 只在进程内前置该 Node 目录。
- **HTTP/网络**：唯一外部访问是官方包源；uvicorn/HTTP 实测全部只连 127.0.0.1 回环，未访问任何外部服务。
- 全程未登录任何账户、无令牌、未调用任何模型推理 API、未测试订阅额度、未访问付费服务；未安装/升级本机 Codex、Claude Code、Hermes；未把任何凭据复制或外传。子进程环境剔除全部凭据/供应商/代理变量后服务仍可启动（.05 A01 证据）。

## 6. 每卡验收入口（供独立复核按 ID 逐条核对）

- **M00.0.04-A01**（未知 ID 与越界/非法路径被拒且不启动进程）：`reports/M00.0.04.json` 的 `acceptance_results`；真实清单 `--task M99.9.99` exit 2 / `unknown_task_id`，16 例参数化非法路径 + junction 逃逸 + 清单自声明越界全部 exit 2 且 `commands == []`（.04 日志 04 与单测）。
- **M00.0.04-A02**（缺测试/零收集/全跳过/报告损坏不得 passed）：真实清单缺测试卡 `not_run(missing_test_files)`；临时清单部分缺失先校验全部路径、一个测试都不跑；pytest exit 5/全 skipped、Vitest 全 skipped+todo、报告缺失或损坏 → `not_run`/`failed`，未用 passWithNoTests、未吞错。
- **M00.0.04-A03**（非自动卡 not_run、无模型/账号调用）：`--task M00.3.01` exit 3 / `not_run / not_automatic`；注入 `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`COMPANION_*` 哨兵后仍 `not_run` 且 JSON 不含哨兵；源码禁止 token 扫描通过。
- **M00.0.04-A04**（不执行清单命令、固定 argv、shell=False）：payload 用例证明 `verification_commands` 的 shell 字符串从不被执行（工作目录与仓库根均无 `pwned.txt`），argv 均为 list 且 `shell=False`；CLI 无 `--command/--manifest/--repo/--runner` 等额外入口（exit 2）。
- **M00.0.05-A01**（无密钥可本地测试）：剔除全部凭据/供应商/代理变量的子进程真实 uvicorn 返回 `/health` 200 `{"status":"ok"}`；生产入口无任何 `COMPANION_` 变量亦可启动；Settings 本阶段无 API key 字段，未知 `COMPANION_API_KEY` 显式失败。
- **M00.0.05-A02**（导入不联网）：新进程导入前拦截 socket 连接/监听/DNS 后导入 `services.control.app` 成功且 `network_calls=[]`、`new_threads=[]`（非模块缓存下证明）。
- **M00.0.05-A03**（未注册路由不可访问）：`/health/`、`/api/v1/tasks`（GET+POST）、`/docs`、`/redoc`、`/openapi.json`、`/unknown`、`//health` 实测 404、POST /health 405；注册表只有 `GET /health`，`user_middleware == []`，三个文档 URL 均为 None。

## 7. 收尾写集检查（权威范围检查，同刻复跑）与 batch_level_changed_files

`python docs/handoff/check_batch004_scope.py` → **PASS**（撰写本摘要前的预跑：`modified=4 / added=32 / missing=0 / outside=[]`，`snapshot_id=sha256:9a2508e9…` 与两卡报告 `base_ref` 一致）。随后按派工要求把两次运行的原始 JSON 按序存进 `reports/evidence/M00.0.05/final-scope.txt`：run 1 的输出先落盘，run 2 在该日志已在盘上的状态下复跑——两次运行的计数均为 `modified=4 / added=34 / missing=0 / outside=[]`（34 = 预跑 32 + 本摘要 + 该日志本身），`result` 均为 `PASS`。该检查只输出路径清单、不记录文件哈希，故本日志对自身的提及仅在路径层面；两次运行之间与 run 2 之后，除该日志自身的输出追加外未再写入任何文件。

变化列表的构成：`modified` 仅 4 个已被本批派工授权的既有文件——`vitest.config.ts`（.04 §3）与 `pyproject.toml`/`uv.lock`/`requirements-dev.txt`（.05 §2）；`added` 全部为两卡的业务/测试/配置/锁文件（清单见 §2）、两卡报告与检查点、本摘要本身，以及 `reports/evidence/M00.0.0{4,5}/` 前缀下的证据文件（verification、manifest、各日志，含批末 11–14 与 final-scope.txt）。变化列表**不含** `reviews/`、`AGENTS.md`、`CLAUDE.md`、`docs/` 任何既有文件及其 helper、任何已 accepted 产物；`holdout.json` 字节未变。

本批 **batch_level_changed_files**（批级收敛产物，不属于任何单卡范围；单卡范围见各卡报告的 `changed_files` / `dispatch_changed_files`，不在此重列）：

```json
[
  "reports/BATCH-004.md",
  "reports/evidence/M00.0.05/logs/11-batch-end-pytest-both-suites.txt",
  "reports/evidence/M00.0.05/logs/12-batch-end-vitest-smoke.txt",
  "reports/evidence/M00.0.05/logs/13-batch-end-manifest-recompute.txt",
  "reports/evidence/M00.0.05/logs/14-batch-end-taskctl.txt",
  "reports/evidence/M00.0.05/final-scope.txt"
]
```

## 8. 仍需独立复核/后续处理的未知项

1. **验证入口的两个结构性限制**（.04 `evaluator_followups`）：kind=py 但 `test_paths` 混合 `.py`/`.test.ts` 的三张卡（M00.6.05、M04.1.01、M04.4.02）当前测试文件均不存在，待其开工前需架构负责人决定拆卡或按扩展名分流；本入口不提供全清单批跑总览，105 张 targeted_tests 卡的状态只能逐卡查询。
2. **.05 的无 runner 取舍**：生产入口保持 `services.control.app:app`（host/port 由 uvicorn CLI 决定）；`Settings.from_env()` 是环境驱动路径（启动脚本演示 `Settings → uvicorn.run(host/port/log_level)` 接线）。本卡未在 `app.py` 增加一行式本地启动器，若需要应由后续卡定义。
3. **严格枚举与 404 口径**：日志级别/环境/mode 不接受 `"INFO"` 这类大小写变体（非法即失败）；`redirect_slashes=False` 是本轮局部决定（`/health/` 直接 404 而非 307），二者都不冻结 C02 未来业务 API。
4. **mock 与真实的边界声明**：.04 的临时清单/临时仓库 fixture 是测试夹具，不属生产任务、不在正式清单中；.05 的 `asyncio.run` 直驱 ASGI 是进程内真实调用（非 mock），另有真实子进程 uvicorn 覆盖；`/health` 只表示本地进程响应，不冒充模型/数据库已连接或服务 ready。
5. **首轮失败已如实留档**：.05 单测首轮 75 项中 4 项失败（测试自身写法：嵌套 `_IncludedRouter` 未递归、host 空串断言），修正后 75/75，最终态见 .05 日志 04；.04 的 npm 路径笔误与混合扩展名卡也在其 `verification.txt` 的偏差段落中记录，未隐藏。
6. **范围检查口径**：按 PRUNE 排除生成目录（`.local-tools`、`.venv*`、`.uv-cache`、`node_modules`、`__pycache__` 等），只比对路径集合与基线哈希，不校验被排除目录的内容与归属；`.venv-repro` 与本批生成物不入清单。
7. **本批未触碰的既有遗留**：Electron 落地（BATCH-003 遗留）、Hermes 接入、M00.3.x live 卡、BATCH-002 §8 的 pydantic/Hermes 版本体系与 Langfuse 边界等，均未动、待架构裁决。

## 9. 停止

BATCH-004 到此停止：两卡报告 `submitted`（未 accepted），不执行 M00.3、Hermes 接入或任何批外任务，不自行标记 accepted。等待架构负责人对两卡（M00.0.04/M00.0.05）的统一独立复核。
