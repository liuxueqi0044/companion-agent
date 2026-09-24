# 前端及下一执行者接入说明

## 单一入口

可信Node宿主构造createProductHost({python,workspace,dataRoot,reviewedPackages})。命令/参数/根路径不接受网页、模型或RPC正文覆盖。request只转发有限动作，未配置模型时返回model_not_configured。不要向生成UI暴露整个request对象；原生权限边界尚未实现。

首页调用home：同一profile、policy、unread_count、experience_revision。不显示模型ID选择器、内部hash或诊断计划。政策入口分别使用memory_enabled与proactive_enabled；从policy.read取得revision，再policy.replace做CAS，冲突应重新显示当前设置。

## 一次对话/任务

1. 为用户输入创建稳定command_id和conversation_id；turn.submit保存。capabilities只能由宿主根据明确用户意图/许可提供，默认空。当前允许csv.audit和profile.change。
2. 已配置Python适配器可调用turn.respond。若模型位于Node适配器，可信宿主调用turn.begin获取ticket/context，再把严格结构化结果送turn.accept。模型不能调用这两个宿主接口给自己授权。
3. turn.accept接纳建议后，turn.execute调用既有本地工具服务。unknown时显示待核对；用户/主控明确重放同一交互，稳定action_id保证幂等。不要重新submit生成新命令。
4. worker.run-next属于本地队列运行器，由宿主管理；执行期间可另一个子进程查询task.get/events/result或调用task.cancel。
5. turn.read返回真实task快照与事件；显示大面积任务区。provider_summary来自可信适配器的独立元数据，可为空，不自行制造推理链。流式公开摘要后续接入。
6. 停止模型/撤销未执行建议用turn.revoke；已提交任务继续按task.cancel的真实回执停止，不能把turn.cancelled当作实际worker已退出。回执未知需查询。

turn_id/conversation_id同时绑定视图选择；切换任务时必须在新快照确认前禁用旧内容操作，迟到回复不能盖新视图。参照原R2选择绑定要求，不复制旧R1缺陷。

## 记忆与主动联系

memory.list提供倒序cursor，下一页before=最后cursor；memory.add/edit/forget/clear各自有明确意图。clear需要前端一次具体确认和expected_policy_revision。清空不删除profile、task或用户文件。当前检索最多48条符合范围的最近记忆；它不是完整语义召回。

contact.controls返回开关/偏好和已屏蔽话题，不返回下一次计划。contact.inspect仅用于诊断和用户主动要求的详细管理，禁止默认渲染成“我会在XX点问你”的卡片。用户可以关闭、暂停、屏蔽话题、管理保留的信息；到达消息可用inbox.explain查为什么联系。

受信任本地运行器调用tick；每次至多取一个自动跟进生成，真正发送指写入应用内收件箱，系统通知尚未接通。消息ID固定，mark-read不等于授权。默认自动一天最多一次消息、三次复核；未回复不启动追问链。暂时不安装开机常驻进程或系统计划任务。

重启后显式runtime.recover使生成中的旧票据失效，保留needs_retry以便决定重试；不自动重发未知请求。错过提醒标missed，过期情境问候不补发。模型失败不重试循环。

## 界面版本

继续使用tests/spikes/personal-space/core中的stageSource/sealCandidate/readRevision。把已由宿主审阅的source_hash/artifact_hash配对配置到reviewedPackages，再experience.activate/restore。登记后不自动执行代码；native_mount始终not_run。

版本登记CAS成功后，真正可信宿主仍需完成预加载、ready超时、未提交草稿迁移、切换和崩溃回退，才能展示“界面已换好”。这部分不能用当前登记成功回执冒充。

## 合并方式

新增实现主要在services/product、apps/desktop/product、tools/product*、tests/product。原有personal_ai/local_tasks/desktop_bridge业务源未改。等原R2独立复核后，将新增模块与必要文档按文件合入；不要用整个副本覆盖原工作区、旧报告或它最新的host/client修订。此副本不含历史数据和凭据。

## CORE-002：重开、提醒和停止的接线

可信应用构造 `createProductHost({python,workspace,dataRoot})` 后调用 `bootstrap`。若旧 product v1 根返回 `migration_required`，只在确认本地身份与备份后由可信宿主调用 `runtime.migrate {expected_version:1}`；重复调用返回 `already_current`。不要删库重建，也不要让生成页面调用迁移。

无视觉控制入口是 `createProductSession({host,intent?})`，见 `apps/desktop/product/session.mjs`。`intent` 只能由可信宿主注入，默认返回空授权；它接收新 turn 的副本，不从任意页面数据读取 capabilities。应用持有并关闭 host；session 的 `dispose()` 仅清理自身订阅和迟到回执，不关闭共享 host。

| 用户操作 | session 方法 | 处理要点 |
| --- | --- | --- |
| 打开会话入口 | `loadConversations({limit?,snapshot?,before?})` | 默认 20、最大 50；后续页沿用第一次 snapshot 与 nextBefore。新输入需要刷新首屏取得新 snapshot |
| 打开一段会话 | `openConversation(conversationId,{limit?,snapshot?,before?})` | 默认 10、最大 20；只返回摘要与游标 |
| 选中任务 | `selectTurn(turnId)` | 立即清空旧可操作绑定并 loading，确认 `turn.read` 回执后才展示并允许操作 |
| 手动刷新 | `refreshSelected()` | 同一选择代次内仍按读取序号取最新；旧 success/error 均返回 `stale_view` 且不得覆盖状态 |
| 提交 | `submitTurn({command_id?,conversation_id?,text,csv_text?,temporary?})` | 只提交，不启动模型；未知结果保留原命令和材料，`replaySubmit()` 用同一请求单飞恢复 |
| 停止 | `stopSelected()` | 点击时冻结 turn ID 与 stop command ID；停止开始即使旧读取失效，停止中刷新报 `stop_in_progress`；取消回执不等于 worker 退出 |
| 监听 | `subscribe(listener)`、`snapshot()`、`dispose()` | 状态仅含展示字段；listener 退订函数。错误只显示代码，不显示 stderr |

`snapshot()` 可呈现 conversations、turns、selectedTurnId、turn、loading、refreshing、error、submitUnknown、stop。不要把 host/request、ticket、授权集合、内部计划或 DB 路径传给 UI。`selection_not_ready` 表示加载中的旧卡片不可停止；`outcome_unknown` 表示必须依旧命令核对，不能当成功或再次交办。旧视图 Promise 被忽略不等于本地任务已取消。

明确提醒独立使用 `reminder.list/read/create/revise`。更新需完整 text 和未来 UTC due_at，加 `expected_revision`；取消只给 operation=cancel。先查当前 revision，冲突重新读，不把旧值强行覆盖。原 `reminder.cancel` 仅供旧调用兼容。提醒到时由可信本地 tick 写应用内 inbox；系统通知没有接入。

原 `turn.revoke` 仍适合只撤销未执行建议。用户选择“停止这次工作”时用 `turn.stop`；已提交任务的真实状态以 `task.get` 与 worker 事件为准。提交回执未知、没有 task_id 的 action 要保留原 action_id 供人工/后续工具核对，不得重新执行已撤销的 action。普通切换会话不触发 stop。
重开 session 后对已停止 turn 再触发 stop，会映射到产品库保存的原取消命令，不会新建 task.cancel；同一新命令 ID 不能跨 turn 复用。

普通会话、会话列表和默认首页不展示自主联系计划。`contact.inspect` 仅诊断或用户主动管理。模型真实语义、原生 IPC 来源隔离、DOM 实际装载、系统通知与产品视觉都未在 CORE-002 验收；UI 外观和布局由架构师继续负责。

## CORE-002-R1：旧输入屏障与并发恢复规则

- 若同一 conversation 已有更新的用户输入，旧 turn 的 `turn.begin` 返回 `superseded_turn`，即使它先前因 `context_changed` 或进程重开而处于可重试状态。生成中收到新输入的 `turn.accept` 返回 `context_changed`，不落动作、记忆和主动计划。temporary 输入同样是新意图。想重做旧工作必须由用户新提交 turn，并在本次明确重新授予所需权限；不要复制旧 grant 或自动启动模型。已经提交的本地任务仍可按原 task ID 查询、取消和依原业务规则 retry。
- `selectTurn/openConversation/dispose` 撤销旧读取资格。同一 turn 多次 `refreshSelected` 也只让最后发起的读取发布 turn、error 和 refreshing。`stopSelected` 开始时旧读取失效；停止期间 `refreshSelected` 返回 `stop_in_progress`，停止回执后再读取真实 task 状态。重复 stop 复用同一 command ID，较早 stop/error 不能覆盖较新的停止读回。切换会话不会取消后台任务。
- `submitTurn` 保留输入/授权的内部深拷贝，初始请求和 `replaySubmit` 同一记录只允许一条在途传输。snapshot 的 `submitting` 表示在途；`submitUnknown` 表示当前记录结果仍不确定。`outcome_unknown`、`transport_unavailable`、不匹配的 turn/conversation 成功回执都保留原命令，重试不重算可信 intent。确定性输入错误清除该记录、显示错误并允许新输入；成功须验证两个 ID 相符后才清除。旧回执不可能结算新记录。dispose 不取消共享宿主或任务，晚到回执不再通知订阅者。
- product v1 显式迁移在写入前验证完整的预期表、索引、trigger/view 集合。额外行为对象会返回 `recovery_required`，应停止并由可信维护流程检查旧库，不删除触发器或改写原始数据来强行继续。

2026-09-24 架构师补充：session 在同步通知订阅者之前就登记当前提交的在途 Promise，因此 listener 内再次调用 replaySubmit 也只复用原请求。listener 抛出显示层异常不会中断提交或其它订阅者；应用应自行在显示层处理其渲染错误。若 listener 在请求真正发出前 dispose，尚未发出的写请求不会继续发送；已经发出的任务仍不因此取消。SQLite 迁移只按字面的 `sqlite_` 内部前缀过滤，`sqliteX...` 等合法用户对象不能被排除在结构验证之外。补丁和最终本地验收见 `reviews/CORE-002-R1.md`。

## CORE-003：可信无视觉应用入口

可信 Node 创建者可用 `createProductApplication({host,intent?})`。构造/订阅不请求服务；显式 `initialize()` 才 bootstrap。`open({panel})` 只读取选中的 home/conversation/memory/contact/inbox/reminders 面板；`refresh()` 只刷新当前面板。`snapshot()` 是已筛选的显示数据，`subscribe()` 可退订；`dispose()` 不关闭共享 host。实际前端需通过后续受控桥调用有限方法，不能把应用对象或 host 直接交给生成页面。

各方法、snake_case 主机参数映射与示例调用见 [CORE-003.md](CORE-003.md)。记忆和主动联系共享 `policy.revision`；CAS 冲突读回现状，不自动覆盖。`memory.add` 回执未知时不重发，读列表后须由用户显式确认“已知仍不确定”。提醒的 `replayPending()` 保留原 command_id 与正文；取消用 `reminder.revise(operation=cancel)`。收件箱打开不自动已读，首页未读数由 `home` 读回。活动区只按真实任务状态和事件投影；`turn.cancelled` 或模型文字均不等于工具完成或 worker 退出。

普通首页不读取记忆全文或 `contact.inspect` 计划。主动联系默认关闭；只有用户明确调用联系政策更新才能开启。应用层没有真实模型、后台常驻、系统通知、原生隔离或产品视觉验收。
# CORE-003 架构师复核补充（2026-09-24）

CORE-003 的当前有效版本见 `reviews/CORE-003.md` 和 `reports/core-003-architect/final-artifacts.json`；不要按原 submitted manifest 恢复补丁前源码。

- 普通应用的 conversation snapshot、select/submit/replay/refresh 返回值均经过展示投影；内部 task input_hash 和原始工具回执不交给界面。底层 session 仍仅供可信宿主内部使用。导航不会启动模型或worker。
- 分页在通知订阅者前登记唯一Promise。订阅回调中再点加载只复用原请求；回调中dispose/切换使尚未发送的读取失效。提醒refresh会使旧详情读取失效，旧条目的冲突不能把用户从新条目切回去。
- 提醒创建的幂等重放返回**当前行**，修订的幂等重放返回**当次命令的持久回执**。成功回执与当前视图要分开：重放得到revision=2时，已观察到revision=3的列表/详情不能倒退；create重放得到后来已修改或取消的revision>1仍是合法结果。
- memory操作遇到未知内部错误也保留待核对记录，不能因错误名称不在短白名单就假设未写入。只有明确业务拒绝才能释放为确定失败。非幂等memory.add仍不自动重发；确认unknown不代表确认成功。
- CSV完成而其它动作失败/被阻止/尚未执行时，整体displayState不冒充全部完成。旧attempt的取消事件不代表当前attempt已收到取消。action.error与taskError分别保留并净化。
- 首页读到新的policy revision时刷新共用政策，避免旧缓存开关覆盖真实状态。改变界面不改变这些事实和权限边界。真实模型、后台常驻、原生隔离与视觉验收仍未进行。

## CORE-004：前台执行链与资源归属

可信外层创建 `host=createProductHost(...)`，再创建 `runner=createTurnRunner({host,provider?})`，最后可选 `app=createProductApplication({host,intent,runner})`。默认 provider 为不可用，`app` 不自行创建模型或执行器。只有用户明确调用 `app.work.startSelected()` 才会对当前已确认的 session turn 执行；普通 `initialize/open/refresh` 均不启动生成或本地 worker。不要把 host、runner、ticket、provider 或任意 `request` 暴露给生成页面。`intent` 的 CSV 授权仍在可信提交边界，模型决策不能新增授权。

`app.work` 只提供 `startSelected/stopSelected/runLocalOnceSelected/reconcileSelected/snapshot`。当前选择未确认时拒绝；从 A 切到 B 不取消 A，也不把 A 的迟到状态展示到 B；B 的 `stopSelected` 不能停止 A。runner 的 `snapshot` 和选中后 `app.work.snapshot` 只含阶段、规范错误、待结算数量和真实活动投影；不含 ticket、输入材料、内部 context 或思维链。`phase=settled` 是本次链路已读到结果，CSV 是否完成必须看 `activity.taskStatus` 与任务事件。

runner 对同一 host 进程对象只有一个所有者：同 turn 在途调用复用同一 Promise；不同 turn 拒绝为 `runner_busy`。provider 超时或用户 stop 会立即撤销旧结果的继续资格，但不证明 provider 已退出；未结算时旧 runner 的槽位和 host 归属继续保留。上层关闭顺序为 `runner.dispose()`、观察 `runner.whenIdle()` 或报告尚未结算，再 `app.dispose()`、`host.dispose()`。不要为了关闭卡住的 provider 在产品层新建同 host runner。`app.dispose()` 不关闭 runner/host。

`turn.begin/accept/execute/worker.run-next` 的未知回执不得自动重放。`reconcileSelected()` 只读原 turn/任务，不因为看到 `actions_ready` 就补执行。`runLocalOnceSelected()` 是用户显式推动已有 queued CSV 任务的单次 worker 尝试；全局队列可能先完成另一任务，必须重新读取当前 turn。`stopSelected()` 使用稳定命令 ID，permission_revoked 不表示 worker_exited。生成失败只用当前 ticket 的 `turn.fail-generation`，不能调用广域 `runtime.recover` 清理其它 turn。

CORE-004 只用测试/演示注入的合成 provider 和真实本地 CSV 服务；真实模型、自然语言理解、原生隔离、后台常驻、系统通知与产品视觉仍未验收。详见 [CORE-004.md](CORE-004.md)。

## CORE-004 架构师复核补充（2026-09-24）

当前有效成果以 `reports/core-004-architect/final-artifacts.json` 和 `reviews/CORE-004.md` 为准；原 submitted 报告保留为历史。

- `reconcile()` 也占用资源生命周期。同一次核对复用 Promise，核对未结算时 `whenIdle()` 不返回、dispose 不报告 closed，也不释放同 host 的 owner。新任务不会越过旧核对；生成、停止或新状态已使读取过时时，迟到核对返回 stale_view，不回退活动状态。核对没有自动执行或清除未知结果的权力。
- 所有普通阶段在通知订阅者后、实际发送前再次检查继续资格。通知回调中 stop/dispose 可以挡住尚未发出的 begin/accept/execute/worker。已发送写请求迟到的内部错误仍保留待核对，包括 dispose 后；不因错误码不在短名单就推断没有提交。
- `invalid_followup_window` 等确定性模型输出拒绝使用原 ticket 的窄失败接口结束生成；不会留下永远 generating 的 turn。非法时间的真实事务测试确认动作、记忆和计划建议全部回滚。
- 结束前的 turn 读回必须能投影为合法活动；worker 已运行而读回失败、或 stop 的任务回执仍有未知取消，都保持 needsReconciliation，禁止下一次自动推进。
- dispose 后仍可查询动态 providerPending/hostPending；归零依据实际 Promise 结算。`phase=settled` 不等于每项业务成功，仍看真实任务状态。外层不能用完成/停止文案掩盖 unknown。

这些是可信 Node 协调器的本地保证；没有新增跨进程锁、原生沙箱、实时模型或视觉验收。

## CORE-005：主动联系执行层

可信外层应把同一个 `createProductHost(...)` 对象传给 `createTurnRunner({host,...})` 与 `createContactRunner({host,...})`。后者默认模型不可用；显式 `pulse()` 仍会投递到期的用户提醒，然后结束，不 claim 主动候选。配置可信合成/未来经审核的 reassess provider 后，一次 pulse 最多评估一个候选，返回本地持久状态。没有后台循环，不因打开首页或切换会话自动调用。生成页面不能拿到 host、runner、provider、ticket 或泛化 request。

两条执行链共用单个同进程、同 host 的在途槽。忙时返回 `runner_busy`；未知写入后的 `needsReconciliation` 阻止两边新增工作。`reconcile()` 只读已知 plan，不自动清除屏障或重发 complete。stop 只撤销本次评估资格，已发送的 complete 可能照样落库；这时展示消息事实，不显示“取消所以未发送”。provider 不理会 abort 时，`whenIdle()` 只能等真实结算。关闭次序为两 runner dispose/whenIdle，再 application 和 host dispose。

普通首页/对话只展示已交付事实，不显示未来关心计划；明确提醒时间仍在 reminder 明细可见。已到达的主动消息可用 `inbox.explain` 查看依据、用 `inbox.read` 标为已读。政策和记忆管理继续使用原有 CAS 控制；模型输出不能修改开关、授权或工具状态。具体协议、回执与失败路径见 [CORE-005.md](CORE-005.md) 和私有 `product-core/1` Schema。真实模型、定时运行、系统通知、原生隔离及视觉仍未运行验收。

## CORE-005 架构师复核补充（2026-09-24）

当前有效版本见 `reviews/CORE-005.md` 与 `reports/core-005-architect/final-artifacts.json`；原submitted报告和manifest保留历史。

- Node联系候选接受Python契约允许的未使用字段null：send的due_at、defer的text、cancel的两者。非空无关字段仍拒绝，Python继续权威验证日期和时间窗口；不能通过缩减Schema来掩盖跨语言不一致。
- complete回执须对应本次decision：send才可返回sent且reason匹配，defer可pending或达评估上限cancelled，cancel可cancelled；context_changed/delivery_window/expired独立处理。evaluating/needs_retry只能作为只读观察事实，不能作为成功完成回执。重复读到同一个非法回执也不能令其变成合法送达。
- needsReconciliation不只阻止下一次run/pulse。正在运行的链在发送provider或普通写操作之前也复查共享屏障；读回发现未知、或同步订阅回调引入屏障后，不继续accept/complete/execute。已有票据的显式停止/关闭清理和只读核对仍保留。

## CORE-006：可信产品运行时接线

未来可信前端绑定层调用 `createProductRuntime({host,intent?,turnProvider?,contactProvider?})`；宿主先创建一个固定路径的 `createProductHost`，并将**同一个原始host对象**交给运行时。运行时拥有已有application及turn/contact runner，不拥有host。构造/订阅无IO；`initialize()`才读身份与政策。运行时不是可直接发给生成页面的IPC对象，`diagnostics()`也只给可信宿主。没有页面、样式、Electron隔离或视觉验收。

一次用户发送由可信绑定层生成并保存 `command_id` 与 `conversation_id`，传给 `send({command_id,conversation_id,text,csv_text?,temporary?})`；权限只由可信 `intent` 回调授予，不由文本或生成页面自带字段授权。返回的 `submission:'confirmed'` 只证明输入保存；`model_not_configured` 时可继续显示真实queued状态，不能显示完成。`submission:'unknown'` 需用户明确 `ui.conversation.replaySubmit()` 核对同一命令，不启动模型。同ID不同材料冲突；另一命令在执行槽忙时提交前拒绝。`cancelSend({commandId})` 的“已请求取消”、实际权限撤销与worker退出分别显示，后两者只认真实回执。

绑定层只接固定 `open/refresh/snapshot/subscribe/send/cancelSend/ui` 方法；`ui`分为conversation、policy、memory、inbox、reminders、result、work。结果区依据当前已确认turn的真实task状态与来源打开，执行完成后的选中turn只读回一次；切到B后A的迟到读回不抢视图。政策修改保留CAS；记忆未知不自动重发；提醒未知仅通过原命令显式重放。联系的 `pulseContact/stopContact/reconcileContact` 只供可信宿主按明确时机调用，普通导航不会触发，也不显示未来联系计划。已送达ID才刷新首页未读与当前inbox。

关闭先 `runtime.dispose()`，再 `await runtime.whenIdle()`，最后由外层 `await host.dispose()`。若provider或窄清理未实际settle，运行时保持closing与同host所有权；不要强称已退出。重开只读真实SQLite身份、政策、任务、消息、结果，不自动recover/migrate、重放未知写入、启动worker/模型或pulse。详见 [CORE-006.md](CORE-006.md) 与离线演示 `tools/product_core006_demo.mjs`。真实模型、语义理解、后台常驻、系统通知、原生隔离和产品视觉仍为 `not_run`。

本次只修Node边界及新增测试，没有变更Python业务、Schema、数据库、旧测试、调度方式或视觉。

## CORE-006 架构师复核补充（2026-09-24）

当前有效版本见 `reviews/CORE-006.md` 和 `reports/core-006-architect/final-artifacts.json`；原 submitted 报告及其 manifest 保持历史，不用于回滚架构师补丁。

- 首页、收件箱和选中 turn 的刷新先登记唯一 Promise，再通知订阅者。同步订阅回调再次刷新复用原请求，回调关闭仍挡住未发送读取。
- 消息送达后的同步不能借用送达前启动的旧读取来声称成功。先等待已有 home/inbox 请求结算，再要求消息提交后的读取；关闭期间不补发，未结算读取仍属于运行时生命周期。
- 管理命令和导航在调用入口复制参数，后续表单编辑不改变已发起操作。绑定层传普通可 structuredClone 的数据；不可复制的参数返回 invalid_request，不发送请求。该复制不是生成页面的权限或原生隔离边界。
- 已有未知提交未核对时，其他 command_id 在登记和传输前拒绝，避免把从未发送的命令误记为 unknown。原命令显式 replay 确认后，另一个命令仍可正常提交；replay 不自动启动模型。

最终 Node 172 项通过，Python 121 项独立复跑通过（本轮未改 Python），Schema 与五份真实本地演示通过。真实模型、后台常驻、原生隔离和初始视觉仍未验收。
