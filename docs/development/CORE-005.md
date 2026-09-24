# CORE-005 · 主动联系与前台任务共享执行槽

## 可信宿主接线

外层在同一进程创建 **同一个 host 对象**，然后分别构造 `createTurnRunner({host,provider})` 和 `createContactRunner({host,provider})`。各角色同一 host 只能有一个未释放 owner；两者共享一个在途 lease。创建不发起 I/O。默认 contact provider 不可用；任何正常首页或会话导航都不能隐式调用 `pulse()`。仅可信宿主在显式时机调用一次 `pulse()`，本批没有 scheduler、后台服务或系统通知。

`pulse()` 首先单次调用 `reminder.deliver-due {}`，即使主动联系关闭或 provider 未配置，也能交付明确提醒。provider 未配置时不 claim、不消耗评估次数；配置后至多一次 `contact.claim {}`，无候选则结束。有候选时把删除 ticket 的深拷贝 context 交给可信 `reassess(context,{signal})`，仅接受 `{decision: FollowUpDecision}`，一次 `contact.complete` 并用只读 `contact.read` 核实持久结果。sent 以 inbox ID 为事实；defer/cancel/context_changed/delivery_window/expired 都不等于送达。provider 抛错、超时或输出损坏最多用当前 id/ticket 做一次窄失败清理。

`stop()` 只撤销当前联系评估的继续资格，不关闭全局政策、不停止前台 turn 或明确提醒。若 `contact.complete` 已发出，停止时 `deliveryUncertain` 为真；迟到提交的消息仍在 `snapshot().contactMessageIds` 和持久 inbox 中，不会被删除或再次 complete。`dispose()` 不关闭共享 host；当 provider 忽略 abort 或 host 请求未结算时，owner/lease 保留至实际 settle。先 dispose 两个 runner，分别等待 `whenIdle()`（若永不结算则报告仍 pending），再 dispose 应用和 host。

同 host 上 foreground 与 contact 同时开始时，一个返回 `runner_busy`，不会排队或互相抢占。未知写入把 host 标记 `needsReconciliation`；两条 lane 的新工作均停止，只允许持有工作的窄停止/清理以及已知 ID 的只读核对。`reconcile()` 单飞且有观察代次，只读原 plan；没有可信 ID 时返回 `no_plan`，读到 sent 可以展示已提交事实，但不能自动清除未知屏障或重放写入。这个互斥仅约束同进程、同 host 对象，不覆盖别的进程或直接 Python 调用。

## 产品显示与边界

普通 home/会话仍只显示已交付消息和任务事实；计划时间、purpose、来源正文、ticket、provider context 都不在联系 runner 快照。明确提醒的约定时间可在 reminder 明细显示。用户主动管理可用 `contact.controls` 和受限的 `contact.inspect`；普通界面不默认列计划或预告未来联系。到达的 inbox 消息可用 `inbox.explain` 查看依据，`inbox.read` 只改已读状态。

政策开关、暂停、屏蔽、记忆遗忘、新输入、过期、每日评估/消息上限由现有 Python/SQLite 事务在 claim 与 complete 时再次检查。Node 决策不是授权。未知结果只显示待核对，不把 provider 文本当作发送、任务完成或真实语义理解。

测试演示 `tools/product_core005_demo.mjs` 仅注入虚构决策，通过真实 Node→Python→SQLite→CSV 和 inbox 复开核对；不调用真实模型、HTTP 或凭据。真实时机与措辞质量、跨进程互斥、关应用后运行、网络重连、原生隔离、生成页面运行、视觉和系统通知仍未验收。
