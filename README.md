# Companion Agent / Personal AI

一个围绕个人持续成长的 AI 原型：记住用户明确提供的偏好，执行实际任务，并逐步支持由 AI 编写代码来改变自己的界面和能力。

**当前是开发中的原型，并非可交付的完整 Personal AI 产品。** 本仓库保留 BATCH-015 基础、已独立复核的 CORE-006，以及架构师实现并自验到 **CORE-021** 的个人空间、完整界面替换、成果工具与后台运行代码。这是源码备份，不代表原开发工作区全部后续变更已完成合并或产品已经发布。各批次的 `submitted` 与独立复核结论分别保留在 `reports/` 和 `reviews/`；最近一次独立复核结论见 [CORE-006 复核](reviews/CORE-006.md)。

## 已实现

- Python 本地身份、显式偏好、SQLite 修订、幂等操作、历史与撤销。
- 本地 CSV 核对任务、精确金额计算、来源引用、持久结果、取消、崩溃恢复和重试。
- Vue 输入与来源核对工作台实验，以及 HTML/CSS/JS 三文件包、静态校验、宿主窄桥、版本恢复等界面代码实验。
- Codex/Hermes 协议与能力取证、离线适配实验，以及 DeepSeek 的受限适配实验。
- 个人 AI 内核：持久对话、可管理记忆、有限动作授权、明确提醒、默认关闭的主动联系、到期重评估与收件箱。
- 可信无视觉运行时：统一发送、取消、任务结果读回、消息同步与实际资源结算；复用已有 Node→Python→SQLite→CSV 链路。

当前源码沿用 **Windows 邀请 Alpha 0.19.0-alpha.1** 的发行配置，并加入 CORE-021 能力接入：持久聊天、记忆、成果、提醒、多步任务、目标模式和有限 Claude Code 接入已经实现。发布副本仅含 FORM / ATELIER，默认 FORM，不含社区角色素材。完整界面源码替换和恢复仍保留。当前状态、验证限制和试用流程以 [邀请试用指南](docs/product/INVITATION-ALPHA.md) 和 [CORE-019 发布说明](reports/core-019/README.md) 为准。安装 ZIP 和用户数据不随源码提交；本次不是正式安装包发布。

## 目录

| 目录 | 内容 |
| --- | --- |
| `services/personal_ai` | 本地身份与偏好 |
| `services/local_tasks` | 确定性任务、存储、worker |
| `services/control` | 控制服务骨架 |
| `services/product` | 个人 AI 业务内核、记忆、对话、联系与持久状态 |
| `services/desktop_bridge` | 核心工作区复用的本地桥接服务 |
| `tools` | 本地 JSON CLI 与任务验证器 |
| `apps/desktop` | 桌面 renderer 工程骨架 |
| `apps/website` | Morrow 英文营销官网：写实枝叶首屏、流动画廊、创作者社区与可逆滚动转场 |
| `apps/desktop/product` | 可信宿主、应用控制器、执行器与统一运行时 |
| `packages/contracts` | 数据契约与生成的 JSON Schema |
| `tests/unit` | 单元与本地进程测试 |
| `tests/product` | 核心业务与运行时回归，含架构师补充反例 |
| `tests/spikes` | 隔离的协议、界面与代码包实验 |
| `docs/architecture`, `docs/decisions` | 架构、ADR 与演进记录 |
| `docs/execution`, `docs/handoff` | 历史任务拆分与下一阶段计划 |

## 开发环境

Python 3.13、Node.js 24；具体版本与依赖以 `.python-version`、锁文件和 `docs/dependencies/` 为准。

```powershell
uv sync --locked
npm ci
npm run typecheck
npm run build
```

Vue 工作台实验有独立依赖目录：

```powershell
npm ci --prefix tests/spikes
npm run build --prefix tests/spikes
npm run typecheck --prefix tests/spikes
```

本地身份与确定性任务回归（不调用模型）：

```powershell
uv run --locked python -m pytest tests/unit/personal_ai tests/unit/local_tasks
```

这些测试会在此 checkout 的 `reports/evidence/BATCH-015/local-state/` 下创建虚构测试数据，并使用临时目录；运行数据已被 Git 忽略。Windows 不允许创建 symlink 时，相应用例可能跳过。

BATCH-015 首次上传时实测：**54 passed，1 skipped**（Windows symlink 权限）。当时复测复用了原工作区的 Python 解释器，并显式将 `PYTHONPATH` 指向此副本；首次未指定时，原环境的 editable 安装造成 CLI 与子进程加载不同 checkout，出现 1 项失败，统一导入根后全组通过。代码未为该次复测作改动。新 checkout 应使用自己的 `uv sync --locked` 环境。CORE-006 本次复测结果见下节。

## CORE-006 验证与接入

核心开发工作区独立复核结果：Python **121 项**、Node **172 项**通过，Schema 与 CORE-002 至 CORE-006 五份真实本地演示通过。数据库和 CSV 计算为实际执行，模型决策使用合成输入；不代表真实语义或真实模型已验收。上传副本的验证记录见 [发布校验](docs/development/GITHUB-CORE-006.md)。

```powershell
python -I -B tools/run_product_tests.py --tb=short
```

CORE-020 已移除产品启动器、测试和演示对固定相邻目录的依赖。使用本仓库依赖或显式绝对路径覆盖，见 [产品命令](docs/development/PRODUCT-COMMANDS.md)。`npm run check` 检查当前产品并构建实际界面，`npm test` 串行运行 Python / Node 产品测试；旧骨架命令保留为 legacy。

当前界面接入从 [CORE-011 SDK 与界面包说明](docs/development/CORE-011.md) 开始；[frontend-handoff](docs/development/frontend-handoff.md) 保留早期内核接入背景。运行时对象只属于可信宿主，不可直接暴露给生成页面。CORE-012 的后台调度复用同一执行槽，保持主动联系默认关闭。

完整产品体验见 [交互设计](docs/product/product-experience.md)，CORE-006 时点的估计见 [历史产品进度](reports/core-006-architect/product-progress.md)，最新实现范围见本文 CORE-013 节。CORE-011 已将替换范围扩展到完整界面；CORE-012 补充后台和便携运行，原生隔离与社区分享仍未完成。

## 快照范围与限制

本仓库来自独立上传副本，原始开发目录和验收基线未改动。源码、合成 fixture、依赖锁、架构与批次摘要保留；凭据、运行数据库、缓存、构建输出、原始调用记录、私有 holdout、历史完整归档和机器相关基线不上传。

`reports/`、`reviews/` 和旧派工中的部分链接指向仅保留在原开发环境的证据。历史 manifest/scope 检查和部分模型实验测试依赖这些文件，不能在此快照中完整重放；不应将缺失证据替换为虚构结果。源码文件的复制哈希见 `SOURCE-SNAPSHOT.json`。

API 密钥不包含在仓库内。不要运行历史 live 脚本来验证源码快照；真实模型接入应另行配置并授权。初始产品视觉继续由产品架构负责人设计，开始前与用户确认推理档位；此仓库不增加新的 UI 设计。


## CORE-007/008 个人空间

本机 Morrow 界面已接通聊天、显式记忆、CSV 成果、历史和联系偏好。DeepSeek 仅在可信服务端读取本机 DPAPI 凭据，产品不设调用次数额度，保留串行调用、停止和无自动重试。普通聊天显示“正在思考”，可展开公开处理摘要；工具卡展示真实执行和来源。CORE-009 已升级为真实增量输出。

工作区验证：整套 Node 202 项通过；最后的取消目标修正另有 13 项定向通过，Schema 与来源检查通过。一条真实临时对话已验证超过旧六次上限仍返回 HTTP 200。原始请求、截图、账本和运行数据保留本地，未上传。

此快照仍依赖 Windows 本机运行路径；`tools/personal_space.mjs` 支持 PERSONAL_AI_PYTHON、PERSONAL_AI_VUE、PERSONAL_AI_PORT 环境配置。密钥必须另行本地配置，不能从仓库获得。不要直接输出凭据辅助脚本的内容或执行历史 live 检查器。下一阶段见 [CORE-008 开发说明](docs/development/CORE-008.md)。


## CORE-009 流式对话与恢复

回复和公开处理摘要逐步出现，实际工具动作继续由完整输出校验后的内核执行。带会话与代次校验的本地事件流支持读取重连、历史选择恢复、服务重启后换会话和迟到回执隔离，不自动重发模型请求。

全量 Node 回归 222 项通过；最终修订另有 43 项定向通过。两条真实串行 DeepSeek 临时对话均 HTTP 200，实际观察到增量文字；本地流式 CSV 试验得到 16.00 USD。源码范围和原内核冻结检查通过。具体实现、测试边界及剩余工作见 [CORE-009](docs/development/CORE-009.md)。

截至 CORE-009，自由界面闭环尚未完成；CORE-010 已补齐首页范围的预览/启用/回退。后台主动联系、原生隔离和桌面安装仍未完成。历史统计和独立验收状态不因本次提交自动改变。原始测试对话、截图、凭据和数据库未上传。


## CORE-010 自由代码首页

在“改变这里”描述风格，让 DeepSeek 直接编写 HTML/CSS/JavaScript，独立预览后由用户启用；可继续改写、查看旧版、回退、恢复初始空间和导出源码。没有预设主题目录。作用范围是首页画布，可信聊天、记忆、导航与恢复入口保留在宿主。

复用已有不可变代码包与串行请求账本。生成页使用 opaque-origin iframe 与独立 CSP，不接收私人数据、模型凭据或任务/记忆写桥。浏览器隔离不等于原生沙箱或资源耗尽防护；截至 CORE-010，社区代码导入及全聊天界面任意重写尚未开放；CORE-011 的完整界面范围与信任边界见下文。

最终 Node 235 项、Python 121 项通过。两次串行真实 DeepSeek 请求均 HTTP 200，浏览器验证了交互、生成中刷新、启用、服务重启恢复与回退；三个真实业务数据库哈希未变。架构与局限见 [CORE-010](docs/development/CORE-010.md)，当前接入入口见 [交接说明](docs/handoff/CURRENT-TASK.md)。真实候选、截图、调用记录和数据只在本地保留。


## CORE-011 完整界面替换

默认界面和用户自定义界面现在使用同一套 `morrow.ui/1` SDK。聊天、导航、布局与输入区都属于可替换的代码包，不再局限于首页装饰。每个界面挂载有独立视图，共用持久对话、记忆和任务；更换界面不会重新启动任务，未发送草稿可保留。宿主仍拥有执行控制和独立恢复入口。

当前路径为：导出源码 → 修改多文件 JavaScript/TypeScript 与 CSS 包 → 导入 → 在合成数据中预览 → 明确授权后启用 → 按需回退或恢复默认界面。复用现有 Rolldown 与 Vue，不运行作者提供的 Node 脚本、安装命令或构建插件。**普通聊天尚未自动调用完整界面编写工具**；此前首页生成链保留为历史兼容实现。

启用后的代码包可通过获准的 SDK 范围访问业务数据，不获得原始宿主或凭据。opaque-origin iframe 与 CSP 只构成当前浏览器隔离层，尚不能承诺恶意社区代码的网络和 CPU 隔离；当前仅支持用户信任的源码。原生桌面小精灵、后台常驻通知、社区分享和可移植安装包仍未完成。构建与回归仍依赖本机相邻工作区的工具路径。

源码工作区验证：Node **249 项**、Python **121 项**通过，SDK 类型、Schema、manifest 和范围检查通过。浏览器实测了默认聊天与记忆、完全不同的工作台界面、草稿保留、默认界面恢复；本批外部模型请求为 **0**。报告保持 `submitted`，属于架构师实现及自验，未伪称独立验收。

架构见 [ADR-009](docs/decisions/ADR-009-replaceable-interface-shell.md)、[CORE-011](docs/development/CORE-011.md)，摘要见 [本批报告](reports/core-011/report.json)，继续开发请读 [当前交接](docs/handoff/CURRENT-TASK.md)。原始浏览器截图、私有数据与生成的用户代码包仅保留在本地。

## CORE-012 成果、提醒与日常运行

普通对话可生成持久的多文件文本/源码成果并下载为 ZIP，也可明确交办一个提醒。工具卡显示实际文件和提醒回执；源码不会自动执行。成果经 Python 事务与校验器落库，旧 CSV 能力继续保留，完整替换界面可通过相同 SDK 读取成果。

后台调度独立于网页，在同一个运行时内串行检查到期事项。主动联系默认关闭，开启后由模型选时并到期重评估；可以决定取消联系。消息游标、暂停与系统提示开关持久保存，崩溃不自动重发模型请求。托盘提供打开、恢复、暂停、配置 DeepSeek 和退出，关闭浏览器后服务可继续运行。

离线 Windows 包构建复用开发机已安装的 Node、Python、Vue 和 Rolldown；附带 SHA-256 清单和当前用户安装脚本。不包含凭据或数据，不设置开机启动。需要 Windows 10/11 x64 与 PowerShell 7，是未签名开发预览。源码默认数据根 `.product-data` 与托盘默认 `%LOCALAPPDATA%/Morrow/data` 分开；`-HomePath` 可明确指定。构建脚本目前依赖相邻开发工作区，ZIP 不随 Git 提交。

可选编码连接器通过独立 Codex CLI 配置使用 DeepSeek，只在显式配置 `PERSONAL_AI_CODEX` 且输入 `/code` 时触发。合成子进程已验证协议和取消，但官方 CLI 的真实模型调用仍未运行；目前产出可下载源码，不是任意仓库的自动开发执行环境。

最终回归：**Python 133 项、Node 259 项**；SDK 类型、Schema、范围、包安装与两次冷启动通过。三次真实串行 DeepSeek 检查验证记忆保存/使用、成果、提醒与到期联系重评估；原业务数据库升级前后哈希一致。系统托盘/通知的实际视觉、另机安装、官方编码 CLI 连通及敌对代码原生隔离仍须分别验收。整套界面的自然语言作者工具链按用户决定后置。

详见 [CORE-012 架构与限制](docs/development/CORE-012.md)、[本批报告](reports/core-012/report.json)。报告为架构师自验 submitted，原始证据、完整本地 manifest 与便携 ZIP 保留在开发工作区；发布副本的文件哈希另列于 `reports/core-012/artifacts.json`。


## CORE-013 私人工具与原生本地 Alpha

现在可让 AI 保存一个反复使用的文本/CSV 工具：AI 编写 SQLite 查询、给出虚构样例，程序实际运行验证后保存不可变版本；换新材料即可调用。提供工具库、源码/样例查看、修改、停用、版本回退和结果下载。工具不执行任意 Python/Shell，也不将样例通过当成所有输入都正确。

新增 Electron 44.4.4 原生窗口、托盘和独立恢复。授权界面可通过 SDK 改变大小、无边框、透明与置顶，默认 UI 仍可完整替换。关闭窗口不终止后台服务；“一句话自动改写整套界面”按产品决定继续后置。原生 renderer 使用上下文隔离、沙箱、窄 IPC 和网络/导航限制；它仍不是已审计的敌对社区代码通用沙箱。

Windows 本地 Alpha ZIP 已在开发机完成独立安装、两次冷启动与保存工具重开验证，包含 Node/Python/Electron/Vue 等运行时；ZIP 不在 Git 中。源码服务现在优先使用本 checkout 的 .venv 和 node_modules，也支持显式环境路径。准备本地依赖后可启动：

```powershell
uv sync --locked
npm ci
# 浏览器载体（默认不调用模型）
node tools/personal_space.mjs
# 可选原生窗口：下载校验固定官方 Electron 分发，再启动
pwsh -File tools/fetch_electron.ps1
pwsh -File tools/start_morrow.ps1 -Offline
```

DeepSeek 凭据由用户另行在本机配置；不运行历史 live 脚本来验收源码备份。部分历史测试及发行构建脚本仍保留相邻开发工作区路径，见交接说明；便携应用不依赖 donor 目录。

本批自验：Python **153 项**、整套 Node **263 项**，最终调整再跑 5 项定向（与全量重叠）；10 项实际原生检查、SDK/Schema/范围/安装完整性通过。两个串行真实 DeepSeek 请求完成工具创建与新 CSV 复用，旧三份业务数据库升级前后哈希一致。状态为 submitted，未伪称独立 accepted。

当前交付定位是**可试用的 Windows 本地 Alpha**。系统通知实际送达、长时间睡眠唤醒、另一机器安装仍待验收；官方编码 CLI 实连、云端常驻、TTS、社区分享和通用电脑操作不属于本批完成项。没有把整个长期 Personal AI 愿景称为已完成。

从 [试用指南](docs/product/LOCAL-ALPHA.md)、[CORE-013 架构](docs/development/CORE-013.md)、[当前交接](docs/handoff/CURRENT-TASK.md) 开始；[本批报告](reports/core-013/report.json) 记录具体边界。发布文件哈希见 reports/core-013/artifacts.json，原始证据与完整本地 manifest 不上传。


## CORE-014 同一任务的执行、观察与修正

用户附上 CSV 后，一个请求可以连续进行只读查询、读取真实结果、修正失败、保存报告或创建并使用已有协议的工具，最后再回答。模型每一步会收到真实动作回执与有限结果样本；报告文件存在不代表正文被独立证明正确。普通聊天仍只需一次回应。

计划、步骤和动作关联持久化。停止后撤销权限，网络错误不自动重试，重启后由用户继续；已经确认的动作不重放。连续八次判断后暂停，可显式继续，单任务最多 64 次判断；这不是账户调用预算。默认界面可展开公开摘要、失败与成功记录，并下载成果；完整替换界面使用相同 workflow SDK。

本批自验：**Python 172 项、Node 271 项**全部通过，SDK/Schema/范围和 57 项本地 manifest 验证通过。真实 DeepSeek 使用虚构 CSV 连续三次请求，完成 A=5/B=4 的查询→观察→报告→最终答复；失败修正链另有离线脚本模型与实际执行器验证。桌面和 390px 界面已实际观察、截图留本地。源版与安装版分别 10 项原生检查通过，安装包自带 Node/Python 的多步任务也通过；1,742 项发行文件哈希核对通过。

原试用数据在备份后冷启动升级，30 张原有表的行内容保持一致，新增两个 workflow 表。代码为架构师实现及自验 `submitted`，未代写独立 `accepted`。整套界面自然语言改写仍按用户决定后置，其余长期扩展亦不计为完成。

见 [CORE-014 架构](docs/development/CORE-014.md)、[试用指南](docs/product/LOCAL-ALPHA.md)、[本批报告](reports/core-014/report.json)。本地完整 manifest 和原始证据不上传；本次公开文件哈希见 [artifacts.json](reports/core-014/artifacts.json)。

## CORE-015 多智能体目标与 Claude Code

显式进入“目标模式”后，主控模型拆分任务和验收标准，按依赖分派工作者，读取真实成果后验收或退回。默认 DeepSeek Pro 指挥/验收，Flash 执行；三种角色可独立配置，当前请求串行。角色、依赖、轮次和实际证据由宿主持久保存，前端可展开查看。普通聊天保持原入口。

已实际接通本机 Claude Code 2.1.215，经 DeepSeek 在全新工作目录写入 sum.mjs 和 README.md，宿主检查语法、绑定源码哈希并交主控验收。CLI 不继承登录、hooks、插件或 MCP；只开放有限文件工具，不自动安装依赖或执行任意程序。语法通过不代表行为正确，模型验收也不代表独立人工验收。没有使用 Codex/OpenAI 账号。

自验：Python 194 项；Node 全量 282 项，最终协议修订后 12 项定向回归；实际原生检查 10 项，便携包自带运行时的目标闭环通过。真实非流式和流式目标完成 A=5/B=4 查询、报告和验收；试验中暴露的协议兼容问题已修正，失败样本和手动继续记录保留。原 SSE 大帧重复推送导致页面空白的问题亦已修复。原 32 张表与共享账本保持，新增四个目标表。

见 [目标模式使用说明](docs/product/GOAL-MODE.md)、[架构](docs/development/CORE-015.md)、[报告](reports/core-015/report.json)。本地便携包、凭据、用户数据和原始证据不上传；发布文件哈希见 [artifacts.json](reports/core-015/artifacts.json)。状态仍为 submitted。整套 UI 自然语言作者、任意仓库运行/测试、云端和通用电脑操作继续后置。


## CORE-016–019：独立界面与邀请测试交付

FORM 提供简洁入口，ATELIER 使用双页手账布局；它们共享对话、草稿、记忆、工具和目标状态，仍能替换完整 UI 源码。新增版本安装登记、保留个人数据的卸载、首次使用说明、托盘帮助和脱敏诊断、离线 Check、通知去重与唤醒重评估。蓝鲸原型留在本地，其图片和编码模块不发布。

开发机验证：Python 全量 219 项；新增打包回归后定向 10 项（与全量重叠），Node 304 项，原生 12 项。实际 DeepSeek 共 4 次请求，包含一次格式失败和一次显式继续；继续时没有重复执行已成功的查询。原始失败记录保留，不能据此宣称模型格式错误已根治。

本次上传副本的重新验证、来源哈希及与开发版的必要差异见 [发布验证](docs/development/GITHUB-CORE-019.md)。另一电脑、真实睡眠唤醒、通知人工可见及代码签名仍未完成。整套 UI 自然语言作者、云端、TTS、社区和通用电脑操作继续后置。


## CORE-020：可靠性修复

修复强退残留锁和长对话上下文溢出，长期记忆改为全记录相关性检索与偏好优先；默认工程命令接到实际产品。历史无主空锁需确认旧进程退出后处理，语义记忆及旧 JavaScript 全量类型化仍未完成。原 0.19.0 安装包未重建。发布验证、限制和来源见 [CORE-020 报告](reports/core-020/README.md)。


## CORE-021 插件与能力接入

支持标准 Skill、Codex/Claude 插件中的可移植组件与 MCP 配置导入，能力默认停用。
用户在可信管理页明确连接服务、选择只读工具并启用；支持不可变版本、恢复、
能力搭配和仅含引用的分享。模型按需读取 Skill/工具参数并通过实际执行回执
继续处理任务。初始附带三个原创 Skill。

使用官方 MCP SDK 的 stdio / Streamable HTTP 传输，包含参数校验、工具定义
漂移检查、取消、进程关闭和崩溃账本。不支持全部厂商插件、自动安装、OAuth、
MCP Apps、写入工具或厂商专属 hooks/subagents。连接需用户明确信任；只读声明
不构成操作系统沙箱。

本次同步保留 FORM/ATELIER 邀请发行配置，没有重建安装包或发布官网。架构师
自验与独立验收状态分开记录；历史报告中的 git_push=not_run 描述当时状态。
此次源码同步、复测与文件哈希见 [发布记录](reports/core-021/publication.json)。
使用方式见 [能力指南](docs/product/CAPABILITIES.md)，边界见
[架构说明](docs/development/CORE-021.md)。

## Morrow 英文营销官网

已确认的新版官网源码位于 [apps/website](apps/website/README.md)，包含写实枝叶首屏、曲面流动画廊、创作者社区、两段可逆滚动转场，以及桌面/手机布局。它是独立营销前端，不替换现有桌面产品，也未接入线上账号、支付或安装包服务。

```sh
cd apps/website
npm ci
npm run check
npm test
npm run build
npm run preview
```

完整素材、许可和验收范围见 [官网发布说明](apps/website/docs/GITHUB.md)。本次仅提交源码，未公开部署网站或发布桌面安装包。
