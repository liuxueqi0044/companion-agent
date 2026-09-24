# 非视觉本地桥（开发接线）

`host/bridge.ts` 只用于未来可信 Node main，固定 `.venv` Python、脚本、cwd、最少环境与独立本批 runtime；不会接收页面提供的进程参数。每个 action 启动一个受控 Python 子进程，`worker.run-next` 有独立 slot，短请求可并行。超时、损坏回执和进程退出均不自动重试写操作；`outcome_unknown` 必须由调用者读回确认。

`client/controller.ts` 只依赖 `BridgePort` 的 `invoke(action,payload)`，可以在无 Node 能力环境导入。它维护快照、事件 seq、分页、订阅与清理；仍需未来 main/preload 安全接线。本包没有 Electron/IPC、renderer 组件或产品视觉。

R1 生命周期：`invoke` 的错误回执可以先于子进程退出；`diagnostics().activeProcesses` 与短请求/worker 槽直到实际 `close` 才释放。`dispose()` 多次调用共享同一收尾 Promise，正常返回 `{closed:true,activeProcesses:0}`；可信超时届满若仍有 child，返回 `{closed:false,activeProcesses:n}`，需按诊断保留未退出状态，不可当作业务取消或进程已退出。EPIPE/超限后停止收集字节并请求终止，但不以 `kill()` 返回值当退出证据。

client 的 `watching` 只代表当前显式观察：`stopWatch()` 使首次快照、事件和随后的刷新迟到结果失效；再观察必须显式调用 `watchTask()`。`refreshSelected()` 是一次读取，不会重新启动轮询。`profileStale`、`taskStale`、`resultStale` 分开保留，汇总 `stale` 不会被一次 profile 读取洗掉任务未知回执；连接成功也不意味着任务/结果已重新核对。`runNext/recover` 的旧回执返回原调用者，不更新切换后的新任务视图。详情见 `reports/evidence/BATCH-016-R1/frontend-handoff.md`。

局部检查：

```text
node_modules/.bin/tsc.cmd -p apps/desktop/bridge/tsconfig.json --noEmit
node node_modules/vitest/vitest.mjs run --config tests/integration/desktop_bridge/vitest.config.ts
node_modules/.bin/tsc.cmd -p apps/desktop/bridge/tsconfig.demo.json
node reports/evidence/BATCH-016/build/apps/desktop/bridge/demo.js
```

最后一条使用固定 BATCH-016 开发根，先检查最近 100 个任务及页边界，遇待处理任务即停止；只输出本次虚构任务的状态、金额、input hash、来源引用和 `requirements_interpretation=not_run`。

R1 回归仅运行局部 Vitest 配置和 Python unit，并将所有临时写入置于 `reports/evidence/BATCH-016-R1/tmp/`；本轮不运行上述固定 runtime 的 demo 命令，也不运行会 bootstrap 旧库的旧 CLI 场景。
