# BATCH-016 · 桌面连接真实本地服务（六包连续，无视觉）

## 1. 目标

工作区C:\Users\xiayu\Documents\Codex\companion-agent。先读AGENTS.md、reviews/BATCH-015.md、ADR-007，再完整读本派工。ADR-005/006为底层依据。旧CURRENT-TASK不执行。

六包A→B→C→D→E→F连续完成，约18个子任务，批末统一submitted。交付Node调用Python真实服务的桥，以及未来前端可直接接入的无视觉控制器：初始化→改偏好→提交→后台本地worker→观察→查看结果→取消/故障恢复。禁止只交mock接口或文字说明。

模型/HTTP/凭据读取/安装均0，不开Agent/子智能体/新会话，不启动HTTP/Electron/浏览器。允许固定本地Python子进程，非模型调用。初始产品视觉由架构师亲自负责，开始前需通知用户等调档；本轮不做Vue页面/组件、配色、图标/角色、模板或布局。

## 2. A包：stdio契约与后端入口（A1–A3）

A1：services/desktop_bridge/models.py定义内部desktop-local/1包络，request_id为规范UUID；固定action枚举仅覆盖015既有动作（bootstrap/profile.read/change/undo、task.submit/get/list/events/result/cancel/retry、worker.run-next/recover）。严格{version,request_id,action,payload}，额外字段拒绝；payload经现有业务模型校验，不复制模型。导出packages/contracts/desktop-local/schema.json，--check只读。

A2：services/desktop_bridge/入口和tools/desktop_bridge.py每次读取一条有界UTF-8 JSON请求、调用真实服务、返回一条关联request_id的响应；空/非法/重复键/多JSON/多余stdout/非法编码有明确错误。可复用015解析/分页行为，业务输出按对应Pydantic类型验证后序列化。输入上限384KiB、输出≤1MiB；task.result允许缩页但正确返回游标，不截断JSON。异常输出不能泄漏请求原文或环境变量。

A3：固定开发根reports/evidence/BATCH-016/runtime/，独立新虚构profile/task库和worker锁，不动015旧库；统一factory复用原repository/service/runner，代码import不创建库/进程。路径逐段拒绝重解析点，bootstrap唯一显式创建入口。不修改旧CLI固定根，不为测试去改原模块globals；测试通过新的factory内部依赖注入临时根，真实入口不可通过request/env指定root。

验收B16-A01：真实入口的合法/非法输入、Schema、关联ID/输出上限/无import副作用；业务校验确实复用现有实现。

## 3. B包：Node受限进程桥（B1–B3）

B1：apps/desktop/bridge/host/实现非renderer Node模块，spawn固定.venv Python和tools/desktop_bridge.py、固定cwd、shell=false、Windows隐藏窗口。可信工厂解析repo内运行时；页面输入无权覆盖python/args/cwd/env/db路径或提供任意action。仅透传最少运行环境项，无密钥环境读取/打印，不加载用户shell profile。未来系统Python/appData选择另批，不做自动安装/扫描账号。

B2：invoke(action,payload)生成关联request_id，bounded stdin/stdout/stderr收集，严格UTF-8/单JSON包络/version/id/exitCode验证。业务success与transport成功分开。已知只读请求timeout可显示unavailable；变更已发出但回执未知标outcome_unknown，不能假定未执行/自动重试。短响应size、stdout噪声、非零退出却ok、id不匹配等拒绝。错误日志只含code/进程状态/字节数，不打印原偏好/CSV/环境。

B3：可配置的可信超时/最多活动短请求数和一个worker进程，来自constructor而非request。dispose取消观察/关闭本bridge创建的进程、等待退出并settle所有Promise；不杀其他系统进程。子进程异常退出/pipe错误/超时无句柄泄漏。对变更请求的取消仅表示不再等待，不伪造业务已撤销。合成child测试可注入明确测试factory，不把任意spawn能力暴露到应用接口。

验收B16-B01：伪协议/超限/超时/进程崩溃等确定分类、无静默重试、真实后端可调用，spawn参数不可被payload注入。

## 4. C包：长任务与取消协调（C1–C3）

C1：worker.run-next由独立子进程异步执行，不占住唯一命令队列，其他task.get/cancel/profile.read仍可进行。以原OS worker锁为最终互斥权威，不另造后台任务调度器。submit不会凭自己猜任务完成，run-next返回也要按真实快照呈现。

C2：正常取消调用真实task.cancel，再观察cancelling→cancelled，不靠kill模拟成功。worker异常退出标transport故障，数据库仍按真实状态；显式recover/retry走原服务，使用新attempt。对结果提交后丢回执的合成测试，读回completed并保留结果，不能自动retry覆盖。只实现固定local_csv_audit，不新增模型执行器。

C3：bridge退出清理其子进程后再次打开，同一runtime身份/任务结果仍在；recover必须显式，不在connect时自动重做任务。旧bridge/旧attempt的迟到响应不覆盖新bridge状态。保留015“权限/实际进程退出/业务状态”区别，不修改已验收runner以配合前端假象。

验收B16-C01：真实后端长worker与并行短查询/取消互不阻塞；崩溃→读真实状态→显式recover/retry链通过。受控测试hook可在新factory测试层注入，正常入口不能接受hook/delay/crash参数。

## 5. D包：前端可用的无视觉控制器（D1–D3）

D1：apps/desktop/bridge/client/只依赖窄invoke接口，无node:导入、文件路径、spawn或SQL；实现初始化/profile读写/任务提交查询/结果分页的状态控制器，公开subscribe/unsubscribe/dispose。业务payload视为后端验证过的JSON，不手工复制整套业务schema。初始状态明确disconnected/loading/ready/error，不虚构AI在线、聊天或工作完成。

D2：任务观察先取快照再after_seq续取事件，按真实seq/attempt更新；刷新/切任务用generation令牌防旧响应覆写。分页cursor/终态/暂无事件/断开重连行为明确，轮询有下限和并发上限、无重入，每个watch可停止，全部dispose停止计时器。错误时保留已确认结果但标过期/断开，不清成假默认数据。不实现通用缓存框架，少量控制器足够。

D3：profile mutation保留expected_revision/command_id；冲突不自动覆盖新偏好。outcome_unknown允许显式read核对或以同command_id请求原结果，不自动发新命令。数据读取与动作分开，结果页能引用实际input hash/来源，不在客户端重算金额或将待确认问题抹掉。UI组件/自然语言聊天/提示词编排均不在本包。

验收B16-D01：延迟/逆序响应、重复事件、终态、dispose、分页和CAS冲突回归通过，client目录可在无Node能力环境导入。

## 6. E包：真实跨语言集成（E1–E3）

E1：Node bridge→实际Python入口→SQLite→固定CSV worker，用虚构Mira/Alex输入做bootstrap/profile.change/task.submit/run-next/watch/result/profile.undo，关闭重开后稳定id及旧任务数据不变。不是只测fake invoke。测试后端使用新factory固定评审/本批tmp根，不写历史015 runtime。

E2：成功、有待确认问题、queued取消、受控running取消、子进程故障和回执丢失各有价值的断言；可用握手文件/测试钩子，不靠生产代码sleep。跨语言传Unicode/引号内换行，精确金额0.1×0.2等保持字符串。检查清理后无遗留本bridge子进程和挂起观察。

E3：保留旧54+1业务测试的意义，不重跑会写旧015固定根的原CLI用例。本批若需调用旧测试，先复制到本批测试工具并仅重定向数据根/导入定位，保留说明；新Python单测和新Node集成覆盖实际依赖，旧authoring/桌面构建无改不重跑。不执行模型代码、不读holdout。

验收B16-E01：真实Node/Python端到端通过，测试mock只用于可控故障，不冒充正式Electron/浏览器/原生隔离。

## 7. F包：接线交付和检查（F1–F3）

F1：一个最小非视觉demo脚本展示实际调用，输出状态/金额/source refs；不打印长原始私密材料，不画产品页面。新frontend-handoff.md列接口、错误、观察/取消/恢复、如何future main/preload注入窄接口，以及尚未有Electron/IPC来源认证的限制。

F2：局部TS编译/类型检查、Python语法/Schema检查、新单测和真实集成各跑必要范围。复用已装Node/TS/Vitest/Python，不安装Electron/AJV/Schema编译器，不写一套通用Schema→TS生成工具；若确有类型生成依赖需求，记录下一阶段而非伪称完成。

F3：统一一个report/manifest/checkpoint/摘要，六包分列结果。manifest含源/局部配置/生成Schema/测试/必要fixtures/接线说明，不含runtime DB/tmp/日志。result_ref明确固定为sha256(canonical JSON artifacts列表)，同时报告完整manifest字节hash（两个字段不可混用）。不自写accepted。

验收B16-F01：可复现无视觉demo、hash/范围/历史证据准确，真实模型/语义理解/Electron/原生隔离/视觉继续not_run。

## 8. 精确写集

仅新增/修改：services/desktop_bridge/、tools/desktop_bridge.py、apps/desktop/bridge/（host/client与局部tsconfig，绝不renderer/现有root配置）、packages/contracts/desktop-local/、tests/unit/desktop_bridge/、tests/integration/desktop_bridge/（局部Vitest配置/fixtures）；reports/evidence/BATCH-016/；reports/BATCH-016.json/.md/.checkpoint.md。

其他全部只读，包括personal_ai/local_tasks原服务、旧tools CLI/worker、spikes/authoring、apps/desktop/renderer和现有配置、根依赖/lock/pyproject、旧DB/报告/模型/ledger、reviews、原任务/helper、架构/派工/检查器。公共旧契约不扩。无安装、网络/模型/凭据访问、Git提交/部署/分享；不读holdout、不绕过历史浏览器/截图/递归删除拒绝。若原服务必须修，记录具体复现和所需文件，继续独立包，不为方便越界。

基线docs/handoff/BATCH-016-BASELINE.json，权威检查器docs/handoff/check_batch016_scope.py。旧scope不是本批权限依据。

## 9. 连续执行与收尾

六包连续，每包或约60分钟checkpoint，包间继续不等待新提示；同因两次失败记明原因并推进独立部分。批末必要测试→report/manifest/checkpoint/摘要→scope落盘复跑含日志自身→hash与历史ledger/模型核对→taskctl validate/next --repo .。

status=submitted、batch_id=BATCH-016、dispatch_ref本文件及sha、base_ref新snapshot、result_ref及manifest_file_sha256明确；changed_files_this_round和B16-A01…F01、argv/exit/证据/未知项如实。原accepted12不变。完成可做范围后统一提交并停，不自写accepted/进入下一批。
