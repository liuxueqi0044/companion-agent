你是本轮实现者。只在 `C:\Users\xiayu\Documents\Codex\companion-agent-core` 开发，原companion-agent只读。

先读AGENTS.md、docs/handoff/CURRENT-TASK.md、reviews/CORE-005.md，再读完整任务docs/handoff/CORE-006.md、冻结架构docs/handoff/core-006/runtime-contract.md和同目录scope/baseline。

CORE-005已复核并由架构师直接修正。当前22项有效成果：reports/core-005-architect/final-artifacts.json，SHA256=b137509a9ec8f31109dddf1983a5f2672359d3720cae52f5f4772b075670c835。不要拿旧submitted manifest回滚补丁。

连续完成CORE-006 A→B→C→D→E：可信运行时组合、显式发送流水线、固定UI方法和真实读回、关闭与重开、离线演示及验收。每包checkpoint后继续，全部完成统一submitted，等待独立复核。

复用已有application/turn runner/contact runner，不重造业务框架。初始视觉UI由架构师负责，本轮只做接线代码；不写页面/CSS/主题，不接真实模型/HTTP、不读凭据、不安装、不创建额外会话/子代理、不Git/部署，不执行生成代码或后台循环。

严格遵守写集。保留Python121、Node142原基线和全部架构师回归，补新测试、Schema只读、五份演示、manifest/scope。报告放reports/core-006，如实记失败、未知和not_run，不能自写accepted或展开下一批。
