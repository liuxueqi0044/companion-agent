# Companion Agent / Personal AI

一个围绕个人持续成长的 AI 原型：记住用户明确提供的偏好，执行实际任务，并逐步支持由 AI 编写代码来改变自己的界面和能力。

**当前是开发中的原型，并非可交付的完整 Personal AI 产品。** 本仓库保留 BATCH-015 基础、已独立复核的 CORE-006，以及架构师实现并自验到 **CORE-012** 的个人空间、完整界面替换、成果工具与后台运行代码。这是源码备份，不代表原开发工作区全部后续变更已完成合并或产品已经发布。各批次的 `submitted` 与独立复核结论分别保留在 `reports/` 和 `reviews/`；最近一次独立复核结论见 [CORE-006 复核](reviews/CORE-006.md)。

## 已实现

- Python 本地身份、显式偏好、SQLite 修订、幂等操作、历史与撤销。
- 本地 CSV 核对任务、精确金额计算、来源引用、持久结果、取消、崩溃恢复和重试。
- Vue 输入与来源核对工作台实验，以及 HTML/CSS/JS 三文件包、静态校验、宿主窄桥、版本恢复等界面代码实验。
- Codex/Hermes 协议与能力取证、离线适配实验，以及 DeepSeek 的受限适配实验。
- 个人 AI 内核：持久对话、可管理记忆、有限动作授权、明确提醒、默认关闭的主动联系、到期重评估与收件箱。
- 可信无视觉运行时：统一发送、取消、任务结果读回、消息同步与实际资源结算；复用已有 Node→Python→SQLite→CSV 链路。

真实 DeepSeek 对话、记忆、成果和提醒已在本机验证。CORE-012 提供 Windows 托盘与便携开发包构建，已验证包内运行时冷启动；官方 Coding Agent 真实模型连通、原生隔离、系统通知视觉验收和跨机器安装仍待完成。生成的模型候选不随此快照发布，也不应当作可信代码运行。

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

Node 测试与五份演示目前复用开发机器固定的相邻路径 `../companion-agent/.venv/Scripts/python.exe`；它们尚未包装为可移植的一键安装工具。在其它机器运行前需要准备该路径或另行改造测试环境配置，不要把缺少本地解释器当作产品测试通过。可信宿主工厂本身接受显式的 `python`、`workspace` 和 `dataRoot` 配置。

当前界面接入从 [CORE-011 SDK 与界面包说明](docs/development/CORE-011.md) 开始；[frontend-handoff](docs/development/frontend-handoff.md) 保留早期内核接入背景。运行时对象只属于可信宿主，不可直接暴露给生成页面。CORE-012 的后台调度复用同一执行槽，保持主动联系默认关闭。

完整产品体验见 [交互设计](docs/product/product-experience.md)，CORE-006 时点的估计见 [历史产品进度](reports/core-006-architect/product-progress.md)，最新实现范围见本文 CORE-012 节。CORE-011 已将替换范围扩展到完整界面；CORE-012 补充后台和便携运行，原生隔离与社区分享仍未完成。

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
