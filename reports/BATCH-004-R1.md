# BATCH-004-R1 · 两卡修订提交

状态：**submitted，等待交接方独立复核**。当前累计 9 卡 accepted；本批不写 reviews/，不自行判定 accepted。

- 唯一产品目录：C:\Users\xiayu\Documents\Codex\companion-agent
- 派工：docs/handoff/BATCH-004-R1.md
- 基线：sha256:9afbbb2389076ffd57867c0f61cd7b5d54d803e1b6940a7e81f1114599f4831d
- M00.0.04 result_ref：manifest-sha256:b8aa17fd6d874425bdf99789db91c4cb09a2b3a4dba077ee80bcde0a474d7e75
- M00.0.05 result_ref：manifest-sha256:354fa4e619226eb29a4e5aed5c0a3fa152275c05553ec265f4b32c252980bbd7

## 修订结果

| 复核反例 | 本轮修复 | 主要证据 |
| --- | --- | --- |
| B4-R1 | Vitest 5.0.1 由临时配置的精确 include 在收集前限制白名单，拒绝 glob 元字符；报告文件集合再精确核对。相邻同名前缀和嵌套未授权文件的顶层标记均未出现。 | reports/evidence/M00.0.04/logs/R1-counterexamples.txt |
| B4-R2 | 自动任务若声明混合/不支持扩展名，整卡在任何 runner 前 exit 3/not_run/unsupported_test_types；--test 不能绕过。三张正式混合卡均覆盖。 | reports/evidence/M00.0.04/logs/R1-mixed-cli.txt |
| B4-R3 | pytest XML 与 Vitest JSON 的必需结构、非负整数、suite/用例/汇总守恒及状态一致性均校验；损坏报告不能 passed。真实失败、零测试、跳过、部分通过仍回归。 | reports/evidence/M00.0.04/logs/R1-counterexamples.txt |
| B4-R4 | create_app() 默认调用 Settings.from_env()，模块 app 走同一路径，显式 Settings 注入优先；新进程有效/非法环境、无网络导入、真实本机 HTTP 均验证。 | reports/evidence/M00.0.05/logs/R1-settings-and-smoke.txt |

## 实际命令与结果

- .venv/Scripts/python.exe -m pytest tests/unit/test_verify_task.py -p no:cacheprovider -q → exit 0，88 passed；日志 reports/evidence/M00.0.04/logs/R1-pytest-verifier.txt。
- 同文件 -vv -k 针对性反例 → exit 0，30 passed；日志 reports/evidence/M00.0.04/logs/R1-counterexamples.txt。
- 冻结 Node/npm 的原 Vitest smoke → exit 0，2 files / 6 tests；日志 reports/evidence/M00.0.04/logs/R1-vitest-smoke.txt。
- .venv/Scripts/python.exe tools/verify_task.py --task M00.6.05 → exit 3、not_run、executed=false；日志 reports/evidence/M00.0.04/logs/R1-mixed-cli.txt。
- .venv/Scripts/python.exe -m pytest tests/unit/test_control_app.py -p no:cacheprovider -q -s -k 'fresh_process or explicit_settings or network_free or real_uvicorn' → exit 0，7 passed；日志 reports/evidence/M00.0.05/logs/R1-settings-and-smoke.txt。
- 两组完整 Python 单测 → exit 0，168 passed；日志 reports/evidence/M00.0.05/logs/R1-pytest-batch.txt。
- taskctl.py validate → exit 0；taskctl.py next --repo . → exit 0，M00.0.04 changes_requested、accepted=9；日志 reports/evidence/M00.0.05/logs/R1-taskctl.txt。一次不带 --repo 的 next 默认从 docs/execution 查状态，显示 accepted=0；已按工具源码确认默认目录并用 --repo . 重跑，日志保留原始结果。

## 写集与范围

M00.0.04 本轮改 tools/verify_task.py、tests/unit/test_verify_task.py、同卡报告/检查点/manifest/verification 与四份 R1 日志。M00.0.05 本轮改 services/control/app.py、tests/unit/test_control_app.py、同卡报告/检查点/manifest/verification 与四份 R1 日志。各卡 JSON 的 changed_files_this_round 是精确明细；changed_files 仅保留原卡写集与专属 evidence，额外授权文件由 dispatch_changed_files 记录；本批没有新增 JS 桥，也未改 settings.py、routes.py、依赖或锁文件。

batch_level_changed_files：
- reports/BATCH-004-R1.md（本摘要）。

权威范围检查：.local-tools/python-3.13.15/python.exe docs/handoff/check_batch004_r1_scope.py；最终含范围日志自身的输出见 reports/evidence/M00.0.05/logs/R1-final-scope.txt。基线无预先差异（修改前 modified=0、added=0、missing=0、outside=[]）；两次运行均 exit 0；最终 modified=12、added=9、missing=0、outside=[]、PASS，且日志自身已在 added 集合。

## 限制和后续

M00.6.05、M04.1.01、M04.4.02 首次真正执行前需要另行补混合语言分流；当前故意整卡 not_run，不声称部分测试通过就是整卡通过。标准 uvicorn CLI 的 host/port 仍由 CLI 参数决定，COMPANION_PORT 现已进入 app.state.settings，不自动覆盖 CLI 监听参数。

两卡 status 均 submitted；无未解决阻塞。下一步仅由交接方独立复核。本轮不开展 Hermes 接入、批外任务或模型/账户调用。
