# BATCH-002 交接摘要

派工来源：`docs/handoff/CURRENT-TASK.md`（batch_id=BATCH-002）；基线快照 `sha256:02359edd95aa09ae294f78bca6d950527d9b63d95ff885c6f1b4c5828adb620e`（`docs/handoff/BATCH-002-BASELINE.json`，295 文件）。本批按 §1 的连续派工授权一次交付：M00.1.03 修订 + M00.2.01/M00.2.02/M00.2.03 三张依赖基线卡。四张卡报告均为 `submitted`，**均未 accepted**——只有独立复核能给 accepted，submitted ≠ accepted。本批无 Git 提交（工作区不是 Git 仓库），任何哈希均为文件内容哈希。外部前置 M00.1.01/M00.1.02 已独立 accepted，其产物本批只读、未动。

## 1. 四卡状态

| 卡 | 状态 | 产物 | 报告 / 证据 |
| --- | --- | --- | --- |
| M00.1.03 修订 | submitted | `tests/fixtures/first-flow/correction.json`、`docs/product/acceptance.md` | `reports/M00.1.03.json`（`manifest-sha256:612da2e9…`）；自检 `reports/evidence/M00.1.03/` |
| M00.2.01 | submitted | `docs/dependencies/runtime-matrix.json`（26 条目） | `reports/M00.2.01.json`（`file-sha256:ea2f7b18…`）；自检 `reports/evidence/M00.2.01/` |
| M00.2.02 | submitted | `docs/dependencies/license-register.json`（29 条）、`docs/dependencies/asset-register.json`（7 条） | `reports/M00.2.02.json`（`manifest-sha256:e5dc42b9…`）；自检 `reports/evidence/M00.2.02/` |
| M00.2.03 | submitted | `docs/decisions/ADR-001-dependencies.md`、`docs/dependencies/selected-versions.json` | `reports/M00.2.03.json`（`manifest-sha256:6d5c06b8…`）；自检 `reports/evidence/M00.2.03/` |

四卡各自 `reports/M00.1.0N.checkpoint.md` / `reports/M00.2.0N.checkpoint.md` 已随卡保存，含下一步精确动作与禁止重复动作。规范哈希沿用原卡：M00.1.03 `81b7b4f2…`、M00.2.01 `a4d73d7e…`、M00.2.02 `68ea0223…`、M00.2.03 `bb69b5af…`（完整值见各报告 `task_spec_sha256`）。

## 2. 产物与哈希（sha256，收尾实测）

| # | 文件 | sha256 |
| --- | --- | --- |
| 1 | `tests/fixtures/first-flow/correction.json` | `f44c8d1779fc4da72597ebb38fe5dd18e191a03da02e92c73654fb16a96fe2c3` |
| 2 | `docs/product/acceptance.md` | `85c5215ff697ebf67a6264783d996f445e95562a7dc9fb51f269340b7fff2cc5` |
| 3 | `docs/dependencies/runtime-matrix.json` | `ea2f7b18a6d80f951f4225fbce8e45ca5ba606622883c689d2b7346cf7497572` |
| 4 | `docs/dependencies/license-register.json` | `1d918a1c010f144fd30676d4b9d535c839eb1b43e2163148247a624f0c96e302` |
| 5 | `docs/dependencies/asset-register.json` | `12f5cbc0aea6f8a8e4867f59e2e805b6bff25602284cae8828bd823bf70569ae` |
| 6 | `docs/decisions/ADR-001-dependencies.md` | `e2bd89c077c9fd875c620ad553c16d478c055ca13d46f9962c196edb10bf194c` |
| 7 | `docs/dependencies/selected-versions.json` | `1f1a5d0cb8f09f0b830f6b0c6387b14ef4f4b51437e7d9315c993715acb81fb2` |

清单归属：#1–2 见 `reports/evidence/M00.1.03/artifact-manifest.json`（`612da2e9…`）；#4–5 见 `reports/evidence/M00.2.02/artifact-manifest.json`（`e5dc42b9…`）；#6–7 见 `reports/evidence/M00.2.03/artifact-manifest.json`（`6d5c06b8…`）；#3 由 `reports/M00.2.01.json` 的 `result_ref` 单文件引用。`holdout.json` 未改：`cfde4a5ddcaeb6b6c814ee6e9bc61a5ea9358528e9aa632e307ca81e272a93d6`（只核对哈希，未读内容，未用于生成测试或推导答案）。

## 3. 各卡做了什么

- **M00.1.03 修订（R2-01/02/03）**：reuse_case 补成完整业务快照（summary/elements、完整明细、小计/合计、来源、问题与缺失字段、运行时占位分列），corrected_result 写明继承与合并方式；两处复用币种合计加 `formula`/`operands`，顶层币种给 `source_ref`，全部实际金额可回溯本次输入；`check_correction.py` 扩展了对应约束与内存深拷贝负例，并把旧"预留输入解析/金额推导"检查改为**只比对 SHA-256**（预留输入哈希与基线一致，公开 expected 不含其答案的检查保留）。这不是删断言，而是把评审资料隔离出开发流程。
- **M00.2.01**：26 条目运行时矩阵（Hermes/Codex/Claude Code 三角色 + Python/Node/包管理器与初始化主依赖），逐项记用途、部署面、真实包名、精确版本或不可变 commit、发布时间/查询时间、支持系统、语言约束、接口证据、来源 URL、证据文件与哈希、验证层级与 unknown；未能核实的兼容项显式 unknown。
- **M00.2.02**：29 条许可登记 + 7 条素材登记。许可结论全部来自本轮 40 个逐字抓取的许可正文（registry 声明只作对照）；区分仓库代码 / 企业目录（Langfuse ee/）/ 托管服务 / 模型权重 / 素材，同依赖多形态分开登记。Claude Code 登记为官方程序集成（非可 fork 底座，不复制代码、不再分发二进制）。素材侧首版只有系统字体（不再分发）与自有占位图形，角色素材/音频/权重 excluded。
- **M00.2.03**：把 26 候选 + 29 许可收敛成 18 个具体版本的冻结组合（source_only 绑 40 位 commit；无 latest/main/^/* 当冻结值），五个显式决策 D1–D5，三处对矩阵的偏离（typescript 7.0.2→6.0.3、npm 12.1.0→Node 自带 11.19.0、pnpm 不采用），唯一替代路线 TypeScript 7.0.2（两条触发条件），12 个 deferred 不带触发条件，约束交集 C1–C6 与"约束相容 vs 真实安装已验证"严格分开，E1–E3 上报架构裁决且 `blocking_next_install.blocked=false`。

## 4. 关键自检结果与命令（原始输出：各卡 `reports/evidence/<ID>/verification.txt`）

| 命令（argv） | 退出码 | 结果 |
| --- | --- | --- |
| `python reports/evidence/M00.1.03/check_correction.py` | 0 | 修订后含 R2-01/02 扩展约束与内存负例；预留输入只比对 SHA-256 |
| `python reports/evidence/M00.2.01/check_runtime_matrix.py` | 0 | `total=15 failed=0`（26 条目，含负例） |
| `python reports/evidence/M00.2.02/check_registers.py` | 0 | `total=16 failed=0`（29+7 条，含 7 条负例） |
| `python reports/evidence/M00.2.03/check_selected_versions.py` | 0 | `total=28 failed=0`（含 8 条负例 + 4 条篡改探针） |
| `python reports/evidence/M00.1.02/check_fixtures.py`（回归） | 0 | 全过（未改 accepted 产物） |
| `python reports/evidence/M00.1.01/check_first_flow.py`（回归） | 0 | 全过（未改 accepted 产物） |
| `python reports/evidence/M00.1.01/check_baseline.py` | **1** | **如实记录的预期失败**：该脚本按 BATCH-001 的 229 文件写集比对，本批工作区必然含其写集外文件（CURRENT-TASK §8 已预告），182 项 OUT-OF-SCOPE 全部可归因于本批授权文件与评审/派工侧改动；未修改、未篡改该脚本以求绿色；原文留存 `reports/evidence/M00.2.03/check_baseline-batch001-scope-fail.txt`（`01afe94d…`） |
| `python reports/evidence/M00.1.03/check_write_scope_batch002.py` | 见第 7 节 | 本批权威范围检查（收尾复跑结果在 §7） |
| `python docs/execution/taskctl.py validate` | 0 | `{"valid": true, "tasks": 156, "first": "M00.1.01"}`（plan-only；`next` 仍提示 M00.1.03 待修订/复核是 §1 预期，未改 helper） |
| `sha256sum` 第 2 节七个产物与四张 manifest | 0 | 与上表逐一相符 |

## 5. 来源证据（本批新增）

- **M00.2.01**：官方 registry/页面只读 HTTP（PyPI JSON、npm packument、nodejs.org dist index、python.org 发行物、GitHub releases/tag refs），40+ 证据 JSON 逐项含 URL、HTTP 状态、抓取时间、UA、字节数与文件哈希；GitHub 匿名 API 403 限流如实留痕并改用非 API 途径。
- **M00.2.02**：五轮许可抓取，40 个逐字许可正文/条款页落盘（`reports/evidence/M00.2.02/licenses/`），另存 Claude Code 官方商业条款页原文；registry 声明与正文不一致处（如 e2b PyPI MIT vs 仓库根 Apache-2.0）逐项澄清。
- **M00.2.03**：三轮补充抓取（精确版本 manifest 含 peerDependenciesMeta 与 devDependencies、TypeScript 5.x/6.x 线扫描与 404 探测、full packument 发布时间映射）；8.7 MB / 15.7 MB 原始 packument 不落盘，留 `raw_response_sha256` 与 limitation 字段。59 处引用证据哈希逐文件实算，0 不符、0 漂移。
- 全程公开只读查询：未登录、无令牌、未调用任何模型推理 API、未测试订阅额度、未把凭据复制或外传、未安装/升级本机 Codex、Claude Code、Hermes，未改用户账号。

## 6. 每卡验收入口（供独立复核按 ID 逐条核对）

- **M00.1.03-A01**（holdout 不作为代码生成示例）：`reports/M00.1.03.json` 的 `acceptance_results`；holdout 哈希未变（第 2 节末），公开文件与 expected 不含其答案。
- **M00.1.03-A02**（首次执行与第二次复用都覆盖）：同报告；reuse_case 完整快照 + corrected_result 继承说明 + 币种/来源回溯。
- **M00.2.01-A01**（不以 latest 作冻结）：`reports/M00.2.01.json`；矩阵逐项是具体版本或 commit。
- **M00.2.01-A02**（未核实兼容项标 unknown）：同报告；unknown 字段逐项列示。
- **M00.2.02-A01/A02/A03**：`reports/M00.2.02.json`；A01 逐条来源+许可路径+证据哈希；A02 素材排除项；A03 Claude Code 官方集成条目（含条款页原文）。
- **M00.2.03-A01**（Python/Node 与依赖相容）：`reports/M00.2.03.json` + `check_selected_versions.py` 的 C/D 组；全部为"约束相容"级。
- **M00.2.03-A02**（不增第二套主控/记忆）：同报告 + `selected-versions.json` 的 C6 与 `environments` 结构断言。

## 7. 收尾写集检查（权威范围检查，同刻复跑）

`python reports/evidence/M00.1.03/check_write_scope_batch002.py` → **PASS（MODIFIED 6 / ADDED 138 / MISSING 0，exit=0）**，在该摘要落盘后复跑；完整原始输出：`reports/evidence/M00.2.03/final-scope-check-batch002.txt`（`310a02eb…`，该文件本身在比对之后落盘故不在自身列表内）。基线 `docs/handoff/BATCH-002-BASELINE.json`（295 条目，`snapshot_id=sha256:02359edd…`）与各报告 `base_ref` 一致。MODIFIED 6 全为本批 M00.1.03 修订文件；变化列表不含 `reviews/`、`AGENTS.md`、`CLAUDE.md`、`docs/execution/`、`docs/architecture/`，accepted 产物与 `holdout.json` 未被改动。

## 8. 仍需独立复核/后续处理的未知项

1. **check_baseline.py 的代际 FAIL**（第 4 节）：构造性结果，已留证；是否在归档时为 BATCH-002 补一代同类检查器由复核决定。
2. **E1 pydantic 环境划分**：env-server 2.13.5 vs Hermes 自带 2.13.4，若需同环境导入 hermes 包须重新决策（M00.3.01 前）。
3. **E2 Hermes 版本号体系**：PyPI 0.19.0 与 tag v2026.9.21（release 名 v0.21.4）的功能对应关系未核实。
4. **E3 Langfuse 核心/ee 边界**：自托管只用 MIT 核心，ee/ 逐项边界留部署卡。
5. **M00.2.03 其余 unknown**：Electron 内置 Node/Chromium 版本（M00.0.03 实测）、@types/node 对 TS 的隐式最低版本、vue 未声明 engines、uv 在 Windows 的可用性、vue-tsc 未登记、真实安装/端到端未验证（`integration_evidence_kind=not_run`，锁文件必须由 M00.0.01/M00.0.02 真实安装生成）。
6. **M00.2.01/02 遗留**：GitHub 匿名 API 限流影响 tag→commit 绑定（ref_kind 已逐项标注）、json-schema-to-typescript 无 16.0.0 tag（以 master 正文+版本声明旁证）、托管服务条款可变（接入前重取）。
7. M00.2.03 与矩阵的三处偏离已双向记录；runtime-matrix.json 本身保持 M00.2.01 提交态，如需完全同步请复核指定执行卡。

## 9. 停止

BATCH-002 到此停止：不执行 M00.0、M00.3 及其他批外任务，不自行标记 accepted，等待架构负责人对四项的统一独立复核（M00.1.03 修订 + M00.2.01/02/03）。
