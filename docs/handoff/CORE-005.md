# CORE-005 · 主动联系与前台任务共用执行能力

2026-09-24；ready_for_implementation。唯一工作区：`C:\Users\xiayu\Documents\Codex\companion-agent-core`。

连续完成A→B→C→D→E五包，统一submitted。目标：把既有模型选时的主动联系服务接到可信Node，并与前台任务串行协作；未配置模型仍处理明确提醒，但不消耗主动评估次数。

## 读取和范围

先读AGENTS.md、CURRENT-TASK、reviews/CORE-004.md、本派工、core-005/contact-runtime-contract.md、scope/baseline，再读源码。CORE-004当前有效20项成果为reports/core-004-architect/final-artifacts.json，SHA256=c23ed1e5b22494dd361bfc8b0a0055d0447a7e07d13eb456a4436efc0bd4b979；不能用旧submitted manifest回滚补丁。

0真实模型/HTTP/凭据、0安装、0新会话/子代理、0Git/部署、0生成代码执行。原companion-agent只读，BATCH-016-R2未合并。初始视觉由架构师负责，不做Vue/HTML/CSS/主题/桌面壳。不装scheduler/后台/系统通知或网络服务；DB维持v2。

写集只含execution、ContactService窄边界、models/entry/schema/host白名单、指定文档和新测试/演示/报告。kernel/context/memory/store/session及全部application控制器、既有测试冻结；范围外缺陷记录最小反例交架构师。内部所有权抽取不能变成全库重构。

## A. 共享执行槽

1. 按冻结契约抽出同host owner/lease模块，turn和contact各一owner，共用一个在途slot。
2. 现有createTurnRunner窄接入，保留公开API。登记flight后通知，发送前复查资格，共享unknown屏障；不删核对单飞/观察代次和动态计数。
3. 加入两角色互斥、重入、忽略abort、关闭/释放、读取核对、未知屏障的受控延迟测试。

验收A01：无IO构造，同角色重复owner拒绝，两角色共存但最大provider并发1。

验收A02：前台占槽使contact零claim/零provider；contact占槽使前台零begin/零provider；超时提前返回不释放实际未结束的槽。

验收A03：原Node105项（含CORE-004架构师17项）原样通过，重入/迟到读/未知写/whenIdle不回退。

## B. 窄服务协议

1. 实现contact.claim/complete/fail-generation/read和reminder.deliver-due；Pydantic/entry/Schema/host分类一致。
2. 复用claim_due/complete/deliver_reminders，failure事务只更新自己的ticket，不影响别的计划、新ticket、sent/cancelled或前台turn。
3. read从持久关系获取消息ID，无内部上下文；模型不能宣称送达、改政策/授权或启动工具。保持旧tick/fail等接口兼容，新Node不调用tick/recover/retry。

验收B01：真实事务/stdio验证正确、错误、旧ticket、已发送/取消及无关计划；类型和额外字段严格拒绝。

验收B02：send/defer/cancel/context_changed/delivery_window/expired回执真实，非法decision/时间无部分写入。

验收B03：正确读写分类，read无ticket/未来时间/purpose/context；Schema和旧协议回归通过。

## C. 单次联系协调器

1. createContactRunner和可信reassess provider，默认Unavailable，不动态载入/寻钥/接真实API。
2. pulse一次提醒批次及最多一个主动候选；模型不可用不claim，无候选不调用provider。
3. 按契约剔除ticket、深拷贝、严格验证和核实持久回执；defer/cancel正常结束，不把每个候选都发出去。
4. timeout/abort/invalid只窄清理一次，unknown停止，不重放或补模型请求。

验收C01：关闭/未配置/无候选都不调用模型；未配置仍交付明确提醒且不增加contact.evaluating。

验收C02：至多一provider/一complete/一次必要failure；send确有消息，其它业务分支不新增主动消息。

验收C03：错ID/ticket、非法结构、内部错误、丢回执、抛错、忽略abort保守收敛，不泄漏context或假完成。

## D. 停止、核对与控制

1. 实现stop/dispose/whenIdle/reconcile和安全观察接口，不停止前台turn或修改用户policy；核对有代次且不清unknown。
2. complete已发送时停止可能仍有已提交消息，如实记录，不删inbox来假装没发生。
3. 用原方法测在途关闭、暂停、取消、屏蔽话题、忘记来源、记忆/新输入变化及过期。旧输出不能绕过最新持久规则。
4. 普通home/conversation仍仅显示已交付事实；inbox.explain提供联系依据；明确提醒时间仍可见。

验收D01：complete在途停止、claim在途dispose、清理丢回执、核对在途关闭都不早放owner或重复发送。

验收D02：政策关闭/撤销/遗忘/上下文变更抑制旧评估，日限额与评估次数真实约束，不自动追问未回复用户。

验收D03：普通快照不出现未来关心时间；送达可读/标记/解释，关闭主动不阻止明确提醒。

## E. 组合验证与交接

1. 新tests/product/core005和tools/product_core005_demo.mjs走真实Node→Python→SQLite，合成provider。测试fixture仅用公开业务方法与注入clock准备已到期计划，不改SQL或生产时钟入口。
2. 演示默认关闭、启用后send且重开不重复、defer/cancel不发送、未配置/主动关闭仍交付明确提醒、前台CSV与主动联系争槽且最大provider并发1。读取收件箱及解释，不做视觉页面。
3. 复跑Python101、Node105基线及新增、Schema、旧三份演示和新演示。Node显式列所有产品测试，含各批architect-regressions；不跑历史全库CLI。Python -I -B绑定当前services。
4. 写docs/development/CORE-005.md和frontend-handoff，说明显式pulse不是后台服务，列错误/所有权/关闭/剩余未知。reports/core-005保存submitted报告、summary/checkpoint、manifest和逐验收ID命令证据。
5. 日志报告落盘后复跑scope。失败/跳过/not_run如实留存，不改基线、旧报告或历史数据，不写accepted，不展开CORE-006。

验收E01：真实业务、互斥、无重复消息、身份重开及旧CSV链通过；合成调用和真实HTTP计数分开。

验收E02：测试/Schema/manifest/scope通过，历史文件字节未动；保留失败证据，不删库换PASS。

验收E03：真实语义/后台/系统通知/原生隔离/视觉保持not_run；无安装/凭据/额外会话/模型请求。

## 执行约定

每包checkpoint后继续，不逐包等用户批准。边界内问题直接修正；范围外问题给最小反例，停止相关依赖、可继续独立包。全部完成再统一报告，不为凑耗时睡眠或扩需求。

Python：`..\companion-agent\.venv\Scripts\python.exe`，测试`-I -B tools/run_product_tests.py`。Node：`..\companion-agent\.local-tools\node-v24.21.0-win-x64\node.exe`。权威范围：`python -I -B docs/handoff/core-005/check_scope.py`。基线只读，旧检查器仅代表历史时间点。
