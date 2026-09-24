# CORE-003 应用层契约（架构师冻结）

## 所有权和方向

`可信应用创建者 → createProductApplication → 已有session / 新控制器 → 已有host → Python产品服务 → SQLite及本地任务`

应用层运行在可信Node侧，不能直接给生成HTML持有；方法白名单不等于原生隔离。界面只会在后续通过受控桥拿到展示数据和有限意图。本批不建立该原生桥，也不改变Python私有协议。

Python负责事实、版本、幂等、权限和持久化。控制层只负责操作绑定、呈现所需投影、分页和生命周期；不得维护第二份持久业务状态或自己宣布完成。session负责原有会话/提交/停止，复用它的竞态与重入修复，不复制它另写一套。

所有公开方法返回Promise<{ok:true,result}|{ok:false,error:string}>，snapshot/subscribe/dispose及纯投影除外。错误用稳定代码；不向展示层返回exception、stderr、路径或请求体。方法参数使用对象；业务值取当前Python契约，不新造枚举。

## 模块与公共入口

目录 `apps/desktop/product/application/`；推荐下列文件，私有辅助文件允许放同目录。

| 文件 | 导出/职责 | 依赖与输入输出 |
| --- | --- | --- |
| state.mjs | 最小状态/请求助手 | 深拷贝、订阅、代次、单飞、净化错误；不提供通用后台队列或自动重试 |
| policy.mjs | createPolicyController({host}) | refresh(), updateMemory({expectedRevision,patch}), updateContact({expectedRevision,patch}), refreshContact(), blockTopic({topic}), unblockTopic({topic}) |
| memory.mjs | createMemoryController({host,policy}) | refresh(), loadMore(), select({id}), add({content,category}), edit({content}), forget(), clear({confirmed,expectedPolicyRevision}), acknowledgeUnknown({operationId}), deactivate() |
| inbox.mjs | createInboxController({host,onUnreadInvalidated}) | refresh(), loadMore(), select({id}), markRead({id}), explainSelected(), deactivate() |
| reminders.mjs | createReminderController({host}) | refresh(), loadMore(), select({id}), create({text,due_at}), update({text,due_at}), cancel(), replayPending(), deactivate() |
| activity.mjs | projectActivity({turn,stop}) | 纯函数；输入来自确认的session快照，输出真实阶段、公开摘要、动作/任务/事件，不含执行入口 |
| results.mjs | createResultController({host}) | open({turn,taskId}), loadMoreRows(), loadMoreIssues(), invalidate(), deactivate()；turn必须由可信组合层从当前session提供，不能直接由生成页面传来 |
| index.mjs | createProductApplication({host,intent?}) | initialize(), open({panel,...selection}), refresh(), snapshot(), subscribe(), dispose()；暴露命名的conversation/policy/memory/inbox/reminders/result有限方法，不暴露host/request |

所有有状态控制器都提供snapshot/subscribe/dispose。字段命名可统一camelCase，但文档必须列出对既有snake_case协议的映射；不改Python协议以迁就Node。应用的panel固定home/conversation/memory/contact/inbox/reminders。选择conversation/turn可委托session的现有方法，不增加UI布局约束。

`initialize()` 是显式初始化动作，调用既有bootstrap返回home；同一在途初始化单飞。遇到migration_required只返回错误，不调用migrate/recover。构造、订阅和普通导航都不会启动工作；refresh没有timer。host由最外层创建者最终dispose。

## 单一政策

Memory patch只允许 memory_enabled、memory_categories。

Contact patch只允许 proactive_enabled、timezone、start_minute、end_minute、daily_limit、daily_evaluation_limit、topics、paused_until。用户管理自己的允许联系窗口/暂停时间不属于预告某条具体消息；禁止展示模型followup的due_at/purpose/ticket等。

所有patch禁止revision和跨域字段；expectedRevision必须等于控制器已确认版本。完整policy.replace仍由后端验证；本地白名单不能替代后端CAS。写入开始使先前政策读请求失效；成功/失败的归属必须校验。冲突/unknown后读取用于展示现状，**不会证明某次丢失回执的写入就是那次成功，也不自动重发**。

记忆增加/修改/忘记/清空、话题屏蔽等成功后，将共用政策标记stale并显式刷新；stale状态禁止用旧revision构造新写入。若读回失败，已确认的写回执仍是成功，但展示政策标记stale/error，不能把同一写请求当未发送再试一次。

## 写入和不确定结果

- 每个控制器先登记唯一operation身份和在途Promise，再发布busy/调用transport；同步listener重入不能发第二次。不同写意图在已有写请求在途时返回busy，不静默排队。快照仅含operationId/kind/phase/error等元数据，pending正文只留内部。
- 成功回执校验能校验的目标/版本/类型；不匹配视为protocol_error且结果仍unknown，不释放成“确定失败”。请求抛错、断线、outcome_unknown视为未知；普通稳定业务拒绝可视为确定失败。未知错误不能一律当未执行。
- Reminder有持久command_id：同一pending以同一payload显式replay，直到关系有效的回执。初始提交和重放共用单飞；新意图不能覆盖待核对记录。稳定command_id与target/revision正文在提交前深拷贝。
- Memory没有统一命令日志：本批不补数据库结构。结果未知后无自动/按钮重放原memory.add；refresh列表后可显式acknowledgeUnknown(operationId)解除写入闸门。ack只表示用户已知晓未确认状态，不标记原动作成功。ack之前必须有该unknown之后成功的列表refresh；旧refresh、仅关闭面板或其它操作ID不能满足它。
- Memory edit/forget/clear同样采用上述保守unknown流程；避免不必要的多套重放机制。政策未知后以最新已确认revision发起**新的用户意图**，不宣称恢复原请求；同类方案必须写清楚。
- inbox.read/block-topic等本批不做通用自动重试。unknown后允许读回显示真实现状；用户如需再表达同一意图，由新显式操作触发。inbox.read先验证ID属于已展示记录，不能利用后端“缺ID仍返回read:true”误报不存在消息已读。

dispose之后未发出的写请求不发送，已发送的请求并不因此取消。pending promise须能自然结算但不得发布状态。dispose不是持久化恢复机制；重开控制器通过真实列表/CAS恢复可见状态。断电时尚未确认的memory.add不能跨重启承诺exactly-once；这一限制须写入交接，不能用内容去重掩盖。

## 读取、分页和界面切换

每个视图至少有生命周期代次和读取序号；只有最新且目标相符的请求能发布成功/error/loading。不同分区不共用一个会互相吞响应的全局读序号。同步订阅抛错不阻止其它订阅者或挂起Promise。

refresh重置该列表的分页世代。loadMore同页单飞；读回先验证顺序/游标/ID，再按ID去重。换选择/变更开始/关闭面板，使受影响旧读失效；结束时只能清自己的busy/loading。开始写入前的读取不能在写入后恢复旧内容。

deactivate清理面板展示数据和选中项，撤销读资格；不得抹掉仍需核对的写命令，也不cancel共享host/实际任务。页面离开后已经发送的写可结算内部记录，但不得重填隐藏面板内容。返回面板必须重新读取。

清空记忆或忘记条目成功后要清除对应列表/详情中的旧文本；无须抹除仍是用户会话历史的原消息，这两类数据不要混淆。首页只提供身份、必要偏好、未读数、当前会话活动的白名单投影，不预载全部memory/inbox正文。

## 活动与结果

输出至少区分 turnState、actions、taskId/currentAttemptId/taskStatus、providerSummary、events、needsReconciliation、cancelRequested、workerExited。所有字段必须有真实来源；无法推导的workerExited/progress使用null。整体状态可给保守的displayState，但不能取代每项事实。

未知、模型失败、任务失败、任务取消、任务完成分别保留；模型reply是一段回复，不是工具回执。CSV action的accepted仅表示提交成功。未获得实际task数据时不能推断完成。来源引用保留给后续界面展示，内部request_hash/input_hash、DB路径和ticket不进入常规快照。

纯投影仅接受确认session的turn/stop；仍需逐层白名单，禁止用对象spread直接转发未知嵌套字段。对事件错误task归属/非法序号拒绝或标记protocol_error，不静默拼成可信时间线。同一task可能有多个合法历史attempt，历史事件可以分组展示，但不能冒充current_attempt的最新状态；有限事件页不等于完整时间线，需保留hasMore/截断语义。

结果控制器校验taskId是当前turn的已完成CSV动作，并冻结current_attempt_id；每次结果读回核验task_id/attempt_id。组合层在session选择/任务attempt变化时invalidate结果。分页不改变当前任务选择；无结果不制造空“完成成果”。

## 本批没有实现的事情

没有真实模型请求、自然语言理解评测、生成代码装载、系统通知、应用关闭后的后台工作、跨进程控制器状态共享、原生IPC隔离或视觉设计。记忆语义检索沿用现有最近48条规则，不声称无限记忆。

演示可以由独立可信脚本调用turn.begin/accept/execute、worker.run-next、tasks.sync，为应用层制造真实服务状态；这种测试驱动行为不得藏进应用initialize/open/refresh，也不得在报告里写成“AI已经自主完成”。
