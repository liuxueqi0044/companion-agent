# BATCH-002-R1 修订摘要

派工来源：`docs/handoff/CURRENT-TASK.md`（batch_id=BATCH-002-R1）；基线快照 `sha256:950d5733baf3c6ef47f41e17a9d111c1addd3a620c61a0c5d0b32124989f960d`（`docs/handoff/BATCH-002-R1-BASELINE.json`，480 条目）。本轮只修订 **M00.2.03**（本卡第 4 项，任务规范哈希不变 `bb69b5af…`）：统一 Hermes 冻结身份、按同源证据更新约束、补精确许可证绑定。M00.1.03/M00.2.01/M00.2.02 已独立 accepted，其报告与产物本轮只读未动；`reports/BATCH-002.md`（上一轮批次汇总）保持归档不变。本卡报告为 `submitted`，**未 accepted**——submitted ≠ accepted。工作区不是 Git 仓库，所有哈希均为文件内容哈希。

## 1. 状态

| 卡 | 状态 | 产物 | 报告 / 证据 |
| --- | --- | --- | --- |
| M00.2.03（BATCH-002-R1 修订） | submitted | `docs/decisions/ADR-001-dependencies.md`、`docs/dependencies/selected-versions.json` | `reports/M00.2.03.json`（`manifest-sha256:30c49601…`）；自检 `reports/evidence/M00.2.03/verification-r1.txt` |

`reports/M00.2.03.json` 的 `batch_id=BATCH-002-R1`、`dispatch_ref=docs/handoff/CURRENT-TASK.md`、`base_ref=新基线 snapshot_id`、`result_ref` 为新 manifest 哈希。

## 2. 产物与哈希（R1 修订后实测）

| # | 文件 | sha256 |
| --- | --- | --- |
| 1 | `docs/decisions/ADR-001-dependencies.md` | `a2e00db2a57253202f2665b5a3b793c0538b58f4bf3778c4f24785438ecc6b9b` |
| 2 | `docs/dependencies/selected-versions.json` | `58f5a2bf75fd5336492c7ba445fdbd451c54ef041c8c2e56c50c1af91a88d49c` |

清单归属：#1–2 见 `reports/evidence/M00.2.03/artifact-manifest.json`（`sha256=30c49601e56821f7a1514820b8aa8ecf5d1610ff84fe6622224af91fd81d7e34`，即 `result_ref`）。`holdout.json` 未改：`cfde4a5ddcaeb6b6c814ee6e9bc61a5ea9358528e9aa632e307ca81e272a93d6`（只核对哈希，未读内容）。

## 3. 本轮修订内容

- **R1-01 唯一安装身份**：Hermes 唯一安装来源=既有不可变源码 commit `d337b736aa1e8ebecfab043842d13e4a2d2f48a3`（其 pyproject 声明 version=0.21.4，tag v2026.9.21），`version_kind=source_commit_with_declared_version`，install_source / version_kind / source_binding 三者一致；PyPI 0.19.0 降为未采用参考（deferred `hermes-pypi-0.19.0`，category=not_adopted），不再是第二安装路线。与矩阵偏离由 3 处增至 4 处（hermes-agent 居首），记录于 `deviations_from_matrix`；`runtime-matrix.json` 未改（保持 M00.2.01 提交态）。
- **R1-02 相同来源约束**：C1/C5 换用该 commit 的 pyproject 原文（`hermes-pinned-pyproject.toml`，tomllib 解析）：requires-python `>=3.11,<3.14`、pydantic==2.13.4、fastapi>=0.104.0,<1、uvicorn>=0.31.0,<1（core、无 [standard]）。pydantic 冲突按 D5/E1 裁决分进程/venv；extras/profile 明确留 M00.3.01，不冒充全 extras 相容。检查器新增 §G 源码身份规则，负例实际拒绝 B2-R1 原形（"0.19.0 版本 + 0.21.4 commit"，F-tamper-5）与 PyPI 主体 install_source（F-tamper-6）。
- **R1-03 精确版本许可绑定**：TypeScript 6.0.3 与 npm 11.19.0 增加本卡 `license_binding`；正文自评审证据只读复制（7 个文件与 `reviews/evidence/BATCH-002/` 原件 cmp 逐字节相同；两份许可正文与已 accepted 的 M00.2.02 登记正文逐字节相同）；accepted 许可登记表未改。
- **R1-04 记录与范围**：ADR / selected / manifest / 检查器 / 自检日志 / 报告 / checkpoint 全部更新；报告 `changed_files` 补上上一轮漏列的 `final-scope-check-batch002.txt`（说明：上一轮已有文件、本轮未改），本轮实际变化的 17 个文件另列于 `changed_files_this_round`；新增 `reports/BATCH-002-R1.md`（本文件）。
- **裁决落实**：E1（pydantic 环境划分）与 E2（Hermes 版本号体系）按架构裁决关闭，裁决文本记录在 selected 的 escalations 与 ADR 第 8 节；E3、真实安装、extras/profile、vue-tsc 保留在 evaluator_followups/unknowns；真正未解决的阻塞仍留在 unresolved。

## 4. 关键自检结果与命令（原始输出：`reports/evidence/M00.2.03/verification-r1.txt`）

| 命令（argv） | 退出码 | 结果 |
| --- | --- | --- |
| `python reports/evidence/M00.2.03/check_selected_versions.py` | 0 | `total=35 failed=0`（新增 C-4/C-5/§G/D-6 改读源码 pyproject；9 条负例） |
| `python reports/evidence/M00.2.03/check_write_scope_batch002_r1.py` | 0 | 新基线只读范围检查（480 条目）；诊断 PASS MODIFIED 4 / ADDED 9 / MISSING 0；收尾复跑见第 5 节 |
| `cmp` 7 个复制证据 vs 评审原件 | 0 | 全部 identical；两份许可正文 vs accepted 登记 identical |
| `python`（tomllib）解析 `hermes-pinned-pyproject.toml` | 0 | version=0.21.4；requires-python `>=3.11,<3.14`；pydantic==2.13.4；fastapi>=0.104.0,<1；uvicorn>=0.31.0,<1 |
| `sha256sum` 产物与 manifest | 0 | 与第 2 节一致；manifest 内部两条目复算 OK |
| `python docs/execution/taskctl.py validate` | 0 | `{"valid": true, "tasks": 156, "first": "M00.1.01"}` |
| `python docs/execution/taskctl.py next --reports-dir reports --reviews-dir reviews` | 0 | `{"task_id": "M00.2.03", "state": "changes_requested", "accepted": 5, "action": "review_or_resume_existing_work"}`——next 仍停在 M00.2.03，符合预期 |
| `python reports/evidence/M00.1.01/check_baseline.py` | **1** | 沿用上一轮定案的代际构造性 FAIL（182 项 OUT-OF-SCOPE；原始输出未改、本轮未重跑），非产品回归 |

## 5. 收尾写集检查（本轮新基线）

`python reports/evidence/M00.2.03/check_write_scope_batch002_r1.py` → **PASS（MODIFIED 6 / ADDED 11 / MISSING 0，exit=0）**，在本摘要等全部文件落盘后复跑；完整原始输出：`reports/evidence/M00.2.03/final-scope-check-batch002-r1.txt`（该文件本身在比对之后落盘故不在自身列表内）。基线 `docs/handoff/BATCH-002-R1-BASELINE.json`（480 条目，`snapshot_id=sha256:950d5733…`）与报告 `base_ref` 一致。变化列表全部落在本轮允许写集内：MODIFIED 6（ADR、selected、manifest、检查器、报告、checkpoint）；ADDED 11（新基线自身、范围检查器、7 个评审证据副本、verification-r1.txt、本摘要）；不含 `reviews/`、`AGENTS.md`、`CLAUDE.md`、`docs/execution/`、其他卡产物与 `holdout.json`。旧两批范围脚本按各自旧基线会把评审/派工新增视为变化（构造性），按 CURRENT-TASK.md 不再作为本轮门槛；本轮未修改任何旧脚本或 helper。

## 6. 仍需独立复核/后续处理的未知项

1. **Hermes extras/profile 相容性**：本卡只核对 core 元数据；web extra 自钉 fastapi==0.133.1 / uvicorn==0.41.0，采用任何 extras 前须补证（M00.3.01）。
2. **Hermes 两版本差异清单**（PyPI 0.19.0 vs 源码 0.21.4 的依赖/功能差异）未逐项核对，供 M00.3.01 对照；冻结身份已定为源码 commit。
3. **E3 Langfuse 核心/ee 边界**：留部署卡。
4. **真实安装/端到端**未验证（`integration_evidence_kind=not_run`）；uv.lock / package-lock.json 必须由 M00.0.01/M00.0.02 真实安装生成；裸机 Windows 上 venv/npm 的可用性未验证；vue-tsc 等 SFC 工具未登记。
5. **check_baseline.py 代际 FAIL**：构造性结果，已留证；是否在归档时补一代同类检查器由复核决定。
6. 与矩阵的四处偏离已双向记录；runtime-matrix.json 保持 M00.2.01 提交态，如需完全同步请复核指定执行卡。

## 7. 停止

BATCH-002-R1 到此停止：本卡 submitted，等待架构负责人独立复核（next 实测仍停在 M00.2.03 的 changes_requested）；不执行 M00.3 或批外任务，不自行标记 accepted。
