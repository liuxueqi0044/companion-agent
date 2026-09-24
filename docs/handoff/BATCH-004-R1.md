# BATCH-004-R1：新 Codex GPT-6 Sol 对话接手修订

## 0. 新会话必须知道的事实

你在用户手动创建的全新 Codex GPT-6 Sol 对话里接手，担任本批开发实现者。不要假定已有任何聊天记忆；磁盘文件是工作依据。独立架构复核由交接方随后完成，你不能给自己的工作写 accepted。当前 Codex 编码对话已经获得授权；禁止的是额外 Agent 会话、子智能体、Agent Teams 或产品的模型/账户调用，不是要求停止当前编码。

项目是桌面 AI 工作伙伴：Hermes 单一主控/记忆，官方 Agent 为可替换执行器，Vue/Electron 前端、FastAPI 服务端。目前只完成工程骨架与样例/依赖基线，Agent 接入尚未执行。本轮只是验证器与设置接线的短修订。

**唯一产品目录**：C:\Users\xiayu\Documents\Codex\companion-agent
不要在 Codex 新会话默认生成目录另建产品，也不要复制第二份仓库。优先将新会话工作目录指向上述现有目录；若会话 cwd 不同，所有命令显式使用该目录。不要创建 worktree、执行 git init/reset、覆盖他人改动或自动发起新对话。

## 1. 最小阅读顺序与状态

1. 根 AGENTS.md 与本派工 docs/handoff/BATCH-004-R1.md。
2. reviews/BATCH-004.md、reviews/M00.0.04.json、reviews/M00.0.05.json。
3. docs/execution/common/ARCHITECTURE.md、docs/execution/modules/M00.md；按原卡需要读取 contracts/C01–C04。
4. docs/execution/tasks/M00.0.04.md、M00.0.05.md；当前 tools/verify_task.py、服务三文件与两组 tests/unit 测试。
5. 只读相关 reports/M00.0.04.json、M00.0.05.json 和 checkpoint；它们是旧提交，不是通过证明。反例位于 reviews/evidence/BATCH-004/，本次明确允许读这些反例用于修复（holdout 仍不可读）。

当前累计 9 卡 accepted；M00.0.04 与 M00.0.05 均 changes_requested。BATCH-004 已结束，此 R1 为当前唯一有效派工。CURRENT-TASK.md、BATCH-003.md、BATCH-004.md、旧基线均为历史证据，不覆盖。

原架构全景位置 docs/architecture/01-architecture.md 等，需要时读取，不必全量加载。不要因换模型重新选框架、重新调研依赖或重做前 9 卡。E1/E2（Hermes 隔离进程/venv 与唯一源码版本）已经裁定，保留原决定。

## 2. 四项修订，按顺序完成

### R1-01 精确限制 Vitest 执行文件（B4-R1）

独立反例：task.test_paths 只允许 tests/unit/allowed.test.ts；仓库同时存在 tests/unit/allowed.test.ts.extra.test.ts。现有实现位置过滤导致两个文件都运行，后者顶层写出 UNLISTED_EXECUTED.txt，验证器仍 passed。

要求：在测试收集和模块执行前就把文件集合限于已经规范化/resolve/校验过的精确白名单。复用锁定 Vitest 的现成配置/程序接口能力，先查本地锁定版本代码/类型/CLI 帮助；不要凭印象编造参数。仍通过受控固定 argv 与 shell=False 运行，不能开放任意配置/命令入口给 CLI 用户。

原派工的 npm CLI 固定数组形态可为精确选择做必要内部调整，例如受控临时配置；这不是开放任意 runner。优先在 tools/verify_task.py 中生成受控临时配置，若确需持久 JS 桥，额外授权唯一文件 tools/verify_vitest.mjs，归 .04，须明确其输入校验和用途；不新增包、改版本或根 npm scripts。

保留相邻同名前缀/嵌套目录干扰项真实测试：未授权文件放顶层副作用写标记（本地临时夹具），验证后标记必须不存在；不是“多跑后把状态改 failed”。再核对实际报告内的运行文件集合与预期一致，作为第二道校验。检查文件名的 glob 元字符，拒绝或安全处理，不能因临时 include 重新变成通配范围。pytest 的精确路径行为保持。

### R1-02 不支持的扩展名必须整体关闭执行（B4-R2）

当前 _select_test_files 按 kind 的后缀过滤，静默丢弃另一语言，缺 TS 仍 passed。已存在三张混合路径正式卡，不属于假设。

**本轮裁决：fail-closed，不新增多 runner 编排。** 对自动任务先校验其完整 test_paths；只要有不受该 kind runner 支持的扩展名/混合类型，在任何子进程前返回明确 not_run（exit 3，reason=unsupported_test_types 或同义）。unknown/非法路径仍拒绝。--test 不能绕开这个清单级检查。不要更改原清单或拆卡。已支持的同类型任务仍保持：默认全部文件必须存在、明确 --test 只跑合法子集；缺失/零测试/全跳过不能通过。

给 M00.6.05、M04.1.01、M04.4.02 留明确 evaluator_followup：首次真正执行前另行补混合语言分流；当前不会把部分测试冒充整任务检查完成。

### R1-03 机器报告的结构和数值必须自洽（B4-R3）

独立反例在 inconsistent-junit.txt：没有任何 testcase，却声明 tests=2、skipped=-1，输出 3 passed 并成功。检查 parser 不能只对聚合属性 int() 后相减。

pytest/JUnit 与 Vitest JSON 均须严格检查非负整数（拒绝 bool、负值、非整数）、统计守恒、用例与 suite/汇总一致、必需结构存在；只认当前支持的实际报告格式，未知/损坏/矛盾返回明确错误，绝不 passed。pytest 不得用凭空 suite tests 代替 testcase；兼容真实 pytest 产生的收集错误、跳过记录，不能因计数方式导致真实失败被误判成功。Vitest 同样对真实用例状态与报告汇总核对。

回归至少覆盖：两个现有 runner 的真实报告正例；负数/非整数/布尔计数；无用例却宣称通过；总数不一致；截断报告；实际失败；零测试；全 skipped/todo；部分通过部分跳过的既有正确行为。诊断可解释，不能为了通过测试修改报告预期掩盖真实格式。

### R1-04 默认服务入口接上环境读取（B4-R4）

create_app(settings=None) 默认使用 Settings.from_env()；显式传入 Settings 仍优先，模块导出的 app 使用同一路径。不得只在测试专用启动脚本接线。

用全新子进程验证有效环境变量被默认工厂和模块 app 采用；非法 COMPANION_PORT/ENVIRONMENT/LOG_LEVEL 等明确失败，不能静默默认；显式注入的设置优先。测试子进程只注入人工哨兵，不输出本机凭据或整个环境。保留无任何设置/无密钥启动，以及新进程导入前拦截 socket 时无连接/监听/DNS。原 /health 200、未知路径和 docs 404 全部回归。

这项只修默认应用设置；标准 uvicorn CLI 的监听地址/端口仍由其参数控制，不声称 COMPANION_PORT 自动覆盖 uvicorn CLI；无须新增启动器。不要改 API 响应或业务路由。

## 3. 写权限与工具

只可改：
- tools/verify_task.py、tests/unit/test_verify_task.py；必要时新增 tools/verify_vitest.mjs（归 .04 的 dispatch_changed_files）。
- services/control/app.py、tests/unit/test_control_app.py；settings.py 只有完成默认接线确有必要时可小改，不改接口/默认值/许可边界；routes.py 只读。
- reports/M00.0.04.json、M00.0.05.json 及对应 checkpoint/evidence；批次汇总 reports/BATCH-004-R1.md。

禁止改 pyproject/uv.lock/requirements-dev、Node 依赖/锁、vitest.config、selected/ADR、旧报告摘要 BATCH-004.md、根规则/派工/架构/契约/microtasks/taskctl、reviews/、holdout 或其他 accepted 产物。评审证据只读；在本卡 evidence 中可记录引用及自己的复现日志。

明确工具路径：
- 产品测试 `.venv/Scripts/python.exe`（Python 3.13.15，已有全部依赖）。
- `.local-tools/node-v24.21.0-win-x64/node.exe` 与其 `node_modules/npm/bin/npm-cli.js`，进程内 PATH 前置冻结 Node；禁止裸 python（可能属于用户 Hermes）及 npx latest。
- 权威检查使用 `.local-tools/python-3.13.15/python.exe docs/handoff/check_batch004_r1_scope.py`，基线 docs/handoff/BATCH-004-R1-BASELINE.json，均只读。

不需要安装或升级工具/包。禁止安装器、全局安装、系统/用户 PATH/profile/注册表修改；不自动卸载之前 Python 用户级注册。测试只在临时夹具、本仓库和 127.0.0.1 使用；不联网探测模型或外部服务。

## 4. 新会话的工作与交接方式

先检查 report/checkpoint/基线与现状，确认没有别人新改动；不要从零重写已工作的实现，聚焦四个问题。先复现再修复，每项用有针对性的回归证明。两卡允许串行自检无阻塞后继续，批末统一提交，独立验收仍由交接方执行。

45 分钟记录检查点；同因两次失败、超原边界或单卡超 90 分钟仍无可验收结果，保留工作和准确阻塞停止，不扩大到新架构。自动上下文压缩后从本派工和检查点恢复；不要另开模型对话。

报告保留原规范哈希；batch_id=BATCH-004-R1、dispatch_ref=docs/handoff/BATCH-004-R1.md、base_ref=本批基线 snapshot_id；status=submitted，绝不写 accepted。

result_ref 绑定最终 manifest；.04 如果新增 JS 桥也要入 manifest/dispatch_changed_files。changed_files_this_round 精确记录本轮改动，累计 changed_files 保留原卡写集与本卡 evidence；本轮额外桥文件独立 dispatch_changed_files，批次摘要独立 batch_level_changed_files。旧 report 原字节已在 reviews/history/BATCH-004/submitted/，不要重写归档。

按原 A01–A04/A01–A03 分别给证据，并附四个 B4-R1…R4 的修复说明、命令/退出码/日志、限制和未来事项。原 130 测试全部通过只能证明回归，必须同时证明独立反例已被拒绝/正确处理。未解决阻塞如实 unresolved；混合语言执行的后续扩展写 evaluator_followups，不能删掉所有测试路径来“修复”。

收尾先跑两组 Python 单测和必要真实 Vitest/本机服务回归，最后生成报告/manifest/checkpoint/批次摘要。scope 日志落盘后复跑包含自身，核对 manifest/result_ref，taskctl validate/next 留档。独立复核之前 next 应仍为 M00.0.04 changes_requested、accepted=9，不为推进状态篡改 helper/reviews。

提交完成后停止，不开展 M00.3/Hermes 或其他批外任务。下一步等架构负责人独立复核。
