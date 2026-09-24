# BATCH-001 交接摘要

派工来源：`docs/handoff/CURRENT-TASK.md`（batch_id=BATCH-001）；基线快照 `sha256:bae549c2e16c904fec61aec504f138451bf7e250eb962668eb9781930e4bfc99`（229 文件）。本批按 §1 的连续派工授权一次交付，三卡报告均为 `submitted`，**均未 accepted**——只有独立验收者能给 accepted。本批无 Git 提交（工作区不是 Git 仓库），任何哈希均为文件内容哈希。

## 1. 三卡状态

| 卡 | 状态 | 产物 | 报告 / 证据 |
| --- | --- | --- | --- |
| M00.1.01（修正 r2） | submitted | `docs/product/first-flow.md` | `reports/M00.1.01.json`（`file-sha256:d809480f…`）；r1 存档于 `reviews/history/M00.1.01/r1/`，本报告含修订说明 |
| M00.1.02 | submitted | `normal.json`、`missing.json`、`expected.json` | `reports/M00.1.02.json`（`manifest-sha256:da096df3…`）；自检 `reports/evidence/M00.1.02/` |
| M00.1.03 | submitted | `correction.json`、`holdout.json`、`acceptance.md` | `reports/M00.1.03.json`（`manifest-sha256:781b5bdb…`）；自检与收尾复跑 `reports/evidence/M00.1.03/` |

三卡各自 `reports/M00.1.0N.checkpoint.md` 已随卡保存，含下一步与禁止重复动作。批内回改一处：`reports/M00.1.02.json` 的一条 `evaluator_followups` 表述更新（注明“混合币种不相加”缺口已由 M00.1.03 的 reuse_case 覆盖），归原卡报告，未动其产物与 `result_ref`。

## 2. 七个产物与哈希（sha256，收尾实测）

| # | 文件 | sha256 |
| --- | --- | --- |
| 1 | `docs/product/first-flow.md` | `d809480ff49b633ad75c60968474f2a26c2e8566ba5e2647b58daff5812c3caf` |
| 2 | `tests/fixtures/first-flow/normal.json` | `b56b4fdf09c3d43639c34b24fd48425210b7601db380171c7a21c5058ad86b0d` |
| 3 | `tests/fixtures/first-flow/missing.json` | `d393a63de1e0badc92bcebdff853804eef0b1dea117402201139224ad456b2c1` |
| 4 | `tests/fixtures/first-flow/expected.json` | `8eb38a6c15582ebb9029bf5cb7abfa0269b3a4b7c959a1bc3f4464659d75ccbc` |
| 5 | `tests/fixtures/first-flow/correction.json` | `7a29d5db38ed1acf0389abd27c31f247769649704b06f25363c31626760761be` |
| 6 | `tests/fixtures/first-flow/holdout.json` | `cfde4a5ddcaeb6b6c814ee6e9bc61a5ea9358528e9aa632e307ca81e272a93d6` |
| 7 | `docs/product/acceptance.md` | `b0260b559a8b1320d39a107ba8c17cb4474e4f2c1b7eaf079a8bd5c2327717fd` |

清单归属：#2–4 见 `reports/evidence/M00.1.02/artifact-manifest.json`（`da096df3…`）；#5–7 见 `reports/evidence/M00.1.03/artifact-manifest.json`（`781b5bdb…`）；#1 由 `reports/M00.1.01.json` 的 `result_ref` 单文件引用。

## 3. 关键自检结果与命令（原始输出：`reports/evidence/M00.1.03/final-batch-check.txt`）

| 命令（argv） | 退出码 | 结果 |
| --- | --- | --- |
| `python reports/evidence/M00.1.01/check_baseline.py` | 0 | MODIFIED 4、MISSING 0、ADDED 20，全部 ok-in-scope；RESULT: PASS |
| `python reports/evidence/M00.1.02/check_fixtures.py` | 0 | total=60 failed=0 |
| `python reports/evidence/M00.1.03/check_correction.py` | 0 | total=83 failed=0 |
| `python docs/execution/taskctl.py validate` | 0 | `{"valid": true, "tasks": 156, "first": "M00.1.01"}`（plan-only） |
| `grep -nE '"(task_id\|status\|result_ref\|result_manifest)"' reports/M00.1.0{1,2,3}.json` | 0 | 三份报告 `status=submitted`，`result_ref` 与上表一致 |
| `sha256sum` 七个产物 | 0 | 与上表、与两张 manifest 逐一相符 |

同一日志末尾追加了“`reports/BATCH-001.md` 落盘后的最终基线核对”（`check_baseline.py` 再跑一次 → PASS，ADDED 21 全部 in-scope；并以 `json.load` 打印三份报告 `status` 均为 submitted）。

单卡自检日志：`reports/evidence/M00.1.01/verification.txt`（r1，已标注被 r2 取代）与 `verification-r2.txt`；`reports/evidence/M00.1.02/verification.txt`、`reports/evidence/M00.1.03/verification.txt`。自检覆盖：JSON/CSV 解析、`csv:lineN:col` 来源引用与单元格一致、decimal 独立复算行小计与合计、null 与已知 0 区分、待确认字段与问题双向对应、纠正前后一致与一次性值/规则分离、holdout 无期望字段且取值未外泄、acceptance.md 的 ID 与具体数据齐全、无浮点金额、无电话/邮箱/证件号样式。语义判断（字段该不该出现、来源是否合理、规则是否该固化）由人工对照 first-flow 4.1/4.2/6 节与 D1–D6 完成，结论在两张报告与 checkpoint 中。

## 4. 每卡验收入口（供独立复核按 ID 逐条核对）

- M00.1.01-A01/A02：`reports/M00.1.01.json` 的 `acceptance_results`；A01 的对应场景为 acceptance.md 的 V1、V3–V9，A02 见 FLOW-A02 行与 V6 “不静默上传云端”。
- M00.1.02-A01/A02/A03：`reports/M00.1.02.json`；逐字段核对路径为打开 `normal.json`/`missing.json`/`expected.json` 对照 first-flow 4.1 字段表。
- M00.1.03-A01/A02：`reports/M00.1.03.json`；A01 另见 `holdout.json` 的三段声明与 V8 的判失败条件，A02 另见 acceptance.md 第 3 节把 V1/V2/V4 映射到该 ID。

## 5. 仍需评审的事项与移交

1. **D6 移交（已安排）**：`ff-holdout-01` 只有输入，期望由独立验收者在本批提交后生成并保管；公开文件、报告与日志中均无其期望值（脚本扫描 hits=0）。
2. **V5/V6/V7**（拒绝保存、验证失败/缺授权、停用）本批只固定行为口径，无运行时证据；有实现后应作为独立验收条目补跑。
3. **覆盖缺口（如实声明）**：“CSV 缺整列”无任何样本触发；两币种同时可计算的行只在 `reuse_case` 出现；`execution_info` 依赖运行时，未预设期望。
4. **待独立复核的裁定引用**：本批 D1–D5 的一致性只由开发者自检与规范文本保证，未获独立复核；M00.1.01 r2 对 R1–R5 的逐条回应见其报告 `architect_notes`。
5. `taskctl.py next` 仍会提示 M00.1.01 待修正/复核，这是 CURRENT-TASK.md §1 的预期；未修改 helper、未伪造 review。

## 6. 基线外变化

无。收尾比对：229 个基线文件中 MODIFIED 4（`docs/product/first-flow.md` 与 `reports/M00.1.01.*` 三件）、MISSING 0、ADDED 20，全部落在 §5 写集内。`reports/BATCH-001.md` 本文件与 `reports/evidence/M00.1.03/final-batch-check.txt` 在其自身那次比对之后落盘，二者同属写集（`reports/BATCH-001.md` 与 `reports/evidence/M00.1.03/` 前缀）。工作区未初始化新工程、未安装依赖、未运行额外模型会话、未改动 `reviews/`、`AGENTS.md`、`CLAUDE.md`、`docs/handoff/`、`docs/execution/` 及其他模块。

## 7. 停止

BATCH-001 到此停止：不执行 M00.2、M00.0 等后续任务，等待独立复核者按 7 个验收 ID 逐卡裁定并写 accepted。
