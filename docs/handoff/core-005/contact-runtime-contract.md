# CORE-005 · 主动联系执行层契约

架构师冻结，2026-09-24。工作区 `C:\Users\xiayu\Documents\Codex\companion-agent-core`。

## 产品边界

用户开启主动联系后，模型在已有turn决策中提出时间；到时重新判断send/defer/cancel，而非定时盲发。普通聊天、首页和任务活动不预告“几点我会找你”。明确提醒独立，显示约定时间，不依赖主动联系开关或模型。

复用ContactService、followups/inbox/events/reminders、Policy、FollowUpDecision；保留七天窗口、日消息/评估上限、三次评估上限和当前上下文/记忆/排除来源检查。DB仍v2，不建第二套队列。本批仅交付可信Node显式pulse()，不开定时循环、后台服务、系统通知或网络端口；合成provider只在测试/演示。

## 1. 共享执行槽

把现有runner的同host对象owner/slot登记抽为execution内部模块。前台turn和contact角色各可有一个未释放owner，但共用一个在途slot；第二个同角色owner拒绝。构造无IO，默认自动按host对象共享，不能通过注入第二个gate绕过互斥。

- run/runLocalOnce/reconcile/contact pulse/reconcile已启动的host操作、provider、清理、stop及结果校验均计入真实结算生命周期。先登记lease/flight，再通知或调用外部代码。
- 同lane已有工作时的reconcile附着该工作持有的lease，不另取第二个槽；它仍只读且单飞，不把原run结算误当整条lease空闲。跨lane不能借此共享一次lease。
- 前台占槽时pulse返回runner_busy，零claim/零provider；contact未结算时前台run也拒绝。相同操作重入单飞；不等待排队、自动抢占或另建runner。
- abort/timeout及时撤销继续资格，但Promise实际settle前不释放slot；dispose不提前释放owner，whenIdle不提前返回。释放slot和注销owner是两个操作。
- 未确认是否提交的写入给共享host加needsReconciliation屏障，两个lane都不能再发起新工作。只允许只读核对及已拥有工作的窄停止/清理。只读成功或owner重建不能自动清除此屏障。
- 快照只投影安全状态，不暴露lease/ticket/context。原CORE-004的17个架构师反例与旧API兼容，核对单飞、观察代次和dispose动态计数不得回退。
- 这只是同进程、同host对象的约束；外层必须共用host，不声称覆盖其它进程/账号/host或直接Python tick。

优先小型所有权/租约模块和窄接入，不复制整个runner或重写application。只有明确业务拒绝才是确定失败，陌生写错误保守unknown。

## 2. 可信stdio协议

普通生成页面不能获得通用request。旧contact.tick和Python同步model路径保持兼容；新Node不能调用它们冒充新链。

| 动作 | 严格输入 | 返回与约束 |
| --- | --- | --- |
| contact.claim | 空对象 | 复用claim_due；null或原job(id/ticket/context/now)。这是写，会增加评估次数 |
| contact.complete | id、ticket、decision | UUID与FollowUpDecision严格验证；复用complete事务，包装为相同id、state及分支对应reason/message_id。sent只在inbox提交后返回 |
| contact.fail-generation | id、ticket、reason | reason仅四个provider_*失败枚举；同事务只结束匹配ticket的evaluating行，写needs_retry、清ticket、规范reason；否则stale_generation且无写 |
| contact.read | id | 只读id/state/规范reason/sent时持久message_id；无ticket、purpose、due_at或context。消息关联从数据库验证 |
| reminder.deliver-due | 空对象 | 单独复用deliver_reminders，返回已提交message_ids数组，最多100；不claim、不用模型、不改政策 |

输入以Pydantic为权威，entry严格字段集、Schema同步；host仅contact.read为READ，其余为写。旧fail/recover/retry不扩大范围或自动调用；若抽取旧方法内部实现，保持旧调用契约。

complete业务矩阵：sent必须有合法message_id；pending/context_changed、pending/delivery_window、pending/defer、cancelled、expired都不是消息已发。错ticket、非法结构/时间、政策关闭/暂停、记忆或上下文变化、取消、过期不得落入发送分支。窄包装可增加回执id，不改变旧complete返回契约。

## 3. Contact runner

建议createContactRunner({host,provider?,timeoutMs?,timers?})；可信provider为configured:boolean和reassess(context,{signal})→{decision:FollowUpDecision}。默认Unavailable；正文不能选择provider/密钥/模块/权限。context深拷贝并剔除ticket。输出只接受decision，不接受模型宣称的送达状态。

公开pulse/stop/reconcile/snapshot/subscribe/dispose/whenIdle；不接受任意计划、due_at、ticket或policy参数。stop只结束自己那次评估，不关闭用户政策、不停止前台turn、不取消其它提醒；无所属工作则拒绝。

一次pulse：取得共享槽→至多一次reminder.deliver-due→provider不可用则结束且不claim→至多一次contact.claim→null则结束→一次reassess→严格候选验证→一次contact.complete→核实持久回执。零循环补齐日限额，提醒回执未知也不继续。

合法claim的id/ticket才赋予窄失败权。provider错误/超时/非法输出或确定性decision拒绝，至多一次fail-generation；claim/complete未知不重放、不重新claim、不清理猜出的ticket。所有发送前后核对继续资格/目标，通知回调stop/dispose可挡住尚未发送请求。已发出的迟到未知错误仍保留。

stop先撤资格/abort再窄清理。已发送complete与stop可能竞争：已提交消息不能声称“未发送”或删除；迟到sent或核对应如实保留事实，不再次complete。AbortSignal不是实际结束证据。

reconcile单飞、纳入slot/idle、绑定观察代次。有可信plan ID才read；没有ID就维持未知，不能inspect猜计划或重新claim。读到sent可展示已提交事实，但不能自动清unknown屏障。

内部诊断快照只含规范phase/error/pending计数/disposed/needsReconciliation及已提交messageIds等，不含未发消息、时间、purpose、来源正文、ticket、原decision。普通产品通过原inbox/home读取已送达消息，不增加UI卡片/按钮或未来联系提示。

## 4. 测试及关闭

Python用注入clock精确测窗口/暂停/限额/到期。真实Node→stdio→SQLite可用仅测试目录的fixture构造器，在新根中通过ProductKernel公开方法和过去的注入clock准备现已到期计划；禁止直接SQL、改系统时间、长睡眠、生产clock/fixture路由。

Python -I -B、显式绑定当前services且断言路径；新mkdtemp根，历史库冻结。synthetic_provider_calls与real_model_http_requests分开。外层dispose两runner并观察whenIdle，再app.dispose、host.dispose；卡住时如实报告未结算。

仍not_run：真实时机/措辞质量、关闭应用后运行、跨设备、系统通知、网络重连、原生隔离、初始视觉、生成页面执行。
