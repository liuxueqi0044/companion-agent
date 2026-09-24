# CORE-006 · 可信产品运行时契约

2026-09-24，架构师冻结。唯一工作区：`C:\Users\xiayu\Documents\Codex\companion-agent-core`。

## 目的与层次

现有application、turn runner、contact runner均已存在。运行时负责把它们组合成未来可信前端的入口：一次明确发送可提交并执行；完成后刷新真实视图；主动消息到达后刷新未读；关闭时保持资源所有权。不得新增业务数据库、队列、Agent框架或另一套控制器。

初始视觉仍归架构师。本批没有页面/CSS/主题、Electron、IPC监听、generated page加载或后台定时循环。此模块是可信Node代码，不是安全沙箱或可直接暴露给生成页面的万能桥；后续原生边界另行验收。

## A. 构造与资源

建议入口：`createProductRuntime({host,intent?,turnProvider?,contactProvider?,timeoutMs?,timers?})`。host与provider/intent等只由可信外层注入，不能来自命令正文。复用createProductApplication/createTurnRunner/createContactRunner；默认两provider均Unavailable。

- 同一个原始host对象交给两runner与application；不要包装成不同host对象而绕过现有owner/lease登记。
- 同host最多一个未关闭runtime；构造/订阅无IO。部分构造失败仅撤回自己已成功创建的资源，不能dispose已存在的外部owner或host，不能留下孤儿登记。
- runtime拥有app和两runner，**不拥有host**。dispose不调用host.dispose或强杀进程；外层须等runtime.whenIdle后自行关闭host。
- runtime的关闭/空闲包括其全部公开命令、发送流水线、自动读回及两runner真正的provider/host/清理结算。run/pulse提前返回不等于空闲。

对外提供initialize/open/refresh/snapshot/subscribe/dispose/whenIdle；固定ui方法组、send/cancelSend，以及仅供可信宿主调用的pulseContact/stopContact/reconcileContact/diagnostics。命名可按上述固定，不做动态host action路由、eval/import或对象路径分派。

## B. 显式发送流水线

`send({command_id,conversation_id,text,csv_text?,temporary?})`：本批要求两个UUID由可信UI绑定层为一次用户意图生成并保留，其余沿用UserTurn语义。拒绝额外字段（尤其capabilities/provider/path/policy）。输入在首次await前冻结；授权仍只来自原session的可信intent回调，不从内容推导或重算。

1. 未initialize/closing/已知shared unknown时，不发送。runtime执行槽忙（含提前返回但资源仍pending）时返回runner_busy，**提交之前**拒绝，不先保存第二个turn再发现模型忙。
2. 同command_id且相同冻结输入的在途send复用Promise；相同ID不同输入拒绝idempotency_conflict，其它ID在途拒绝busy。先登记flight再通知。无自动排队或重试。
3. 复用app.conversation.submitTurn取得确认的turn ID；提交unknown时不begin、不重建ID/材料/授权。已有replaySubmit只能明确重放原提交，不自动续接执行。
4. 确认返回state=queued才进入此次自动run；如果这是既有responded/actions_recorded/model_failed等记录，不因再次send同ID而再生成，返回already_submitted并保留turnId。用户对model_failed的重试走明确work.startSelected，仍受原边界约束。
5. 执行绑定确认的turn ID，调用已有turn runner；不是执行await归来时界面恰好选中的其它turn。默认模型不可用时输入可以已保存，但必须返回model_not_configured和confirmed submission，不能宣称工作完成。
6. 对send引起的首次选中/导航与结束读回记录视图代次。如果用户已切走，不抢回原会话；任务仍按原ID运行。任一步dispose/cancel使尚未发送的后续步骤失效。

建议成功回执`{ok:true,result:{turnId,execution,view:{synced,error}}}`；执行失败用`{ok:false,error,stage,turnId?,submission}`，stage区分submission/execution，submission区分not_sent/confirmed/unknown。业务任务失败仍以runner真实activity呈现；同步视图失败不改写已有执行回执，应单列view.error，不能为了读回失败再跑模型。

`cancelSend({commandId})`仅针对自己在途send：未提交就阻止提交；submit已发出则等待确认/未知并阻止后续begin；runner已启动则调用其stop。不要删除已保存输入或把“阻止后续执行”写成“权限已撤销/任务已取消”。仅确认过的turn.stop回执才可表示撤权；尚未执行时保留queued输入是允许的，需如实标明。本方法不取消另一个turn或用户联系政策。

## C. 前端接线和真实读回

`ui`是固定白名单包装，复用application的方法和选中ID约束，不返回app/host/runner对象：

- conversation：snapshot/loadConversations/openConversation/selectTurn/refreshSelected/replaySubmit。新输入统一send；停止正在执行的工作走work，不暴露原session作为替代执行器。
- policy、memory、inbox、reminders、result：复用现有公开管理方法；保留CAS、显式清空确认、不可幂等写unknown、提醒原命令重放、结果来源和分页界限。
- work：snapshot/startSelected/stopSelected/runLocalOnceSelected/reconcileSelected。这些显式执行操作与send、contact共享runtime层执行登记，并仍使用底层共享lease，不重写执行算法。

所有包装的方法Promise和自动读回计入生命周期；订阅回调抛错不破坏运行。离开面板或更改选择后，迟到回执不能重绑定旧对象。

执行结束或明确停止/核对后，若仍选中该turn且视图代次未变，**至多一次**refreshSelected；读回之后才可打开其真实结果。不要每个pending/phase变化都发请求，不自动分页拉完结果，不捏造completed。

contact pulse结束且有可信已提交message ID时，可以安排一次home未读刷新；若用户正看inbox，再刷新一次当前收件箱。必要时给application增加公开只读refreshHome入口（复用原实现），仅此窄接线；禁止为刷新而调用open(home)抢走面板。未知仅读回已有证据，不能补发消息或清共享屏障。两个来源触发相同刷新时合并在途请求，限制队列且无周期轮询。

runtime普通snapshot保持application已有显示投影和必要生命周期/视图同步状态，不包含CSV原文、票据、grant、路径、provider对象/上下文、联系计划或未来关心时间。合法的用户消息/已打开记忆/已送达消息/明确提醒时间可显示。未提交输入留在UI自身，不为了实现send状态复制进运行时公开快照。

diagnostics仅可信宿主使用，显示规范错误、pending计数和unknown等；也不泄漏凭据/context。pulseContact为显式宿主入口，普通initialize/open/refresh/send不能悄悄pulse、开启主动政策或后台调度。发送内容是否提出followup仍由原模型决策与Python规则处理。

## D. 关闭和恢复边界

dispose及时返回closing/closed和实际未结算状态；先撤销后续发送/同步资格，再dispose自己两runner与app，清订阅。whenIdle等待已发出的命令和两runner实际空闲；不通过Promise.race超时冒充结算，不无限等待后才返回dispose，不关闭外部host。

如果provider忽略abort，保留owner，新的同host runtime不能绕过；旧Promise真settle且所有清理完成后才能注销。关闭后的迟到已提交事实可作为诊断保留，但不发布到已销毁UI，不新发视图读取。需要实际退出由后续原生宿主策略负责。

重开从bootstrap/既有SQLite读取身份、历史、记忆政策、消息、结果。不能自动runtime.recover/migrate、重放未知命令或启动worker；migration_required等由可信外层处理。本批不解决跨进程恢复、通用unknown解除或网络重试。

## E. 验证

控制延迟/订阅重入/取消/导航乱序靠deferred与注入timer，不靠长睡眠。真实Node→Python→SQLite→CSV测试与演示只用新root、合成provider；可复用core005只读fixture，在新根通过公开业务方法准备到期计划。

只跑专用产品Python与显式Node清单，保留所有架构师回归。原工作区只读、历史数据库冻结。不接真实模型/HTTP/凭据，不安装、不生成额外会话/子代理、不Git/部署。
