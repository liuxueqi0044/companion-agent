# BATCH-004-R2：只修 Vitest 同名 suite 的合法报告误判

## 接手入口

执行者：Codex GPT-6 Sol。本轮是实现者，独立验收由交接方执行，不自写 accepted。若是全新对话，从磁盘恢复，不依赖聊天历史。
唯一产品目录：C:\Users\xiayu\Documents\Codex\companion-agent。当前 cwd 不同时显式指定该目录；不另建仓库/worktree/产品副本。

依次读 AGENTS.md、本派工、reviews/BATCH-004-R1.md、reviews/M00.0.04.json，再读 tools/verify_task.py、tests/unit/test_verify_task.py 与必要的原任务卡 M00.0.04。
共用架构：docs/execution/common/ARCHITECTURE.md；模块架构：docs/execution/modules/M00.md；完整架构 docs/architecture/；原任务包 docs/execution/tasks/。按需读，禁止重新选型或全量重构。

## 状态与唯一目标

M00.0.05 已独立内容验收 accepted，代码/报告/manifest 全部只读；前置 .04 未通过，所以 taskctl 累计可解锁仍 9。原四个问题已修好，现在只剩 M00.0.04 的 B4R1-R1：合法同名 describe 组被误当损坏报告。

真实反例与原生报告：
- reviews/evidence/BATCH-004-R1/legitimate-suites.txt
- reviews/evidence/BATCH-004-R1/vitest-duplicate-direct.txt
- reviews/evidence/BATCH-004-R1/vitest-duplicate-report.json

反例为单文件两个 describe("group")，各含一个通过用例。原生 Vitest 5.0.1 exit=0、success=true、numTotalTestSuites=3、numPassedTestSuites=3、numTotalTests=2。两个 assertion ancestorTitles 都为 ["group"]；当前用 set(tuple(title path)) 得到 2 个 suite（含文件根），错误拒绝原生报告。

## 具体修订边界

1. 先用真实锁定 Vitest 在临时夹具重现，再改实现。suite 名称允许重复，扁平 JSON 没有足够唯一身份信息，不能将去重标题路径强制等同于实际 suite 数。不要靠限制用户必须给 describe 唯一名字来绕过。
2. 只依据报告真实可证明的信息作一致性判断：保留整数类型（拒绝 bool/浮点/字符串）、非负值、suite 汇总守恒、实际 assertion 状态/测试总数一致、success 与失败状态一致、预期文件精确集合。无法证明的 suite 身份/空组数量不要伪装为可精确推导；可使用有依据的界限，写清依据。保留 B4-R1 的收集前精确 include 与执行后文件集合校验，绝不能回退为字符串过滤。
3. 不要求重新设计整个 reporter 或增加包。优先最小修改现有 parser。若锁定 Vitest 的原生结构能提供必要信息，引用本地真实实现/输出；不要按想象造 JSON 字段。
4. 有针对性真实回归至少覆盖：两个同名兄弟 describe、普通不同名嵌套组、带空组的文件、正常一个组。对于空组等，按原生 runner 的实际状态处理，不能宣称与原生语义相反。继续验证失败用例、全 skipped/todo、部分通过部分跳过、缺失/损坏报告，以及原机器报告异常负例。
5. 原单元测试中“suite 总数比唯一标题路径多就一定损坏”的 fixture 断言本身源于错误假设，应基于真实反例修正；保留真正矛盾的负例（例如 suite 汇总不守恒、负数/布尔、用例总数不一致）。记录为什么改测试，不只是为了绿色移除校验。

## 允许写入

- tools/verify_task.py
- tests/unit/test_verify_task.py
- reports/M00.0.04.json 与 reports/M00.0.04.checkpoint.md
- reports/evidence/M00.0.04/ 下本卡检查、测试日志、manifest 等
- reports/BATCH-004-R2.md

其他全部只读，特别 M00.0.05 代码/报告/证据、服务三文件、tests/unit/test_control_app.py、vitest.config.ts、根依赖与锁、selected/ADR、reviews/、任务清单/helper、架构/契约、派工和历史基线/摘要。不得新增 JS 桥、安装依赖或更换 runner。

工具保持：.venv/Scripts/python.exe；固定 Node .local-tools/node-v24.21.0-win-x64/node.exe 与同目录 node_modules/npm/bin/npm-cli.js。只在子进程 PATH 前置 Node。禁止裸 python/npx latest、全局安装、安装器、修改系统/用户 PATH/profile/注册表或已安装 Agent。

当前单一 Codex 编码对话已授权；不启动子智能体/额外模型会话，不调用产品模型/账号/订阅，不做 Hermes，不部署/推送/发消息。评审反例允许只读使用；holdout 不可读，仍只核哈希。

## 验收与提交

针对性真实 Vitest 反例必须在修复后由验证器返回正确结果；未授权干扰文件仍不执行；不一致报告仍不得 passed。跑验证器完整单测及原 Vitest smoke；无服务修改，不需要重复全部服务启动测试。原 168 数量不是固定目标，新用例可增加；不得以减少测试或忽略失败冒充修复。

使用本批新基线 docs/handoff/BATCH-004-R2-BASELINE.json 和只读权威检查：
`.local-tools/python-3.13.15/python.exe docs/handoff/check_batch004_r2_scope.py`

报告 status=submitted，batch_id=BATCH-004-R2，dispatch_ref=docs/handoff/BATCH-004-R2.md，base_ref=新基线 snapshot_id；原 M00.0.04 规范哈希不变。原三文件成果 manifest（含本轮未改的 vitest.config.ts）保留准确范围，更新变化文件哈希并重建 result_ref。changed_files_this_round 只列本轮实际变化；累计 changed_files/dispatch_changed_files 延续原有合法分工，批次汇总单列 batch_level_changed_files。

逐个原 A01–A04 记录证据，单列 B4R1-R1 的修复、真实报告与解释；未解决阻塞留 unresolved。保留混合语言三卡未来分流的 evaluator_followup，不开启新编排实现。

最终顺序：真实测试与日志→manifest/report/checkpoint/批次摘要→scope 日志落盘后含自身复跑→result_ref 核对→taskctl validate 与 `next --repo .` 留档。独立验收前应仍为 M00.0.04 changes_requested、累计 9；.05 内容验收已过但前置不满足，不能修改 review 或 helper 强行计数。

这是短修订，不超过本卡范围。45 分钟检查点，同因两次失败/需扩权时记录最小阻塞。完成 submitted 后停止，等待交接方复核；不动 .05、不开展下一阶段。
