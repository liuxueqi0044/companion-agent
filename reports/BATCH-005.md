# BATCH-005 · Hermes 生命周期接入准备

状态：**submitted，等待交接方独立复核**。本批仅 M00.3.01 的离线准备，原 A01–A03 均 **not_run**；累计 accepted 应保持 11。

- 产品目录：C:\Users\xiayu\Documents\Codex\companion-agent
- 派工：docs/handoff/BATCH-005.md
- 基线：sha256:135773813e7d5b93b20bc9f77a5107f50b1883a4a17cff0d39b7466b763bd96f
- 本卡 result_ref：manifest-sha256:c32eed7883dbf6c915258fbc2124b82789af4fef04fafca59d34faf693d54c96
- batch_level_changed_files：reports/BATCH-005.md。其他改动详见 reports/M00.3.01.json 的 changed_files；范围检查日志留在本卡 evidence。

## 已完成的准备

固定 NousResearch/hermes-agent commit d337b736aa1e8ebecfab043842d13e4a2d2f48a3（源码 0.21.4），复用已核 pyproject，读取必要官方源码与目录索引，逐文件 URL/sha256/字节数见 reports/evidence/M00.3.01/upstream/source-index.json。能力映射、原生符号/行号、缺口和下一段操作单见 docs/evidence/hermes-lifecycle.json。

只读 tests/spikes/hermes_lifecycle.py 提供默认 --preflight、--plan、--help。preflight 校验 11 个关键文件及两个 evidence 临时 home 路径；plan 仅打印固定 JSON。即使预检通过，integration_status=not_run、live_verified=false、runtime_state/cost_usd=null。CLI 核心 profile、不加 extras；未来安装仅限单独 venv，尚未执行。

## 检查与限制

正常预检和计划均 exit 0；损坏源文件、缺文件、路径逃逸、重叠 home、未知模式以及无网络/进程副作用有 13 项离线回归，见 reports/evidence/M00.3.01/logs/03-regressions.txt。实际越界路径和未知模式均 exit 2，结构化原因见 04/05 日志。

未安装或运行 Hermes，未调用模型/账号，未读取真实凭据。原卡 A01 取消请求与真实退出、A02 断连后查询同一 run、A03 真实未知状态均未执行；源码分析和预检不构成 live 验收。稳定 NativeRunRef、准确 per-run 状态、取消回执、Windows 信号语义及断连/重启恢复均需下一段验证。下一次试验还须先确认只读工具限制、具体凭据类别和美元硬预算上限；最大重试 0，只结束试验自身 PID。

最终范围检查 exit 0、outside=[]、PASS；manifest/来源 hash 与字节数复算通过。taskctl validate exit 0，next --repo . 显示 M00.3.01 为 submitted、accepted=11。日志见 reports/evidence/M00.3.01/logs/07-final-scope.txt、08-hash-check.txt、09-taskctl-validate.txt、10-taskctl-next.txt。本批提交后停止，不自写 accepted，不开展 M00.3.02/.03。
