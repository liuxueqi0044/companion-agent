# BATCH-003：可复现的最小工程骨架

工作目录：C:\Users\xiayu\Documents\Codex\companion-agent

## 1. 权威入口与执行顺序

当前派工是本文件 `docs/handoff/BATCH-003.md`，不是 CURRENT-TASK.md。后者仍是 M00.2.03 的哈希证据，必须原字节保留。读取 AGENTS.md、本文件、reviews/BATCH-002-R1.md、docs/execution/common/ARCHITECTURE.md、modules/M00.md，再按需要读取三张原卡与 C01–C04。

原任务与规范哈希不改。顺序只有：M00.0.01 → M00.0.02 → M00.0.03。前三阶段的 6 张卡已 accepted，只读。

本派工由架构负责人明确授权一次“批内串行开发、批末集中验收”的例外：本批前卡完成实际自检、写检查点且无阻塞后，可以继续下一卡；不要求在两卡之间等待独立 accepted。此例外仅限这三卡，不把自检冒充独立验收，也不修改原架构、taskctl 或任务规范。任一卡有阻塞即停止依赖它的后续工作。三卡收尾后统一 submitted 并停止，禁止 M00.0.04、M00.0.05、M00.3。

同一个 Claude Code 会话串行完成，不开子智能体、Agent Teams、其他模型会话，不调用模型 API、订阅或真实账户。

## 2. 共用工程边界

冻结依据：docs/dependencies/selected-versions.json 与 docs/decisions/ADR-001-dependencies.md。本轮把候选组合带入真实安装；不得把元数据核对当实际安装成功。只安装本批确实使用的工具与依赖，不整张表批量安装。

- Python：按冻结 Python/uv/pytest/pydantic 建最小环境；FastAPI/uvicorn 此轮不需要，可以留 M00.0.05。Hermes 不安装、不 import。
- Node：冻结 Node 与其自带 npm、TypeScript、Vitest、Vite、Vue、@types/node。此轮只构建 renderer，Electron 主进程、安装包、托盘和 IPC 均不开发；不必下载 Electron 二进制。
- 优先复用本机满足冻结版本的工具；不满足时允许从官方来源下载固定版本到项目 `.local-tools/`，用绝对路径调用或当前子进程 PATH。不得全局安装/升级，不改系统 PATH、用户 profile、已安装 Codex/Claude/Hermes。
- 工具缓存放 `.uv-cache/`，Python 环境 `.venv/` 和重建验证用 `.venv-repro/`；项目安装的 node_modules/dist/build 是生成目录。不得提交环境、二进制、缓存、密钥或机器绝对路径到业务配置。只允许下载公开包/官方发行物和本地 loopback 验证。
- 若冻结版本不存在、官方源不可达或实测不兼容：记录准确命令、来源、返回码、错误与最小改动建议。同因两次失败即停，不擅自换版本、降级、换包管理器或绕过锁文件。可引用 ADR 的 TS 替代触发条件提出变更，但本轮不得自行修改 accepted 冻结文件。
- 运行 npm 只使用锁定包和本地 bin，避免 npx 隐式拉取 latest。锁文件必须由真实解析器生成，不手填完整性字段。
- 不读取真实凭据、浏览器历史或 holdout。不接数据库、云服务、Agent、不实现业务；不改独立的 Morrow UI 预览。

## 3. M00.0.01：Python 最小环境

原卡文件：pyproject.toml、requirements-dev.txt、services/__init__.py、services/control/__init__.py、tools/__init__.py。

本派工额外授权：uv.lock、可选 .python-version；.gitignore 只追加本批生成/缓存目录。版本的唯一声明源为 pyproject；requirements-dev.txt 作为 uv 导出/明确的兼容入口，不建立第二套手工依赖真相。Python build backend 若需新增，固定精确版本并在本卡 evidence 登记官方来源、许可和采用理由；不顺便引入框架。

目录可导入但不实现业务，预留 adapters/integrations 的打包方式，不造空业务模块。初始化验证代码放 reports/evidence/M00.0.01/，不改既有 tests/fixtures。

验收：

1. 在干净环境按冻结 Python 版本安装本项目及测试依赖；记录解释器绝对路径和版本。然后从项目根目录之外、移除 PYTHONPATH 的子进程 import services.control，核对 __file__ 来源，排除仅靠当前目录“伪安装”。
2. pytest 真实发现并运行至少一个初始化 smoke 测试（可放本卡 evidence）；日志包含收集数和测试结果，0 tests/退出 5 不能当通过。
3. 用 uv.lock 在第二个干净环境 frozen sync 重建，核对主要直接依赖一致、锁文件哈希不变。环境和缓存仅生成，不作为手写产物计数。
4. 无密钥、无付费调用；记录网络只用于包/工具下载。保存真实 argv、退出码与输出。

## 4. M00.0.02：TypeScript 工作区

原卡文件：package.json、package-lock.json、tsconfig.base.json、vitest.config.ts。npm workspace 预留 apps/desktop 与 packages/*，根脚本提供 test:unit 和 typecheck。安装精确版本的最小工具集合，直接依赖不写 ^、~ 或 latest，传递依赖由锁文件管理。

使用根共享配置、各 workspace 最小扩展。此轮 Vue 使用 .ts + createApp/h/render 写空页面，不需要 .vue SFC、@vitejs/plugin-vue 或 vue-tsc，避免新增尚未登记的编译插件。后续真正采用 SFC 时另行登记。

验收：

1. package-lock 真实生成；在隔离干净安装目录对本批最终 package/workspace 文件执行 npm ci。锁文件前后哈希一致，并核对冻结直接依赖实际版本。允许复制本批源码与 package/lock 到本卡 evidence/rebuild-workspace/；记录它是重建夹具，不是第二产品源码。
2. npm run test:unit -- <指定文件> 确实只运行目标测试；不存在的测试路径必须非零，不用 passWithNoTests 掩盖无测试。
3. typecheck 对最终 workspace 源码真实生效。以独立临时 fixture 验证类型错误会被拒绝，不能让空 include 集合或仅打印消息的脚本通过。
4. 不批量引入 selected/deferred 全表；Vue 等由下一卡需要时加入。所有跨卡根 package/lock 改动仍归 M00.0.02 所有，三卡最终态形成后重跑并重建该卡 manifest，避免 accepted 时哈希陈旧。

## 5. M00.0.03：Vue renderer 空壳

原卡文件：apps/desktop/package.json、apps/desktop/tsconfig.json、apps/desktop/index.html、apps/desktop/vite.config.ts、apps/desktop/renderer/main.ts。

复用根 TS/Vitest/Vite 依赖，通过 workspace 提供 build；页面只显示产品名、无数据的占位区域与本地开发说明。可以使用内联样式做清爽的空壳，但不把此任务扩成产品视觉 UI；正式 UI 使用后续卡整合现有设计。

验收：renderer 使用真实 Vite 命令构建成功，产物非空、生成入口引用的本地 JS/CSS 都存在；根 typecheck 覆盖 main.ts；源码与产物中无真实数据/远程脚本、字体、用户账户、认证/托盘/任务流程。不把 Vite 构建成功说成 Electron 窗口已运行。若查看预览，可用本地服务；不把服务开放到 0.0.0.0，不部署。

本轮不新增 Electron main/preload、不做安装包、不迁移独立 UI 预览。保留 Electron 运行时版本验证为后续工作。

## 6. 写权限与范围检查

三卡写集为各自原卡路径，加上 §3 的 uv.lock/.python-version/.gitignore，以及各自 reports/<ID>.json、checkpoint、reports/evidence/<ID>/。批次汇总仅 reports/BATCH-003.md。

根 package/lock/TS/Vitest 归 .02；.01 拥有 Python 配置与新增环境忽略规则；.03 拥有五个桌面文件。若后一卡需要修改前卡的本批共享配置，应归属到拥有者并在最终报告中解释，不跨到 accepted 的历史文件。

新增工具/包源和许可最小登记写入本卡 evidence，不修改旧 selected、ADR、许可表。持久缓存只在明确生成目录；范围检查从文件枚举前排除这些目录，避免扫描 node_modules/.venv。绝不把整个 work/ 或任意目录一概列入忽略。

权威只读检查入口：`python docs/handoff/check_batch003_scope.py`，基线 `docs/handoff/BATCH-003-BASELINE.json`。开发者不得修改这两个文件，也不得修改旧 helper/检查器以求绿色。旧批次范围脚本不作为本批门槛。

reviews/、根规则、派工、原架构/契约/任务包、所有已 accepted 产物与报告只读。原 CURRENT-TASK.md 必须不变，selected 的输入哈希才能持续复核。

## 7. 报告与停止

每卡 report：status=submitted、batch_id=BATCH-003、dispatch_ref=docs/handoff/BATCH-003.md、base_ref=本批基线 snapshot_id、task_spec_sha256=原卡哈希。开发者不写 accepted。

changed_files 只列原卡写集及该卡报告/evidence；本派工新增授权文件（uv.lock/.python-version/.gitignore）单列 dispatch_changed_files 并指向本派工，全部纳入实际范围检查和对应 manifest。批次汇总放 batch_level_changed_files，不塞到某一单卡 changed_files。这是显式授权与原 helper 兼容的记录分层，不允许漏记文件。

unresolved 只放确实阻止本卡验收的事项；未来卡的已知未知放 evaluator_followups，附责任阶段与验证方式。无测试/未安装/类型检查失败必须如实放 unresolved，不能凭延期文字清空。安装与测试成功用 integration_evidence_kind=actual；只写了配置则 not_run。

每条命令保存 argv、cwd、退出码、实际日志路径；按原卡 A01…逐条给证据。各卡 manifest 只列最终业务文件/授权的源码或锁文件，不包括 manifest 本身、报告或日志，避免循环哈希。最终三卡共享配置收敛后重跑必要验证、最后计算全部 result_ref；报告改动会影响审核哈希，提交后停止写入。

收尾顺序：完成三卡产物→真实验证→各卡报告/检查点→reports/BATCH-003.md→权威范围检查，将输出写到 reports/evidence/M00.0.03/final-scope.txt 后再复跑一次以包括日志自身→manifest/report 一致性复算→taskctl validate 与 next 留档。taskctl next 在独立复核前仍停 M00.0.01、accepted=6 是正确结果，不要伪造三卡 accepted 来推动它。

45 分钟写检查点；单卡超 90 分钟仍无可验收结果、同因失败两次、必须改公共契约或超范围时，记录已完成工作和最小阻塞并停止。此次目标是可重建工程骨架，不是增加报告数量。完成后集中提交，我方独立复核，不自动继续下一批。
