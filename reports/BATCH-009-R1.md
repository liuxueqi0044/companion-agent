# BATCH-009-R1 · 工作台编辑保真与输入切换一致性

状态：**submitted，等待独立复核**。派工 `docs/handoff/BATCH-009-R1.md`；基线 `sha256:bb07111734d2a265b757714cba4dc184a5771d46920dd2ad4c0433983aed30e0`；累计 accepted 仍为 12。A 协议与 C DeepSeek 离线准备冻结，未修改其文件或证据。

## 修复

- 单元格使用原生多行 textarea：Enter 换行，Ctrl/⌘+Enter 或按钮保存，Esc 取消；输入法组合期间不触发快捷键。无更改保存保留 CRLF 和空白原值；实际编辑使用 LF，原 CSV/快照和来源不变。
- CSV 文件、JSON 草稿、需求/CSV 手工改动、核对安装及页面 deactivated 共用输入意图。旧异步成功/失败/finally 与替换候选均不能污染较新选择；离开页面保留草稿和未提交文字，清掉弹层与 busy。

## 验证与边界

新生产 bundle DOM 多行 4 组、竞态 9 组通过；原 B9 6 项 Vitest、原演示 6 组 DOM、原工作台 6 组 DOM，以及局部 production build 与完整 vue-tsc 均通过。日志在 `reports/evidence/M00.4.02/BATCH-009-R1/`。manifest 纳入先前必要源码/测试/来源和本批新回归，SHA-256 `11606b8a7a61f0e441448ce513417e89cb3d9950e8e32e420cb53a63814e2c1c`；报告 `reports/M00.4.02.json`，checkpoint `reports/M00.4.02.checkpoint.md`。本批范围检查、复算和 taskctl 记录同证据目录。

没有模型、账号、官方 Agent 或额外会话请求；未搜索密钥、未重试被拒绝的截图路径。视觉可落盘图片仍缺，原 `M00.4.02-A02` 保持 **not_run**，整卡不自写 accepted。
