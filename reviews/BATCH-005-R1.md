# BATCH-005-R1 独立复核通过（仅离线准备）

B5-R1 已关闭，本段准备工作通过；M00.3.01 整卡仍 not_run，A01–A03 仍 not_run，累计 accepted=11。

- 独立复跑全部 23 项离线测试通过，含真实 Windows junction 场景。
- 原复核夹具原样重放：preflight 和 plan 都在读取任何源码内容前返回 exit 2/source_symlink；两个实际指向同一目录的 home 也被 home_symlink 拒绝。
- 正常 preflight/plan 仍通过，integration_status=not_run；23 项测试结束后本卡 tmp 为空。
- 变更 modified=6 / added=13 / missing=0 / outside=[]；三成果 manifest/result_ref 与 17 个固定来源哈希一致；holdout 未改。
- 新逻辑逐级 lstat 拒绝符号链接、junction/reparse point，并在路径检查后比较 home 实际位置。它是检查时刻的预检，不声称运行时沙箱隔离。

下一批适度扩大为两个独立目标：M00.3.01 的离线观测器与模拟子进程测试；M00.4.01 的 AIRI 组件抽取分析。M00.4.01 的唯一前置 M00.2.03 已验收，它不依赖未完成的 M00.3.01，因此可以同批顺序开展，无需放宽依赖门槛。

M00.4.02 UI 小样仍等待 M00.4.01 的独立验收。本批不启动真实 Hermes、Codex/Claude Agent、模型、账号、云端或产品服务，不把模拟事件当真实回执。
证据 reviews/evidence/BATCH-005-R1/；下一派工 docs/handoff/BATCH-006.md。
