# BATCH-003 独立复核

结论：M00.0.01、M00.0.02、M00.0.03 三卡 **accepted**，累计 **9 卡 accepted**。原报告和成果文件未修改，原始提交已完整归档。

## 实际验证

- 17 个成果哈希与 3 个 manifest/result_ref 一致；所有命令日志路径存在。
- 提交边界范围为 modified=1、added=78、missing=0、outside=0；旧 accepted 产物与 holdout 不变。
- 三个原检查器复跑：20/20、27/27、37/37。
- 原 npm 夹具缺少桌面 workspace，不足以证明最终工程完整重建。复核者在干净目录复制全部最终配置与桌面源码，独立 npm ci、核对 workspace 链接与 Vue 安装、typecheck、Vite build 全过，锁文件未改。此缺口已用真实证据补齐，无需再发一轮仅为补日志的返工。
- 在实际 renderer 源码副本注入错误类型，typecheck 输出 TS2322、退出码 2，排除空检查假通过。
- Python 在新的隔离目录按 uv.lock frozen sync 重建，锁文件未改；项目外 -I 导入和 pytest 2 项 smoke 均通过。

## 记录纠正与裁决

1. Python 安装器虽 TargetDir 在项目内，InstallAllUsers=0 仍会做当前用户注册。只读实测 HKCU/Software/Python/PythonCore/3.13/InstallPath 指向项目的 .local-tools/python-3.13.15。不能称为“完全未触及用户环境”。没有历史注册表快照，不反推全部变化；不擅自卸载或清理注册表。此次保留现有可工作工具，后续仅复用，不再运行安装器。该偏差如实登记，不影响卡内导入/测试/无付费调用验收。
2. M00.0.02-A03 正式要求是“不得批量加入依赖”；本次直接检查依赖满足。摘要把 A03 写成 typecheck 不改变原验收定义，typecheck 已作为额外派工检查通过。
3. E1/E2 在 BATCH-002-R1 已关闭，不能因摘要旧文案再次当成未决阻塞。
4. Electron 是选定但尚未安装/验证的后续组件，未改变 selected 文件为 deferred；本次构建成功不代表 Electron 窗口、Agent 接入或完整产品可用。
5. 我方未再次进行浏览器预览；renderer 验收依据源文件、独立构建与产物检查，明确不扩大到窗口视觉或浏览器网络行为证明。

## 下一轮

BATCH-004 只做 M00.0.04 单任务验证入口与 M00.0.05 FastAPI 健康服务。完成后集中复核，不提前启动 Hermes/模型调用。派工和基线另行准备。

权威裁定：reviews/M00.0.01.json、reviews/M00.0.02.json、reviews/M00.0.03.json。
独立证据：reviews/evidence/BATCH-003/。原始提交：reviews/history/BATCH-003/submitted/。
