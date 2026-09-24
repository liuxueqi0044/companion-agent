# CORE-004 执行协调器契约（架构师冻结）

持久事实属于Python/SQLite。此层仅为可信进程内协调器，不是持久队列、跨进程锁或云Agent。

## 公共接口

- createTurnRunner({host,provider?,timeoutMs?,timers?})。默认provider不可用；timeout针对provider阶段，默认30000ms，可信构造者可给1～120000整数；host阶段沿用现有host自身的有界超时和unknown语义。timers仅可信宿主/测试注入，不能出现在用户请求。
- provider：configured:boolean；respond(context,{signal})返回Promise<{decision,displayableSummary?:string|null}>。configured=false不begin。模型输出不能构造provider元数据或权限。
- runner：run({turnId})、stop()、reconcile()、runLocalOnce({turnId})、snapshot()、subscribe(fn)、dispose()。除本地观察/dispose外返回明确{ok,result,error}式回执。提供whenIdle或等价idle Promise，供外层有界关闭使用。
- dispose及时返回，可报告仍未settle数量；不能无限等待忽略abort的provider，也不能把提前返回当idle。同host对象的runner注册归属保持到dispose且所有已启动provider/host/必要清理settle；dispose时没有工作才可立即释放。运行槽空闲允许同一未dispose的runner开始下一条，不能允许创建第二个owner。
- app可选注入runner，外层拥有；app只订阅调用。app.work从确认session取目标ID，不能接受任意turn对象/ticket/provider/capabilities。stopSelected目标非当前runner拥有turn时返回not_owned_turn。

## 状态与所有权

建议phase为idle/beginning/generating/accepting/executing/working/reading/responded/waiting_for_worker/settled/stopping/needs_reconciliation/failed/disposed。命名可简化，事实不能混同；phase不等于task.status。

snapshot至少有runId、turnId、phase、error、needsReconciliation、providerPending、hostPending、disposed和真实activity投影。ticket、原命令、context和代次只存内部。没有来源的思维链/百分比不制造。

登记flight和owner后才通知/外部调用。同turn在正常在途run期间复用同一Promise；不同turnrunner_busy。超时或停止可能让run Promise先返回，但真正provider未settle前，下一次run必须拒绝，不排队、不悄悄创建新provider。timeout/stop同步撤销继续资格，然后才通知与abort。每次await归来重新核对，旧输出永不accept。

## 不确定结果矩阵

| 阶段 | 确认失败 | 未知或错误归属 |
| --- | --- | --- |
| begin | 返回业务错误，不调用provider | 不调用provider；没有可信ticket不可fail-generation；只读核对 |
| provider | 拥有ticket时尝试一次窄failure | timeout/abort不释放未settle槽；迟到回复丢弃 |
| accept | context_changed/model_failed/stale_generation/明确拒绝不execute | 不重放accept，也不据看似actions_ready自动execute |
| execute | 显示真实action/task | 不重放execute或新建turn/action，保留原ID |
| worker | 使用真实worker/task事实 | 不重启worker/recover/关host；needsReconciliation时runLocalOnce拒绝 |
| stop/failure清理 | 只承认真实窄回执 | 不声称已取消/已清理，不扩大到其它generation |

reconcile仅只读刷新证据；无法证明原请求关系时维持needsReconciliation，不自动解除不确定写入语义。用户显式stop允许保守撤销原turn的权限，但不把它当成证明未知旧写没发生。

一次run最多一次provider、accept、execute、worker及必要时一次fail-generation；用户显式stop/reconcile另计。stop command_id在该run固定。异常reason固定枚举，不把异常正文写事件。失去ticket所有权后不清理新生成。

worker.run-next处理全局队列，可能完成更早的其它turn。不能把该回执绑定当前turn；重新读取当前turn。一次推进后仍queued显示waiting_for_worker，不无限排空队列。

runLocalOnce在运行槽空闲、无needsReconciliation时才可开始；先确认指定turn未取消且有已提交的queued CSV任务，否则不调用worker。它不生成模型输出、不授予权限，也不重放execute。

本批不将主动联系调度接入Node provider，不用contact.tick冒充它。不发真实模型请求、不开scheduler/系统通知、不做原生隔离或视觉。
