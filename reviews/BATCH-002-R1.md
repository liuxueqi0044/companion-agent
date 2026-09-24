# BATCH-002-R1 独立复核

结论：**M00.2.03 accepted，BATCH-002 全部收口。当前累计 6 张卡 accepted。**

## 实质验收

- M00.2.03-A01 通过：Hermes 唯一安装身份为源码 commit `d337b736aa1e8ebecfab043842d13e4a2d2f48a3`，该源码声明版本 `0.21.4`；PyPI 0.19.0 仅为未采用参考。同源 Python、pydantic、fastapi、uvicorn 约束已核对，B2-R1 关闭。
- M00.2.03-A02 通过：Hermes 唯一主控与记忆，Codex/Claude Code 为可替换执行器；人工检查组件和环境分组，未新增第二主控或记忆框架。
- 复跑开发者检查 35/35；独立复算 67 处证据引用、7 份副本与评审原件、2 个精确版本许可绑定及交付 manifest；直接验证错误版本负例被拒绝。
- 独立写集为 MODIFIED 6 / ADDED 11 / MISSING 0 / OUTSIDE 0，与报告本轮 17 文件完全一致。作者脚本复跑 ADDED 12 包含基线自身；原收尾日志是在自身落盘前计数，差异可解释。
- 之前 accepted 的产物、规则和 holdout 在提交边界均未变化；本轮架构师追加的评审文件不归责于开发者。

## 报告整理（由架构师完成）

没有再发一轮开发返工。原报告与提交文件已归档到 `reviews/history/BATCH-002-R1/submitted/`，保留原哈希。

1. 原 unresolved 的三项分别是旧基线代际差异、Langfuse 后续部署事项、真实安装/工具链未知项。逐项关闭或后置，保留原文、责任阶段与裁定，避免被 taskctl 当作本卡未决阻塞。没有宣称这些后续工作已经完成。
2. 派工允许的批次汇总从单卡 changed_files 移到 batch_level_changed_files；本轮完整 17 文件列表保持原样。没有放宽任务规范或修改 taskctl。
3. 纠正 A02 关于检查器能力的表述：检查器只验证条目的环境 ID，并不自动判断唯一主控；该项由架构师直接审查。

两个业务产物和 manifest 完全未改。报告继续为 submitted，accepted 只写在独立 review，review 绑定整理后的 report 哈希。

## 状态与下一步

`taskctl.py validate` 通过；`next` 实测 accepted=6，下一候选为 **M00.0.01（建立 Python 最小开发环境）**。

本次只完成复核，未启动下一批。下一阶段应进入真实工程骨架、依赖安装与构建验证；不是继续重做候选调研，也不应跳到尚缺环境前置条件的 M00.3。

Hermes extras/profile、真实安装与端到端、vue-tsc 登记、Electron 内置运行时、Langfuse ee 边界仍按对应后续卡验证。此处 accepted 是文档/冻结方案验收，不等于产品已能运行。

注意：selected 的 inputs.dispatch 绑定当前派工文件哈希。下一批更新派工前，应将历史派工与此证据引用一同做有记录的迁移，避免活文件覆盖造成历史证据哈希失配；本次未改 CURRENT-TASK.md。

审计：`reviews/evidence/BATCH-002-R1/audit.json`；记录裁定：`record-reconciliation.json`；权威状态：`reviews/M00.2.03.json`。
