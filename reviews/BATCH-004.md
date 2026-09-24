# BATCH-004 独立复核

结论：**M00.0.04 与 M00.0.05 均 changes_requested；累计仍为 9 卡 accepted。** 下一轮为 BATCH-004-R1 修订，不解锁 Hermes。

## 已通过的核对

- 原有两组 Python 测试独立复跑：130 passed（10.20 秒）。
- 写集 modified=4 / added=34 / missing=0 / outside=0。
- 10 个成果、两份 manifest/result_ref、命令日志路径一致，holdout 与旧派工未变。
- 健康路由、无密钥运行、导入不联网已有实际测试；未进行模型或账号调用。

## 必修的四个问题

1. **B4-R1 / P1，M00.0.04**：Vitest 的位置参数是字符串过滤。只允许 `allowed.test.ts`，实际还执行了 `allowed.test.ts.extra.test.ts`，白名单外模块写出标记文件。必须在模块执行前约束精确文件集合，不能仅事后报错。
2. **B4-R2 / P1，M00.0.04**：py 任务同时声明 Python 与缺失 TS 测试，当前直接丢弃 TS 路径并返回 passed。架构裁决：本轮对不支持/混合扩展名整体 fail-closed，在任何子进程前 not_run；后续需要混合执行时再扩展，不能现在制造部分成功。
3. **B4-R3 / P2，M00.0.04**：没有 testcase、skipped=-1 的 XML 会被计算为“2 collected / 3 passed / -1 skipped”并 passed。补报告结构、计数与用例状态一致性校验，覆盖 pytest 与 Vitest 的异常数据。
4. **B4-R4 / P2，M00.0.05**：默认 `create_app()` 使用 `Settings()`，并未调用环境解析。新进程提供非法端口/环境值，模块 app 和工厂仍悄悄使用默认配置。需要把 `Settings.from_env()` 接到默认入口，显式注入仍优先。

M00.0.05 原卡 A01–A03 本身通过，但“设置从环境读取并验证”的开发步骤与派工交付要求没有接到实际入口，因此整体 changes_requested。

## 新模型接手

下一执行者为用户手动打开的全新 Codex GPT-6 Sol 对话，定位是本批实现者，不能给自己写 accepted。当前任务不会创建该对话或子智能体。
新对话只需读取 AGENTS.md、docs/handoff/BATCH-004-R1.md、本复核及两张逐卡 JSON，再按需读取代码/测试/原卡。原始提交在 reviews/history/BATCH-004/submitted/；反例日志在 reviews/evidence/BATCH-004/。

修订仅限四个问题及相关测试/报告，不重新安装依赖、不展开 M00.3。此前 E1/E2 已裁定关闭，不因旧摘要措辞重新打开。
