# CORE-002 · 可重开、可修改、可停止的个人 AI 本地核心

状态：implementation submitted，等待独立复核。仅在独立 `companion-agent-core` 工作区开发；没有合并到原项目。

## 实际能力

- v2 产品 SQLite 记录 turn/context 签名、提醒 revision/命令日志、停止意图和稳定 task.cancel 命令。新根直接 v2；旧 v1 必须由可信宿主显式 `runtime.migrate {expected_version:1}`。迁移在一个事务中，验证 v1 结构与身份，旧生成票据失效，其他业务 ID 与记录保留。
- 普通生成与主动到期复核共用 `services/product/context.py` 构建真实模型输入。检索先排除临时/遗忘来源再截 12 条，普通历史只取当前 turn 之前；签名只包含稳定模型输入及权限版本。新的同会话输入、已展示的回复或可检索记忆变化会使旧结果失效。
- `conversation.list/turns` 在 turn 原日志上做序号快照和 keyset 分页，重开后可按 ID 找回完整 `turn.read`。短摘要不带 CSV 原文、票据、权限或自动联系时间。
- 用户明确提醒可 read/list/revise。修改与取消需 revision CAS，原命令 replay 在 CAS 前判定；投递串行化并推进 revision。主动联系关闭不关闭提醒。
- `turn.stop` 先持久撤销权限，再对已知任务调用原 task.cancel。跨库不能承诺原子；取消回执不等于 worker 已退出。未知 submit 保留原 action ID，稳定 stop/cancel ID 支持崩溃后重放。
- `apps/desktop/product/session.mjs` 是可信宿主内部的无视觉控制层。选择代次挡住迟到的读回执，停止目标在点击时固定；未知提交用原命令重试，snapshot 不泄漏底层 host/ticket/内部计划。

## 核对与限制

回归命令、退出码与原始输出见 `reports/core-002/evidence/`；最终判定见 `reports/core-002/report.json`。真实模型、HTTP、凭据读取均为 0。唯一模型回执是明确标记的合成测试数据。Node/Python/SQLite/CSV 链路使用全新测试根，真实本地 worker 子进程已观察取消。

原生 Electron 隔离、系统通知、真实模型语义、系统级调度和初始视觉 UI 均未执行。本批不会自动运行或预览模型生成页面。数据库 v2 只是在本地产品层的演进，wire 仍为 `product-core/1`。原 `companion-agent` 工作区及旧 CORE-001 报告、运行库没有修改。

架构师可从 `docs/development/frontend-handoff.md` 的 CORE-002 小节直接接线；输入契约与投影字段见 `packages/contracts/product-core/README.md`。
