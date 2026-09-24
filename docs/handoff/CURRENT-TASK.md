# 当前修订 BATCH-002-R1：统一 Hermes 冻结身份

根目录：C:\Users\xiayu\Documents\Codex\companion-agent。

只继续当前 Claude Code 会话，不开子智能体或额外模型会话。M00.1.03、M00.2.01、M00.2.02 已独立 accepted，产物与报告只读。当前唯一开发卡为 M00.2.03 修订，原规范哈希不变。

## 必读

AGENTS.md、本文件、reviews/BATCH-002.md、reviews/M00.2.03.json、原 M00.2.03 卡、当前 selected-versions 与 ADR。架构与公共契约不变，不加载全部历史，不读取 holdout。

本轮基线为 docs/handoff/BATCH-002-R1-BASELINE.json。报告 batch_id=BATCH-002-R1、dispatch_ref=docs/handoff/CURRENT-TASK.md、base_ref=新基线 snapshot_id。

## 按顺序修订

1. **R1-01 唯一安装身份**：Hermes 选择官方源码 commit `d337b736aa1e8ebecfab043842d13e4a2d2f48a3`，该源码 pyproject 声明版本 `0.21.4`。install_source / version_kind / source_binding 必须一致；不得写成 PyPI 0.19.0 的源码绑定。旧 PyPI 项留未采用参考，不修改已 accepted 的 runtime-matrix；通过 deviations_from_matrix 记录新裁决。
2. **R1-02 相同来源约束**：使用该 commit 的 pyproject 更新 Hermes 约束证据与 C1/C5，至少核对 requires-python、pydantic、fastapi、uvicorn 的真实原文。Hermes 独立进程/venv；我方 API 环境不 import Hermes。extras/profile 留下一步验证，不把 core 元数据冒充全 extras 相容。修改检查器，使“0.19.0 + 0.21.4 commit”的负例被实际拒绝。
3. **R1-03 精确版本许可与记录**：给 TypeScript 6.0.3、npm 11.19.0 添加本卡的 license_binding（不用改 accepted 的许可表）。独立评审已取得正文，文件和请求元数据在 reviews/evidence/BATCH-002/ 下，允许只读复制到本卡 evidence 并计算哈希。正文分别与原登记字节相同，不必重复全网调研。
4. 更新 ADR、selected、manifest、检查器、自检日志、report、checkpoint。报告 changed_files 补上漏列的 final-scope-check-batch002.txt，并说明该日志为上一轮已有文件、本轮未改；本轮实际变化另列便于范围核对。归档 reports/BATCH-002.md 保持不变，新增 reports/BATCH-002-R1.md。

## 范围

只可写：

- docs/dependencies/selected-versions.json
- docs/decisions/ADR-001-dependencies.md
- reports/M00.2.03.json 与 reports/M00.2.03.checkpoint.md
- reports/evidence/M00.2.03/ 下本卡证据和检查器
- reports/BATCH-002-R1.md

reviews/、派工/根配置、其他三卡的报告与产物、holdout、原任务包、公共契约均只读。不安装或升级任何运行环境/依赖，不生成锁文件，不启动 Agent，不调用模型或测试订阅。

## 自检与验收

- 现有 selected 检查继续保留真实版本/证据/交集断言，并按裁决更新；不能仅改文字断言以掩盖不一致。
- 独立验证源码 project.version 与 selected 版本一致、source URL/commit 一致，旧 PyPI 仅 reference；做内存深拷贝负例。
- 根据新基线核对本轮写集。旧两批范围脚本本来就会把评审与派工新增视为变化，不再拿它们作为本轮门槛；可在本卡 evidence 写一个只读的新范围检查。
- `taskctl.py validate`；不修改 helper。next 应仍停在 M00.2.03 的 changes_requested，直到独立复核。
- E1/E2 按裁决关闭；E3、真实安装、vue-tsc 等未来工作保留在 evaluator_followups/unknowns。真正未解决的本卡阻塞仍放 unresolved，不以清空字段伪装完成。
- submitted 仍不是 accepted。一次性完成这些修订后停止，不展开 M00.3 或新的架构调研。

预期是一轮短修订；同因两次失败则记录准确阻塞与下一步。无需重做已经通过的三张卡。
