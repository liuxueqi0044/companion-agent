# Companion Agent / Personal AI

一个围绕个人持续成长的 AI 原型：记住用户明确提供的偏好，执行实际任务，并逐步支持由 AI 编写代码来改变自己的界面和能力。

**当前是开发中的原型，并非可交付的完整 Personal AI 产品。** 本仓库保留 BATCH-015 基础、已独立复核的 CORE-006，以及架构师实现并自验到 **CORE-010** 的个人空间和流式对话代码。这是源码备份，不代表原开发工作区全部后续变更已完成合并或产品已经发布。各批次的 `submitted` 与独立复核结论分别保留在 `reports/` 和 `reviews/`；最新结论见 [CORE-006 复核](reviews/CORE-006.md)。

## 已实现

- Python 本地身份、显式偏好、SQLite 修订、幂等操作、历史与撤销。
- 本地 CSV 核对任务、精确金额计算、来源引用、持久结果、取消、崩溃恢复和重试。
- Vue 输入与来源核对工作台实验，以及 HTML/CSS/JS 三文件包、静态校验、宿主窄桥、版本恢复等界面代码实验。
- Codex/Hermes 协议与能力取证、离线适配实验，以及 DeepSeek 的受限适配实验。
- 个人 AI 内核：持久对话、可管理记忆、有限动作授权、明确提醒、默认关闭的主动联系、到期重评估与收件箱。
- 可信无视觉运行时：统一发送、取消、任务结果读回、消息同步与实际资源结算；复用已有 Node→Python→SQLite→CSV 链路。

需求文本的模型语义理解、完整真实 Agent 执行链、原生隔离及最终产品视觉尚未验收。生成的模型候选不随此快照发布，也不应当作可信代码运行。

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

界面接入从 [frontend-handoff](docs/development/frontend-handoff.md) 和 `apps/desktop/product/runtime/index.mjs` 开始。运行时对象只属于可信宿主，不可直接暴露给生成页面。主动联系目前由宿主显式 pulse，尚无后台常驻调度。

完整产品体验见 [交互设计](docs/product/product-experience.md)，当前完成情况见 [产品进度](reports/core-006-architect/product-progress.md)。CORE-007/008 已接通初始本机 UI 与真实 DeepSeek；CORE-010 已接通自由代码首页的浏览器预览和启用；后台通知、原生隔离和社区分享仍未完成。

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

复用已有不可变代码包与串行请求账本。生成页使用 opaque-origin iframe 与独立 CSP，不接收私人数据、模型凭据或任务/记忆写桥。浏览器隔离不等于原生沙箱或资源耗尽防护；社区代码导入及全聊天界面任意重写尚未开放。

最终 Node 235 项、Python 121 项通过。两次串行真实 DeepSeek 请求均 HTTP 200，浏览器验证了交互、生成中刷新、启用、服务重启恢复与回退；三个真实业务数据库哈希未变。架构与局限见 [CORE-010](docs/development/CORE-010.md)，当前接入入口见 [交接说明](docs/handoff/CURRENT-TASK.md)。真实候选、截图、调用记录和数据只在本地保留。
