# CORE-004 · 有边界的前台任务执行链

2026-09-24；ready_for_implementation。唯一工作区：`C:\Users\xiayu\Documents\Codex\companion-agent-core`。

## 目标、读取顺序与权限

交付“已提交turn → 合成模型适配器 → 严格接纳 → 已授权工具 → 真实结果”的可信协调器。当前演示靠脚本手工begin/accept/execute，本批将其变为可调用的产品代码。本批仍不接真实模型。

先读AGENTS.md、CURRENT-TASK、reviews/CORE-003.md、本派工、core-004/runner-contract.md和scope/baseline，再看实际源码。CORE-003已复核并由架构师补丁；当前17项有效成果见reports/core-003-architect/final-artifacts.json，SHA256=3585b55f20423e326a7507dfae59f36cc5fff8d9119d86c1b68ec8ec2c24975c。旧submitted manifest是历史，不能据其回滚。

按A→B→C→D→E连续完成五包；包间checkpoint后继续，全部完成统一submitted。复用ProductKernel、host、session、LocalWorker和应用控制器，不建第二套持久队列、工作流框架或任务库。

新模块限apps/desktop/product/execution/。旧文件只按scope写入：kernel/entry/models/schema增加窄失败接口；host只补动作白名单；application/index只补可选runner接线。其余控制器、session、store/context/memory/contact、旧业务与旧测试冻结，DB维持v2。范围外缺陷记录最小反例交架构师，不能先改后补授权。

0真实模型/HTTP/凭据读取、0安装、0额外会话/子代理、0Git/推送/部署、0生成代码执行。原companion-agent只读，R2未合并。初始视觉UI由架构师负责，不写页面/CSS/主题/桌面壳。无scheduler、系统通知、网络监听或常驻后台。

## A. ModelPort与唯一执行槽

1. 实现runner-contract中的可信异步provider接口、默认UnavailableProvider和createTurnRunner。provider只可由可信构造者注入，不从模型/用户/页面/stdin正文、环境寻钥、文件路径、eval或任意import加载。
2. 默认未配置在begin之前返回model_not_configured。测试合成provider放测试/演示，不向生产协议添加synthetic输入或脚本执行接口。
3. 同runner仅一条链；同turn重复run复用Promise，不同turnrunner_busy，不排队。登记owner/flight后才通知和调用外部代码；同一host对象仅一个未释放runner所有者。
4. timeout/abort不证明provider已结束。可及时返回错误，但原promise和相关host阶段未settle前不释放槽。dispose后迟到输出不可accept；重建同host的runner不能绕过未结束的槽。此约束仅为进程内，不声称跨账号/跨进程锁。

验收A01：无IO构造、未配置不begin、重入单飞、不同turn拒绝、listener抛错和通知中dispose。

验收A02：provider忽略AbortSignal时，停止/超时后仍只有1次调用；旧工作settle才释放owner，重建不能绕过。

验收A03：正文不能指定provider或授权，快照无ticket/context/CSV/内部计划，synthetic调用与真实请求计数分开。

## B. 只结束自己那次生成

1. 新增可信动作turn.fail-generation {turn_id,ticket,reason}，Pydantic严格字段和UUID校验；reason仅provider_failed/provider_timeout/provider_invalid_output/provider_aborted，不含异常正文。
2. 同一事务内只更新仍为generating且ticket相同的turn：model_failed、清ticket、规范错误/event。错误ticket、已接纳、已停止、后来的generation返回stale_generation且无写入；重复旧failure不能覆盖新结果。
3. schema.Contracts纳入请求类型并生成Schema；entry精确路由，host列入写ACTIONS，不能列READS。复用既有验证，不改变原respond边界，不迁移DB，不调用runtime.recover清其它生成。
4. 不动grant、记忆、followup、其它turn或真实task。最新turn合法失败后可由用户再次run，既有superseded/context签名限制继续生效。

验收B01：真实服务/stdio验证正确与错误ticket、旧ticket晚到、新generation、已成功/停止、无关turn；拒绝路径不产生额外写入。

验收B02：reason/类型/额外字段拒绝；host传输错误保守unknown；Schema及旧生成/停止回归通过。

## C. turn到工具的受控执行

1. runner.run({turnId})不创建turn或授权。顺序：begin→provider.respond→accept→核实业务状态→execute（确有ready动作时）→至多一次worker→turn.read。每个异步阶段前后检查run继续资格和目标；任何停止/不确定/上下文失效都不继续副作用。
2. begin目标/ticket有效才调用provider。context深拷贝并剔除ticket；返回只接受{decision,displayableSummary?}，decision仍由Python严格验证，摘要来自可信适配器独立字段。provider失败/非法输出只用B结束自己的generation。
3. accept可能协议ok:true但业务model_failed/context_changed，必须停止而非继续execute。无权限决策、过期上下文、旧generation不能落工具动作，不自动再问模型。
4. begin/accept/execute/worker未知或错目标时needsReconciliation，无自动重放、无新turn/action/command。reconcile只读真实turn/task，不因看似actions_ready就自动execute，也不认领未知写入已经成功。
5. 一次run最多一次provider/accept/execute/worker。worker.run-next处理本地队列最早任务，可能是另一turn；不能改队列或无限排空。重新读本turn仍queued就waiting_for_worker。显式runLocalOnce({turnId})每次最多推进一个worker，仍取本turn真实结果，不假完成。

验收C01：合成provider+真实host完成授权CSV、无动作回复、无grant拒绝、公开摘要空/非空；实际结果来自本地工具。

验收C02：新输入/记忆/政策变更使旧生成失效；context_changed不execute；错目标、丢回执、错误分支无自动重试或多余副作用。

验收C03：队列有更早其它任务、工具失败、仍排队、unknown或worker异常均不假完成，命令次数有界。

## D. 停止、核对与应用接线

1. stop仅针对runner拥有的turn，冻结稳定stop command_id；先撤销继续资格，再abort provider和调用既有turn.stop。取消权限的回执不等于provider settle或worker退出，重复stop复用ID。
2. dispose也不释放未结算owner，不关闭共享host。需要清理时仅使用拥有ticket的fail-generation；清理未知则标记待核对，不能广域recover。明确显示尚未settle的provider/host阶段。
3. createProductApplication可选注入可信runner，不传时维持旧行为且不自动创建runner。提供app.work.startSelected/stopSelected/runLocalOnceSelected/reconcileSelected/snapshot；冻结已确认session的turn ID，不接受context/权限/provider参数。
4. A运行时切B，不取消A也不把A迟到回执灌入B；当前选择与runner目标不符时stopSelected返回not_owned_turn。外层宿主拥有runner/host，app.dispose只清订阅和自己的视图，不dispose二者。
5. initialize/open/refresh不能自动运行。只有明确用户开始工作的动作进入runner，仍依赖原turn的可信grants。最外层演示负责runner处置→app.dispose→host.dispose及未结算状态记录。

验收D01：begin前、provider中、accept/execute/worker中停止；迟到输出不越过边界，取消状态不冒充worker退出。

验收D02：A运行切B、app/runner各自dispose、不响应abort、重复stop和错误回执，目标/槽/视图各自正确。

验收D03：无runner旧应用测试原样通过，有runner普通导航仍不执行工具或调用provider。

## E. 组合验证和提交

1. 新测试tests/product/core004/覆盖Python窄接口、Node受控延迟/超时/乱序/单飞及真实子进程。用deferred或注入timer，不长睡眠/改系统时间；全部新建数据根。
2. tools/product_core004_demo.mjs在新core-004-demo-*根演示：合成provider→应用提交→startSelected→真实CSV→活动/结果/消息→重开。驱动器不能再替runner手工begin/accept/execute。第二场景为上下文失效或停止，证明无额外动作。分别记录synthetic_provider_calls与real_model_http_requests=0。
3. 复跑产品Python99基线、新旧Node65基线和本轮新增、Schema、新旧演示、manifest、本批scope。冻结旧测试不能为新实现改断言或漏收集。Node显式列测试文件，包含core003/architect-regressions.test.mjs。
4. 写docs/development/CORE-004.md和frontend-handoff，说明生命周期、unknown去向、资源所有权。reports/core-004/保存status=submitted的report、summary、checkpoint、manifest和原始日志，逐个验收ID裁定；manifest不含自身、动态日志或运行库。
5. 日志/报告落盘后复跑范围检查，保留失败、跳过、not_run，不写accepted，不展开CORE-005。

验收E01：两场真实本地组合演示及重开，旧接口和架构师补丁不退化。

验收E02：测试/Schema/哈希/范围PASS，写入来源明确，未运行项如实记载。

验收E03：真实模型、语义理解、跨语言自动联系运行器、原生隔离、后台常驻、系统通知和视觉仍not_run，不声称整个产品已完成。

## 本机命令

Python运行时：`..\companion-agent\.venv\Scripts\python.exe`，一律-I -B，显式绑定本工作区sys.path并断言services.__file__。产品测试tools/run_product_tests.py，禁止复制来的历史CLI总测试。

Node运行时：`..\companion-agent\.local-tools\node-v24.21.0-win-x64\node.exe`。精确列旧新测试；Schema仅在本批授权文件生成，其余检查走--check。

权威范围检查：`python -I -B docs/handoff/core-004/check_scope.py`。baseline/scope只读不得更新；旧检查器对应历史时点，不为通过它们而删除后来架构师的reviews/handoff。
