# BATCH-008 独立复核

结论：M00.5.01 changes_requested，离线准备需修两处边界；真实A01–A03仍not_run，累计accepted=12。

独立复跑原Vitest8测和严格TS通过；只读plan、正常synthetic replay和非法CLI路径符合预期。44项manifest与33份来源hash全部一致；范围modified=0/added=64/missing=0/outside=[]，测试前后范围一致；holdout只核hash且未变。未运行任何官方Agent、账号或模型请求。

## 必修复项

1. B8-R1 / P2，codex_protocol.ts:86：account/read响应result={}被投影成auth.status=unavailable、issues=[]，与显式account:null混淆。固定GetAccountResponse要求account字段；缺字段/错类型必须unknown并有issue。account/read和account/updated需按各自形状解析，不能让错误字段冒充认证来源。
2. B8-R2 / P2，codex_protocol.ts:159及客户端分支：response没有核验ctx.direction，因此client_to_server的取消响应也产生acknowledged；无id的turn/interrupt被无issue接纳为notification。固定ClientNotification只有initialized。已知方法类别和方向错误须可见拒绝/unknown，不能更新正向状态。

两项均已用独立Node探针复现，原始输出在independent-probes.txt；不是仅凭静态推测。无需重写协议框架，修窄投影并添加针对反例即可。

操作单说明还应明确：关闭官方stdio与仅断开我方观察者并非同一动作；目前没有传输层或真实恢复证据，不能假设断开官方stdio后还能观察同一turn。未来将成功/取消/恢复分开授权验证，避免一条任务同时承担互相冲突的目标。

## 下一批

用户要求增加可交付功能量，并明确当前OpenAI账号不用于额外测试。BATCH-009包含协议修订、本地输入核对工作台、小型DeepSeek适配三个包；按阶段连续完成、批末统一复核。

用户允许以DeepSeek API验证模型调用，但随后说明尚未配置。先做窄适配与离线行为测试，live保持not_run；以后用户配置并要求运行再使用一次有界试验。不拿DeepSeek通过替代Codex/Hermes真实验收。

M00.4.02原实现证据通过但视觉缺图仍保留，派工明确扩大未验收小样的输入准备能力；不启动M01正式集成，不篡改156卡前置。原提交与扩展前UI源文件已归档reviews/history/BATCH-008/submitted/。
