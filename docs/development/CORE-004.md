# CORE-004 · 可信前台执行链

## 部件与事实

`execution/provider.mjs` 定义可信异步 ModelPort 的默认不可用实现及输出外壳校验；`execution/runner.mjs` 只协调一个 host/turn。它既不存储任务状态也不装入模型代码。实际 turn、授权、action、CSV task、worker 和事件仍由 Python/SQLite 服务决定。`turn.fail-generation` 是带 UUID ticket 的狭窄失败动作；Schema 源是 Pydantic。

外层只在信任的 Node 构造点注入 provider。`respond(context,{signal})` 的 context 不含 ticket；响应仅 `{decision,displayableSummary?}`，再由 Python 对 decision 和授权作严格验证。provider 不通过环境、页面正文、动态 import 或任意路径加载。默认未配置返回 `model_not_configured`，不会调用 begin。

## 调用和生命周期

1. 可信应用明确提交 turn 和授权、选中后调用 `app.work.startSelected()`，或直接在可信宿主调用 `runner.run({turnId})`。runner 不创建 turn、action 或授权。
2. 确认 begin ticket 后调用 provider，一次 accept；若业务返回 `model_failed/context_changed` 立即停止。确有 ready action 才 execute，最多一次 `worker.run-next`，然后读取原 turn。worker 处理全局队列，可能先处理其它任务；此时原 task 保持 queued，显示 `waiting_for_worker`。
3. 确认失败时只尝试一次当前 ticket 的 `turn.fail-generation`。begin/accept/execute/worker 写入回执未知或目标不匹配时标记 `needsReconciliation`，不能自动重试原写。`reconcile()` 只读；`runLocalOnce()` 仅对已确认 queued 的 CSV task 明确推进一次。
4. 用户停止先撤销该 run 的后续资格、发 AbortSignal，随后用固定 command ID 调用 `turn.stop`。权限撤销与 worker 退出是两种事实。`dispose()` 及时返回但 provider 忽略取消时仍保持 host 所有权；`whenIdle()` 只在 provider、host 和必要清理真正结算后完成。运行中的 host 不能由第二 runner 抢占。

`createProductApplication({host,intent,runner?})` 可选接线，仅传已确认 session 的 turn ID；切换视图不自动停止。应用不持有 runner/host 的生命周期。快照只含展示投影，ticket、CSV 正文和异常详情不在其中。先 dispose runner、记录未结算状态并等待可用的 idle 边界，再 dispose 应用与 host。

## 已验证范围与缺口

离线测试覆盖同步重入、timeout/abort 迟到、各阶段 stop、窄票据失败、未知写入、上下文失效、全局 worker 先处理其它任务、真实 Node→Python→SQLite→CSV 结果及重开。演示的模型决策明确为合成数据，真实模型 HTTP/凭据访问为零。语义理解、真实模型适配、原生隔离、后台常驻、系统通知、产品页面和视觉均未运行验收。
