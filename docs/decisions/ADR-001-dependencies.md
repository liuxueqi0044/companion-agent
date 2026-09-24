# ADR-001：依赖与运行时版本冻结

- 状态：**submitted（BATCH-002-R1 修订后，第 4 项，待独立复核）**。本轮修订（R1-01～R1-04）统一 Hermes 冻结身份为源码 commit（0.21.4）、更新同源约束证据、补 TypeScript 6.0.3 / npm 11.19.0 精确版本许可绑定与收尾记录。本文件未经独立复核，不等于 accepted。
- 日期：2026-09-23
- 任务卡：M00.2.03（规范哈希 `bb69b5af0ab602c6a62331a09130e21990f56a33c709ce183bd78a9bce227f59`），批次 BATCH-002-R1（初版 BATCH-002 已复核，唯一 findings B2-R1 在本轮修正）
- 输入基线：`docs/handoff/CURRENT-TASK.md`（`dde1913f…`，BATCH-002-R1 派工；基线快照 `docs/handoff/BATCH-002-R1-BASELINE.json`）、`docs/execution/common/ARCHITECTURE.md`（`4ad7de74…`）、`docs/dependencies/runtime-matrix.json`（`ea2f7b18…`，M00.2.01）、`docs/dependencies/license-register.json`（`1d918a1c…`，M00.2.02）、`docs/dependencies/asset-register.json`（`12f5cbc0…`，M00.2.02）
- 机器可读的冻结结果：`docs/dependencies/selected-versions.json`（本 ADR 的规范性附件；两文件必须一致）

## 1. 背景与范围

下一阶段（M00.0.01～M00.0.03）要建立根工具链：Python 环境、Node 工作区与桌面壳构建。在此之前的核查都停在“候选”级别（runtime-matrix 的 26 个条目 stage=candidate/planned）。本 ADR 把它们收敛成**一组可安装的确定组合**，并给出：

1. 初始化组合里每个组件的**具体版本**（不用 latest/main/`^`/`*` 充当冻结值）；
2. 对声明约束（requires_python、engines、peerDependencies、依赖区间）的**交集核对**与证据位置；
3. **最多一条**替代路线及其触发条件；
4. 尚未采用的项的 deferred 标注与理由；
5. 影响后续安装的未知项与需架构裁决的事项。

**范围边界**：本卡只做版本与约束层面的冻结。没有安装任何组件、没有生成锁文件、没有端到端运行——所有“相容”结论都是**约束相容**（元数据交集），不是**真实安装已验证**。这一点贯穿全文。

**BATCH-002-R1 修订说明**：初版独立复核（`reviews/BATCH-002.md` / `reviews/M00.2.03.json`）的 findings B2-R1 指出 Hermes 条目把 PyPI 0.19.0 写成安装目标、却把源码绑定指向声明 0.21.4 的 commit——两套非同源证据不能构成一个安装目标。本轮按架构裁决 E2 把唯一安装目标统一为该不可变源码 commit（声明版本 0.21.4），约束证据全部改读该 commit 的 pyproject 原文，PyPI 0.19.0 降为未采用参考（D6）；并补 TypeScript 6.0.3 / npm 11.19.0 的精确版本许可绑定（R1-03）。范围边界不变。

## 2. 冻结决策

runtime-matrix 显式把四个取舍留给本卡，另有 pydantic 分歧需要给出处置方式；BATCH-002-R1 追加一个身份统一决策（D6）。逐条记录决策与依据。

### D1 — Python 包管理器：uv（不采用 pip 作为冻结项）

- 决策：选 **uv 0.12.18**；pip 26.2.1 标 deferred（`not_adopted`），仅随 CPython 分发作引导用途。
- 理由：uv 能同时锁定解释器分发与依赖解析（跨平台锁文件 + 托管 Python 版本），单独用 pip 无法锁定解释器版本。这是能力差异，不是偏好。
- 证据：`reports/evidence/M00.2.01/pypi-uv.json`（requires_python >=3.8）、`pypi-pip.json`（>=3.10）。
- 不附带替代路线：如果初始化时 uv 不可用，那是新证据，按第 9 节的变更流程重新决策，不在此预置第二方案。

### D2 — Node 包管理器：Node 自带的 npm 11.19.0（不采用 npm 12.1.0，也不采用 pnpm）

- 决策：选 **npm 11.19.0**（随 Node v24.21.0 分发）；npm 12.1.0 与 pnpm 12.5.1 标 deferred（`not_adopted`）。
- 理由：(a) M00.0.02 的文件边界是 `package.json` + `package-lock.json` + TypeScript/Vitest 配置，与 npm 工作区、`npm ci` 的能力一致；(b) npm 12.1.0 发布于查询窗口前一天（2026-09-22），收益不明，却需要额外的全局安装与后续升级动作；(c) pnpm 会引入第二套锁文件与第二套工作区语义，与本批“不因偏好增加第二套”的规则相冲突。
- 证据：`reports/evidence/M00.2.01/nodejs-dist-index.json`（v24.21.0 自带 npm 11.19.0）、`npm-npm.json`、`npm-pnpm.json`。
- 不附带替代路线。

### D3 — TypeScript 线路：冻结 6.0.3，7.0.2 列为唯一替代路线

- 决策：冻结 **TypeScript 6.0.3**；**TypeScript 7.0.2** 作为本卡**唯一**的替代路线（第 6 节）。
- 理由（按证据强度排序）：
  1. 冻结组合里唯一对 TS 版本表态的成员是 `json-schema-to-typescript@16.0.0`，其 devDependencies 写 `typescript: ^6.0.3`。该包发布于 **2026-08-28**，晚于 TS 7.0.2 的发布（2026-07-08）——即类型生成工具链至今仍面向 6.x 开发。
  2. 其余成员均无 TS 版本要求：vite/vitest/@types/node/electron 未声明；vue 的 peer `typescript: "*"` 无信息量。
  3. 6.x 稳定线可用最高版本是 **6.0.3**（6.0.4 与 6.1.0 直接探测均 404），已发布约五个月。
  4. TS 7.0.2 是 registry 的 `latest`，也是 runtime-matrix 的候选；按“不把 latest 当冻结结果”的规则，需要独立证据支持才能冻结，而当前证据指向 6.x。
- 证据：`reports/evidence/M00.2.03/npm-json-schema-to-typescript-16.0.0.json`、`npm-typescript-6x-scan.json`、`npm-typescript-publish-dates.json`、`reports/evidence/M00.2.01/npm-typescript.json`。
- 这是本卡与 runtime-matrix 的**偏离项之一**，已在 selected-versions.json 的 `deviations_from_matrix` 记录。

### D4 — UI 候选的版本补记（不采用，仅关闭悬空项）

- 决策：补记 **shadcn-vue 2.8.2**、**@vueuse/core 15.0.0**、**@jsonforms/core 3.8.0**；三项仍标 deferred。
- 理由：M00.2.02 的许可登记里 shadcn-vue 与 VueUse 只写到 `main`，并注明“M00.2.03 冻结时需补”。本卡把候选版本补成可复核的具体号，但不把它们写进初始化组合——实际引入在 UI 小样与表单方案阶段。
- 证据：`reports/evidence/M00.2.03/npm-shadcn-vue.json`、`npm-vueuse-core.json`、`npm-jsonforms-core.json`。

### D5 — pydantic 分歧：按环境划分，不擅自降版或合并环境

- 决策：env-server 用 **pydantic 2.13.5**；Hermes 自带环境保留其钉死的 **2.13.4**。两者不在同一进程环境共存。
- 理由：Hermes 源码 pyproject 的 dependencies 是精确钉死（`pydantic==2.13.4`），与 2.13.5 不可同环境解析；两版本行为差异未核实，冻结阶段既不能擅自降版，也不能把两个环境合并。这是**环境划分**问题而不是版本替换问题，故**不列为替代路线**；E1 已按架构裁决关闭（独立进程/venv、我方环境不直接 import Hermes）。
- 证据：`reports/evidence/M00.2.03/hermes-pinned-pyproject.toml`（源码原文）、`reports/evidence/M00.2.01/pypi-pydantic.json`。

### D6 — Hermes 冻结身份：唯一目标为不可变源码 commit（PyPI 0.19.0 降为未采用参考）

- 决策：以官方源码 commit **`d337b736aa1e8ebecfab043842d13e4a2d2f48a3`**（tag v2026.9.21；其 pyproject 声明 `version = "0.21.4"`）为 Hermes 的**唯一**冻结安装目标；**PyPI 0.19.0 标 deferred（`not_adopted`）**，只作参考。
- 理由：初版条目把 install_source 写成 PyPI 0.19.0、source_binding 却指向声明 0.21.4 的 commit（B2-R1），且两者依赖声明有实际差别（如 `uvicorn>=0.31.0,<1` 对 `uvicorn[standard]>=0.24.0,<1`；`cryptography==50.0.0` 对 46.0.7）。架构裁决 E2 给出唯一目标：后续 Hermes 验证选择已记录并已核查许可证的不可变源码 commit；安装 profile 与 extras 在 M00.3.01 读取同一 commit 后决定。本轮只统一身份与来源约束证据，不安装、不运行、不验证账号。
- 证据：`reports/evidence/M00.2.03/hermes-pinned-pyproject.toml`（sha256 `d660dc79…`，36156B，URL 含该 commit）、`reports/evidence/M00.2.03/hermes-pypi-0.19.0.json`（参考）。
- 不附带替代路线；PyPI 0.19.0 不构成第二路线，也不构成该 commit 的发行物绑定。

## 3. 冻结清单（初始化组合）

| 环境 | 组件 | 冻结版本 | 来源 | 引入点 |
|---|---|---|---|---|
| env-server | CPython | 3.13.15 | python.org 发行物 | M00.0.01 |
| env-server | uv | 0.12.18 | PyPI | M00.0.01 |
| env-server | fastapi | 0.141.1 | PyPI | M00.0.01（首个使用者 M00.0.05） |
| env-server | uvicorn | 0.53.0 | PyPI | M00.0.01（首个使用者 M00.0.05） |
| env-server | pydantic | 2.13.5 | PyPI | M00.0.01 |
| env-server | pytest | 9.1.1 | PyPI | M00.0.01 |
| env-desktop | Node.js | v24.21.0（LTS） | nodejs.org 发行物 | M00.0.02 |
| env-desktop | npm | 11.19.0（Node 自带） | 随 Node 分发 | M00.0.02 |
| env-desktop | TypeScript | 6.0.3 | npm | M00.0.02 |
| env-desktop | Vite | 8.3.0 | npm | M00.0.02 |
| env-desktop | Vitest | 5.0.1 | npm | M00.0.02 |
| env-desktop | @types/node | 24.13.6 | npm | M00.0.02 |
| env-desktop | Vue | 3.5.43 | npm | M00.0.02（首个使用者 M00.0.03） |
| env-desktop | Electron | 44.4.4 | npm | M00.0.02（首个使用者 M00.0.03） |
| env-desktop | json-schema-to-typescript | 16.0.0 | npm | 契约类型导出阶段 |
| env-executors | Hermes（hermes-agent） | 0.21.4（源码 commit `d337b736aa1e8ebecfab043842d13e4a2d2f48a3`，tag v2026.9.21，声明版本取自其 pyproject） | **上游源码 commit（不用 PyPI 发行物；PyPI 0.19.0 为未采用参考）** | M00.3.01 |
| env-executors | Codex（@openai/codex） | 0.156.0 ＋ 源码绑定 `fe74a774532af67b5a4a3dec03ce9469e17f89af`（tag rust-v0.156.0） | npm / 上游仓库 | M00.5.01 |
| env-executors | Claude Code（@anthropic-ai/claude-code） | 2.1.280 | npm（官方程序） | M00.5.02 |

每个条目的证据路径与 SHA-256、来源 URL、矩阵条目引用见 `selected-versions.json` 的 `selected` 数组；完整证据链在 runtime-matrix.json 的对应 item 下。

**与 runtime-matrix 的四处偏离**（均因本卡的决策职责）：hermes-agent 0.19.0（PyPI）→0.21.4（源码 commit，D6，BATCH-002-R1 按架构裁决 E2 补记）；typescript 7.0.2→6.0.3（D3）；npm 12.1.0→自带 11.19.0（D2）；pnpm 不采用（D2）。其余 22 个条目的冻结值与矩阵 pinned 完全一致。矩阵文件本身保持 M00.2.01 提交态不修改，偏离一律经 `deviations_from_matrix` 双向记录。

**安装状态**：本卡未安装任何组件，也不预造锁文件。`uv.lock` 与 `package-lock.json` 必须由 M00.0.01 / M00.0.02 的**真实安装**在各自目录生成；本文件的版本号是安装时的目标值，不是已解析的依赖树。

## 4. 约束交集核对（全部为“约束相容”级）

详细清单（含每条声明的原文与来源文件）在 `selected-versions.json` 的 `compatibility.checks`（C1–C6）。要点：

- **C1 Python**：hermes-agent 的 `requires_python` 原文为 `>=3.11,<3.14`（取自源码 commit 的 pyproject），给出交集上下界；fastapi/uvicorn/pytest/pip `>=3.10`、pydantic `>=3.9`、uv `>=3.8` 都更宽。交集为 `[3.11,3.14)`，3.13.15 在其中。3.14.7（最新稳定）被 Hermes 的 `<3.14` 排除。Hermes 按其独立 venv 使用该解释器，与我方环境不共用进程（E1）。
- **C2 Node**：vite `^20.19.0 || >=22.12.0`、vitest `^22.12.0 || ^24.0.0 || >=26.0.0`、electron `>= 22.12.0`、typescript 6.0.3 `>=14.17`、json-schema-to-typescript `>=16.0.0`、claude-code `>=22.0.0`、codex `>=16` 全被 v24.21.0 满足。**vue 未声明 engines → unknown**，不能断言。
- **C3 peer/依赖交集**：唯一必需 peer 是 vitest→vite（`^6.4.0 || ^7.0.0 || ^8.0.0`，optional=false），被 vite 8.3.0 满足；vitest→@types/node（`^22.0.0 || >=24.0.0`）、vite→@types/node（`^20.19.0 || >=22.12.0`，均 optional）与 electron 的 dependency `@types/node ^24.9.0` 都被 24.13.6 满足，三处可去重为单一 @types/node 24.13.6。vue→typescript `*` 被 6.0.3 平凡满足（无信息量）。
- **C4 TypeScript**：见 D3；决策证据与替代路线分离记录。
- **C5 Hermes 约束**（全部改读源码 commit 的 pyproject 原文）：`fastapi>=0.104.0,<1` ⊇ 0.141.1、`uvicorn>=0.31.0,<1`（core，**无** `[standard]` extra）⊇ 0.53.0（相容）；`pydantic==2.13.4` × 我方 2.13.5（精确钉死，按 D5 分环境，E1 已裁决不直接 import）。extras/profile 相容性未核：不把 core 元数据冒充全 extras 相容（该 commit 的 `web` extra 含 `fastapi==0.133.1`、`uvicorn==0.41.0` 等精确钉死，采用与否在 M00.3.01 决定）。
- **C6 A02 核查**：Hermes 仍是唯一主控与唯一记忆；Codex/Claude Code 是可替换执行器；Python 侧只 uv、Node 侧只 npm、测试框架各环境一个；本卡未引入任何浏览器驱动。三个 runtime 环境是**安装与运行位置的划分**，不是三套主控。

### 约束相容 vs 真实安装已验证

| 级别 | 含义 | 本卡 |
|---|---|---|
| 约束相容 | 只解析元数据（requires_python / engines / peerDependencies / 依赖区间）并求交集 | **本卡全部结论止于此** |
| 真实安装已验证 | 实际安装、解析依赖树、编译、运行、端到端 | 未做（`integration_evidence_kind = not_run`） |

因此本 ADR 不使用“已验证可用”“安装通过”一类措辞；所有相容结论都限定在约束层。

## 5. deferred（尚未采用的项）

| 项 | 候选版本 | 类别 | 理由 |
|---|---|---|---|
| supabase | 2.31.0 | later_stage | 数据/对象存储，服务端数据落地阶段引入 |
| pgmq | 1.1.4 | later_stage | 任务队列，数据层就绪后引入 |
| e2b | 2.51.0 | later_stage | 沙箱，执行器接入后引入 |
| mcp-sdk | 2.2.0 | later_stage | 工具入口，与 Hermes/客户端对接方式一并确定 |
| langfuse | 4.15.4 | later_stage | 观测；只用核心（MIT）范围 |
| airi | commit `308ee2b3…` | later_stage / source_only | 组件抽取试验阶段；不复制其美术/音频素材 |
| shadcn-vue | 2.8.2 | later_stage | 复制组件模式，UI 小样阶段（本卡补记版本） |
| @vueuse/core | 15.0.0 | later_stage | 与 UI 小样同阶段（本卡补记版本） |
| @jsonforms/core | 3.8.0 | later_stage | 表单渲染候选，需求明确后评估 |
| npm | 12.1.0 | not_adopted | D2：用 Node 自带的 11.19.0 |
| pnpm | 12.5.1 | not_adopted | D2：不引入第二套包管理器 |
| pip | 26.2.1 | not_adopted | D1：不作为独立冻结项 |
| hermes-agent（PyPI 发行物） | 0.19.0 | not_adopted | D6（R1-01/E2）：唯一目标为源码 commit（0.21.4）；其依赖声明与源码有实际差别（`uvicorn[standard]>=0.24.0,<1` 对 `uvicorn>=0.31.0,<1`；`cryptography` 46.0.7 对 50.0.0），只作参考 |

deferred 项**不带触发条件**——它们是“未采用”，不是“备用路线”。只有第 6 节那一条是替代路线。

## 6. 唯一的替代路线：TypeScript 7.0.2

- **路线**：把 `typescript` 从 6.0.3 换成 **7.0.2**，其余组合保持不变。
- **触发条件**（满足任一即触发）：
  1. M00.0.02 初始化时，冻结组合或届时即将引入的依赖声明要求 `typescript >= 7`（含等价的编译要求）；
  2. 6.0.3 的 typecheck / 构建链在本组合（vite 8.3.0 + vitest 5.0.1 + vue 3.5.43 + @types/node 24.13.6）上不可用。
- **影响范围**：只改 `typescript` 一个包的版本；不动主控（Hermes）、记忆框架、运行环境划分、包管理器与测试框架。
- **已知事实**：7.0.2 `engines.node >=16.20.0`（满足 Node 24）；依赖一组 `@typescript/typescript-<platform>` 平台包（含 win32-x64），是原生编译器的按平台分发形态。
- TS 5.9.3（5.x 线最高）只作证据留痕，**不构成第二条替代路线**。

## 7. unknown（显式未知）

1. Electron 44.4.4 内置的 Node/Chromium 版本（桌面运行时不等于系统 Node 24）；属 M00.0.03 实测项。
2. @types/node 24.13.6 对 TS 编译器的**最低**版本要求（类型包不声明 engines/peer）。
3. vue 3.5.43 未声明 engines，“与 Node 24 相容”只能由工具链间接支持。
4. uv 0.12.18 在 Windows 上的可用性与支持矩阵（D1 依赖它承担解释器与依赖锁定）。
5. vue-tsc 等 SFC 类型检查工具未登记；引入前需按 M00.2.02 流程补登记与冻结。
6. Hermes 源码 commit 与 PyPI 0.19.0 的完整差异清单：已确证例子（uvicorn 约束、cryptography），0.19.0→0.21.4 的功能变化全貌未核。
7. Hermes 源码 commit 的 extras/profile 相容性：只核对了 core 元数据原文，`web` 等 extra 的精确钉死与安装 profile 留 M00.3.01。
8. Langfuse 核心（MIT）与 ee/ 企业目录的功能边界。
9. 真实安装与端到端未验证；本机 Windows 上的 venv/npm 工作区实际行为（路径长度、编码、原生模块）未验证。

## 8. 需架构裁决（不影响本机初始化）

- **E1 pydantic 环境划分 — 已关闭（裁决）**：Hermes 与我方服务端使用独立进程/虚拟环境；我方 pydantic 2.13.5 不注入 Hermes 环境；不在我方服务代码里直接 import Hermes；未来通过适配器接入（架构裁决，`reviews/BATCH-002.md` §架构裁决 1）。冻结保持 D5 分环境。
- **E2 Hermes 版本号体系 — 已关闭（裁决）**：后续 Hermes 验证的唯一目标 = 已记录并已核查许可证的不可变源码 commit（声明版本 0.21.4）；PyPI 0.19.0 只作未采用参考；安装 profile 与 extras 在 M00.3.01 读取同一 commit 后决定（架构裁决 2）。落地于 D6 与冻结清单 Hermes 行。
- **E3 Langfuse 核心/ee 边界 — 延后**：自托管只使用核心（MIT）部分，ee/ 组件边界在进入部署任务时逐项核对（不阻塞当前骨架）。

**阻塞判定**：未发现阻塞 M00.0.01 / M00.0.02 初始化的未决约束（`blocking_next_install.blocked = false`）。E1/E2 已按架构裁决关闭；E3 是后续部署卡事项。

## 9. 冻结的变更流程

冻结值一经复核通过即为初始化与后续卡的默认目标值。需要改动时必须：给出新证据（registry/页面/实测）→ 说明触发条件 → 走对应卡的任务流程与评审，不得在实现卡里就地改版本。唯一预置的替代路线是第 6 节那一条；除此之外不得新增并行方案（含第二套主控、记忆框架、包管理器、浏览器驱动）。

## 10. 交付与自检

- 规范性附件：`docs/dependencies/selected-versions.json`（与本文一一对应）。
- 自检：`reports/evidence/M00.2.03/check_selected_versions.py`（版本具体性、矩阵/许可登记交叉引用、证据哈希、requires_python/engines/peer 交集求值、BATCH-002-R1 新增：源码身份（pyproject 原文 = selected.version）、评审复制证据与 upstream 记录一致、license_binding 文件哈希与字节同一性、反例探测）；BATCH-002 运行输出见 `reports/evidence/M00.2.03/verification.txt`，R1 修订运行输出见 `reports/evidence/M00.2.03/verification-r1.txt`。
- 本文件状态为 **submitted（BATCH-002-R1）**，等待本轮独立复核；accepted 只能由独立评审写入。
