# CORE-002 · submitted for independent review

在唯一 `companion-agent-core` 工作区完成 A→E：共享上下文签名与显式 v1→v2 迁移、可重开的会话分页、明确提醒的 CAS 修改、持久停止与真实任务取消，以及无视觉的可信 session 控制层。未制作产品页面或 CSS，未改原 `companion-agent` 工作区。

本地回归：Python **83 passed**，显式列出的 Node 测试 **11 passed**；Schema 检查通过。离线组合演示在全新根中完成 Node→Python→SQLite→CSV 计算，结果总额 `6`，重开后同一身份、会话、turn 和任务可读；提醒编辑后 revision 为 `2`。原始命令、退出码和输出见 `evidence/`。模型决定仅使用合成回执；真实模型、HTTP、凭据读取均为 **0**。

未完成的产品边界：真实语义判断、Electron 原生隔离、操作系统通知、系统常驻调度、初始视觉 UI 均为 `not_run`。未知 CSV 提交不被假定已取消，需保留原 action ID 继续核对。此报告为实现者提交，尚未经独立复核；不写 `accepted`。
