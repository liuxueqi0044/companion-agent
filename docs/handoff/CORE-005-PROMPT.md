你是本轮实现者，仅在 `C:\Users\xiayu\Documents\Codex\companion-agent-core` 开发，原 companion-agent 只读。

先读AGENTS.md、docs/handoff/CURRENT-TASK.md、reviews/CORE-004.md，再读完整任务docs/handoff/CORE-005.md、冻结架构docs/handoff/core-005/contact-runtime-contract.md及同目录scope/baseline。

CORE-004已复核并由架构师修正。当前20项有效成果为reports/core-004-architect/final-artifacts.json，SHA256=c23ed1e5b22494dd361bfc8b0a0055d0447a7e07d13eb456a4436efc0bd4b979。保留补丁，不能按旧submitted manifest回滚。

连续完成CORE-005的A→B→C→D→E：共享串行执行槽、主动联系窄协议、单次联系协调器、停止/政策/核对闭环、真实离线组合验证。各包checkpoint后继续，全部完成统一submitted，不能自写accepted。

主动联系默认关闭，开启后模型选时并到时重评估，普通聊天不提前宣布时间；明确提醒独立。复用已有服务，不建调度系统。初始视觉由架构师负责，本批不写UI；不接真实模型/HTTP、不读凭据、不安装、不创建额外会话/子代理、不Git/部署、不执行生成代码。只用合成provider与真实本地服务，历史数据冻结。

原Python101/Node105与架构师回归原样保留并复跑；补新测试、Schema、四份离线演示、manifest和scope。边界内缺陷直接修正；范围外缺陷记录最小反例，不擅改旧契约/基线。最后报告放reports/core-005，如实列失败和not_run，停止等待独立复核。
