# CORE-006 · 供前端接入的可信产品运行时

2026-09-24；ready_for_implementation。工作区：`C:\Users\xiayu\Documents\Codex\companion-agent-core`。

按A→B→C→D→E连续完成，全部submitted后停止。本轮把已有能力组成产品入口，让未来UI只需绑定用户动作，不再自行拼接host/application/runner与关闭流程；**不开发视觉UI**。

## 先读与权限

依次读AGENTS.md、CURRENT-TASK、reviews/CORE-005.md、本派工、core-006/runtime-contract.md、scope/baseline。当前22项成果为reports/core-005-architect/final-artifacts.json，SHA256=b137509a9ec8f31109dddf1983a5f2672359d3720cae52f5f4772b075670c835。保留架构师关于nullable字段、完成矩阵和在途unknown屏障的修订，不能按旧submitted manifest回滚。

新源码只在apps/desktop/product/runtime/；application/index只可窄公开只读refreshHome接线。全部execution、session、其余application、Python、Schema、依赖和旧测试冻结。范围外缺陷给最小反例交架构师。原companion-agent只读，未合并BATCH-016-R2。

0真实模型/HTTP/凭据、0安装、0新会话/子代理、0Git/部署、0生成页面执行。无Vue/HTML/CSS/主题、Electron/原生IPC、scheduler/后台循环/系统通知。架构师保留初始视觉。

## A. 运行时组合和所有权

实现冻结契约的createProductRuntime，默认模型Unavailable，复用三现有对象，原始host保持同一身份。constructor预检和失败回退、唯一runtime登记、initialize单飞、固定入口、安全snapshot/subscribe。

A01：构造/订阅无IO；重复runtime拒绝；无模型时initialize仍能读取真实身份和政策。

A02：第二runner构造失败只回退本次资源，不关闭外部host/既有owner；之后合法重建不被孤儿登记阻止。

A03：公开快照/方法不泄漏host/request/provider/context/ticket/CSV/未来计划；不声称原生隔离。

## B. 一次用户发送到受控执行

实现send与cancelSend，按契约冻结输入/ID/可信授权、登记单飞、忙时在提交前拒绝、提交未知停止、已有turn不重复生成、确认queued才运行。视图切换不改变执行目标，未配置返回真实已保存状态。

B01：同命令同输入重入单飞，不同命令busy，同ID不同正文冲突；通知中取消/关闭挡住未发送请求。

B02：提交丢回执不begin；明确replaySubmit用原命令和授权，只确认提交不自动开始；同ID再次send已完成记录不再生成。

B03：submit中取消、begin/provider/worker中停止、导航A→B、未配置模型、权限拒绝各自正确；不把保存成功当任务完成。

## C. 固定UI方法与读回同步

包装现有控制器公开方法，保留选择/CAS/unknown/幂等/分页语义。工作结束只对仍匹配目标做一次真实读回；联系消息送达后合并home/inbox刷新。必要时仅公开已有refreshHome，不新增业务查询实现。

C01：真实CSV完成后无需演示脚本手工补refreshSelected，即可从当前会话读到completed并打开带来源的结果。

C02：用户切面板/换turn期间，自动读回不抢回A或显示A到B；dispose后的同步任务不发送；相同刷新合并而非通知风暴。

C03：pulse送达后未读和当前inbox更新；不是送达的defer/cancel不假增消息；不读未来计划，不自动标已读或调用pulse。

## D. 生命周期与重开

所有UI命令、send流水线、自动同步和底层runner真实结算都纳入runtime关闭。dispose立即撤继续资格并报告closing/closed，whenIdle不早返回；host始终外部所有。显式宿主pulse/stopContact/reconcileContact与前台共用执行登记。

D01：provider忽略abort、只读/写请求或窄清理未完成时，dispose不假关闭、重建同host拒绝；实际settle后可重建。

D02：内存/提醒等管理命令在途关闭也被跟踪；订阅抛错、同步重入、重复dispose不造成后续IO或泄漏资源。

D03：重开身份/政策/任务/消息稳定；普通导航与重开无模型、worker、pulse、recover、migrate或重放；unknown不自动清除。

## E. 真实离线演示与提交

新增tests/product/core006和tools/product_core006_demo.mjs。演示通过runtime而非手工begin/accept/execute完成：初始化→显式发送CSV→活动/结果同步→读记忆政策→显式pulse已到期候选→收件箱/解释→关闭和重开。另有未配置/未知提交/关闭中延迟等反例；无视觉页面。

E01：真实Node→Python→SQLite→CSV以及主动消息演示，最大provider并发1，synthetic与real HTTP计数分开；原四份离线演示仍通过。

E02：Python121、Node142原基线及新增、Schema只读、五份演示、manifest、scope。现有测试一个不改；Node显式收集各批architect-regressions，不跑复制的历史全库CLI。

E03：docs/development/CORE-006.md和frontend-handoff记清接线/权限/返回状态/关闭及not_run；reports/core-006报告/summary/checkpoint/manifest/原始日志全部落盘后复查范围。status=submitted，不自写accepted，不执行下一批。

每包checkpoint后继续，不逐包等待批准；范围内问题自行修复，范围外提供最小复现，不为凑时间睡眠/扩需求。Python与Node沿用原本机固定运行时；Python -I -B显式绑定本workspace。新运行根限.test-data授权前缀，历史根不可写。权威检查：`python -I -B docs/handoff/core-006/check_scope.py`，基线/派工只读。
