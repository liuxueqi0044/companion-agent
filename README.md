# Companion Agent / Personal AI

一个围绕个人持续成长的 AI 原型：记住用户明确提供的偏好，执行实际任务，并逐步支持由 AI 编写代码来改变自己的界面和能力。

**当前是开发中的原型，并非可交付的完整 Personal AI 产品。** 本次源码快照截至 BATCH-015；BATCH-016 是下一阶段的非视觉桌面桥接计划，尚未实现。各批次的 `submitted` 与独立复核结论分别保留在 `reports/` 和 `reviews/`，不可把提交报告视为完整产品验收。

## 已实现

- Python 本地身份、显式偏好、SQLite 修订、幂等操作、历史与撤销。
- 本地 CSV 核对任务、精确金额计算、来源引用、持久结果、取消、崩溃恢复和重试。
- Vue 输入与来源核对工作台实验，以及 HTML/CSS/JS 三文件包、静态校验、宿主窄桥、版本恢复等界面代码实验。
- Codex/Hermes 协议与能力取证、离线适配实验，以及 DeepSeek 的受限适配实验。

需求文本的模型语义理解、完整真实 Agent 执行链、原生隔离及最终产品视觉尚未验收。生成的模型候选不随此快照发布，也不应当作可信代码运行。

## 目录

| 目录 | 内容 |
| --- | --- |
| `services/personal_ai` | 本地身份与偏好 |
| `services/local_tasks` | 确定性任务、存储、worker |
| `services/control` | 控制服务骨架 |
| `tools` | 本地 JSON CLI 与任务验证器 |
| `apps/desktop` | 桌面 renderer 工程骨架 |
| `packages/contracts` | 数据契约与生成的 JSON Schema |
| `tests/unit` | 单元与本地进程测试 |
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

本次上传副本实测：**54 passed，1 skipped**（Windows symlink 权限）。复测复用了原工作区的 Python 解释器，并显式将 `PYTHONPATH` 指向此副本；首次未指定时，原环境的 editable 安装造成 CLI 与子进程加载不同 checkout，出现 1 项失败，统一导入根后全组通过。代码未为此次复测作改动。新 checkout 应使用自己的 `uv sync --locked` 环境。

## 快照范围与限制

本仓库来自独立上传副本，原始开发目录和验收基线未改动。源码、合成 fixture、依赖锁、架构与批次摘要保留；凭据、运行数据库、缓存、构建输出、原始调用记录、私有 holdout、历史完整归档和机器相关基线不上传。

`reports/`、`reviews/` 和旧派工中的部分链接指向仅保留在原开发环境的证据。历史 manifest/scope 检查和部分模型实验测试依赖这些文件，不能在此快照中完整重放；不应将缺失证据替换为虚构结果。源码文件的复制哈希见 `SOURCE-SNAPSHOT.json`。

API 密钥不包含在仓库内。不要运行历史 live 脚本来验证源码快照；真实模型接入应另行配置并授权。初始产品视觉继续由产品架构负责人设计，开始前与用户确认推理档位；此仓库不增加新的 UI 设计。
