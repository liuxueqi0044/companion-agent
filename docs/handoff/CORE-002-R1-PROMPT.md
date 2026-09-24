继续在 `C:\Users\xiayu\Documents\Codex\companion-agent-core` 开发 CORE-002-R1。

先阅读根 AGENTS.md、reviews/CORE-002.md、docs/handoff/CURRENT-TASK.md、docs/handoff/CORE-002-R1.md 和 docs/handoff/core-002-r1/scope.json/baseline.json，然后检查实际源码与冻结反例证据。

独立复核已重跑83项Python、11项Node、真实离线演示、21项manifest和Schema，均通过；但额外复现四个遗漏，因此 CORE-002 状态是 changes_requested，不能直接进入新功能。

按 R1 的 A→B→C→D→E 连续完成：阻止旧生成重试绕过新输入；处理同目标刷新和停止的乱序响应；保护每次未知提交及单飞重试；拒绝额外trigger/view的异常迁移；完成反例回归、实际子进程组合验收和文档交接。每包写 checkpoint 后继续，不逐包等待确认。

精确写集与验收以 R1 派工为准。原 CORE-002 报告、reviews、派工/基线/检查器和历史数据库保持只读。所有测试新建数据根，使用已安装运行时，验证导入根；模型、HTTP、凭据读取、额外会话/子智能体、安装、Git/部署均为0。原 companion-agent 的 R2 不属于本批。

初始视觉 UI 由架构师负责，本轮不写页面或CSS。最终仅向 reports/core-002-r1/ 提交新报告，status=submitted，测试/manifest/Schema/R1范围检查如实记录，不自写 accepted，不展开 CORE-003。

请直接开始检查和实现，连续完成五包；只在真实授权外阻塞时保留证据并停止。
