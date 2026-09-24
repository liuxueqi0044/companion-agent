# BATCH-015 · 本地任务完整流程（扩大为六包）

## 1. 交付目标

唯一工作区C:\Users\xiayu\Documents\Codex\companion-agent。读AGENTS.md、reviews/BATCH-014.md、ADR-005/006后完整读本派工；需要规则时读first-flow.md及旧TS parse-csv/model。旧CURRENT-TASK不是入口。

用户要求显著扩大工作量。本轮A→B→C→D→E→F连续完成约18个小任务，包间checkpoint后继续，批末一次submitted。交付实际可操作的“稳定身份→任务提交→固定本地工具处理文本/CSV→持久结果→取消/重启恢复”，不是六份设计说明。不要每20分钟停下来等新提示，也不要为了耗时间扩功能。

模型/HTTP0、凭据读取0、安装0；不开Agent/子智能体/新会话，不启动网络服务。原两次额度已耗尽。初始UI仍交接方架构师亲自负责，开始前先通知用户等调推理档位，本轮不设计界面。单一本地worker不等于多Agent。原accepted12不改。

## 2. A包：收敛014两项问题（A1–A3）

A1：修B14-R01。幂等重放从commands读缓存前，与真实result_revision重建的完整ProfileSnapshot比较（含偏好、时间、id/revision）。不一致recovery_required，不偷偷修库或返回篡改结果；命令operation/id/result_revision与revision记录也须双向一致。现有_inspect的LEFT JOIN注意NULL语义，不能缺命令记录却因比较NULL漏判。小修现有实现，勿换数据库或再造存储层。

A2：修B14-R02，history只用None表示省略；[]/False/0/空字符串交给严格模型拒绝。正常dict/model调用不变。只修明确边界，不扩大成任意恶意本地数据库安全证明。补合成错误快照、错命令关系和正常旧命令重放测试，失败不改库字节/历史。

A3：原26测中受影响部分及新增回归通过；固定CLI测试根改为BATCH-015/local-state，不写旧014证据。旧报告/数据库原样保留，新报告单列修订。A通过前不可依赖它声称新集成完成，B/C的独立开发可推进；禁止自写accepted。

验收B15-A01：旧两探针关闭、原幂等/撤销/CAS行为保持，修订证据清楚。

## 3. B包：持久任务状态与契约（B1–B3）

B1：新services/local_tasks/models.py作为local-task/1内部Pydantic唯一源，导出packages/contracts/local-task/schema.json；不改公共C01–C11/原任务卡。定义Submit、TaskSnapshot、Attempt、Event、Result、Cancel/Retry请求及有限分类错误，字段/UTF-8/枚举/未知项严格校验。输入只需requirement_text和csv_text，二者均非空；单文本≤64KiB、CSV≤256KiB、不可变input_hash。任务profile_id和profile_revision来自已有PersonalAIService.read，不信正文自报；命令id用规范UUID，未知executor/tool一律拒绝。

B2：任务SQLite与profile库分开，复用标准库事务能力，只实现tasks/attempts/events/idempotency等必要表，不引入ORM或通用事件平台。提交相同幂等键同输入返回同task；不同输入返回冲突。queued、running、cancelling、completed、failed、cancelled、interrupted合法转移显式定义，状态与单调事件seq事务更新。任务created时间及attempt时间取服务clock，结果/历史不可被覆盖。

B3：read/list/events/result分页有界，快照带最后seq，事件cursor明确只返回后续序号；读无副作用。retry只允许failed/interrupted，新attempt_id/序号、同一不可变输入及固定工具版本，旧attempt和结果保留。completed/cancelled不得被迟到旧attempt回执改写。损坏、未知schema/缺引用返回恢复错误，不bootstrap覆盖。

验收B15-B01：幂等提交、状态非法转移、快照/事件一致性、旧attempt迟到、分页/重启读取均可验证。不是完整Agent生命周期验收。

## 4. C包：真正执行一个有用的本地工具（C1–C3）

C1：固定csv_audit/1工具，输入必须是需求文本+CSV，需求文本原样/按hash引用保存，requirements_interpretation=not_run。CSV使用标准库csv.reader(strict=True)，保留原始字符串/行记录，UTF-8、引号内换行、CRLF等有明确处理。借鉴旧TS来源规则及公开normal/missing/expected/correction样本，不读取holdout。数值和币种规则对齐旧parse-csv：qty/unit_price严格非负十进制，currency仅原表三位大写代码；列名按item/qty/unit/unit_price/currency等旧REQUIRED_COLUMNS实际定义，不猜列别名。

C2：确定性Decimal计算行小计，记录公式和输入cell引用；不使用float、不设地域币种/汇率/税率，不猜文本里价格。可设明确精度边界：数值最多28个数字、8位小数，超限为待确认；localcontext精度足以覆盖乘积和≤500行求和，不静默舍入。输出金额为十进制字符串，未知null、已知0保留。缺列统一一个列级问题，空值/非法值定位到record/column；行号说明是逻辑记录还是物理行，不让含换行字段的来源错位。最多500数据记录/50列/单cell16KiB；限额错误明确拒绝，不截断数据。

C3：单一已知币种且全部必要金额已知才完整合计；部分已知标部分小计；混合币种不求跨币种总和，可分别列同币种已知小计并说明。缺字段/歧义只生成待确认问题，不生成不存在的明细行。结果绑定input_hash、tool/version、来源与formula，paid_model_calls=0；不要说整机成本为0。输出类型/来源引用复核后才能作为任务completed结果；这不代表用户已确认、自然语言理解或S0–S5全部完成。

验收B15-C01：正常、缺整列、空/零、混合币种、Unicode、引号内换行、非法CSV、超限/长小数等有实际输入输出测试；已存在成熟库承担解析，勿自造CSV parser。

## 5. D包：单worker执行、取消与中断（D1–D3）

D1：run-next显式启动至多一个queued任务，不常驻后台，不调用shell/任意用户代码。固定工具白名单只有csv_audit/1。用OS文件锁保证同一task store最多一个worker，锁位置受固定数据根保护；锁忙返回busy。task claim、attempt创建/启动与事件在事务内完成，执行时不长期占用写事务。worker只持自己的token/attempt，发布结果重新比对。

D2：取消queued直接cancelled；running标cancelling，工具在开始/处理记录/结果提交前合作检查，实际停止后才cancelled。结果/事件/状态在同一事务发布，cancel与完成谁先提交由DB顺序决定；终态后取消有明确no-op/too_late回执，不能捏造撤销已完成结果。测试可注入checkpoint控制时序，生产不能加入sleep拖时长。输入和profile偏好不受取消影响。

D3：worker真实异常退出后OS锁释放；显式recover只有拿到同一独占锁才能把遗留running/cancelling标interrupted并关闭attempt，不能把仍活着的worker误判掉。recover本身不重跑；用户retry才创建新attempt并重新排队。原子提交失败不出现completed但结果缺失；中断旧worker晚发布不能覆盖新attempt。不凭PID存在判断，不杀任意进程、不递归删临时目录。

验收B15-D01：两个本地进程争worker锁、受控取消、受控崩溃→recover→retry、新旧attempt归属、提交事务失败实际通过。允许这些纯本地子进程测试，不是模型并发。

## 6. E包：统一无视觉应用入口（E1–E3）

E1：composition facade复用PersonalAIService和LocalTaskService，不复制profile模型/数据库。稳定profile保持不变，task固定提交时profile_revision；随后改偏好或合成切换view/provider不改旧任务输入/结果，也不被作为执行指令/授权。未初始化时明确not_initialized，不隐式创建新AI。

E2：tools/personal_workbench.py新固定根JSON CLI，一次请求一个动作：bootstrap、profile.read/change/undo、task.submit/get/list/events/result/cancel/retry、worker.run-next/recover。字段和返回值从模型/服务映射，不新增任意路径、shell、工具代码、URL或env重定向。输入可设384KiB，输出≤1MiB；结果若会超过上限，按明确行/事件分页读取，禁止已做副作用再假报未执行。JSON重复键/非法UTF-8等在调用服务前拒绝。仅固定reports/evidence/BATCH-015/local-state/；内部测试可注入临时root，公开CLI不允许。导入无创建DB/进程/网络/读取秘密的副作用。

E3：把未来前端所需的查询/动作/错误说明放服务README与本批frontend-handoff.md，附真实最小请求响应、任务状态语义、结果来源。统一入口只作为本地试用，不注册HTTP路由、不启动Electron/浏览器、不设计按钮/聊天页面、不把CLI当远程认证API。前端由架构师之后设计，当前只需能无视觉驱动完整流程。

验收B15-E01：真实CLI串行bootstrap→改偏好→submit→run-next→get/events/result→重启read→retry/undo适用动作一致，可通过script复现，无模型/HTTP。

## 7. F包：整体交付与后续交接（F1–F3）

F1：公开虚构样本贯通本地流程；一条成功、一条有待确认问题但合法完成、一条非法输入失败、一条取消、一条崩溃恢复。断言实际计算结果、source refs、事件、attempt和DB状态，不用只检查字段存在的测试堆数量。不运行holdout、实际用户文件/聊天、模型源码。

F2：运行新local_tasks测试、A修订后的personal_ai测试、Schema --check及Python语法检查。无需跑未修改的authoring/core/host/桌面/旧Agent测试；离线相关范围即可。成熟模块复用，不为加大批次把未接真实模型标完成，也不扩大到代码生成/技能发布/通知/TTS。

F3：一个报告/manifest/checkpoint/摘要，六包结果分列即可，不搞18套报告。manifest含代码/生成Schema/测试/必要fixture/接线说明；运行SQLite/tmp/日志不算不可变成果。报告列实际失败及修复日志、argv/exit，数据/来源/未知项如实记录。架构决定或确需越界的事项集中记录，每包存checkpoint后继续独立部分；连续较长执行，不按小时凑代码。

验收B15-F01：全链正确、新旧成果hash/范围通过，明确本批只有确定性工具，无语义AI/真实执行器/原生隔离/视觉验收。

## 8. 精确写集

允许新增/修改：services/personal_ai/（仅A相关正确性修订/文档/核验脚本）、tools/personal_ai.py（A+固定新数据根）、tests/unit/personal_ai/（相关回归）、packages/contracts/personal-ai-local/（仅随模型生成的必要变化）；新增services/local_tasks/、tools/personal_workbench.py、tests/unit/local_tasks/、packages/contracts/local-task/；本批reports/evidence/BATCH-015/和reports/BATCH-015.json/.md/.checkpoint.md。

其他只读：旧reports及全部旧证据/模型/账本/锁、reviews、spikes/authoring、原services/control、apps桌面、公共原契约/156卡/根依赖/pyproject/lock、架构/派工/检查器。不删除既有源文件、不安装依赖、不联网、不提交Git/部署/推送/分享。不读holdout内容，不绕过历史浏览器/截图/递归删除拒绝。只能操作本批合成测试状态，不改旧014真实提交DB来测试。

新基线docs/handoff/BATCH-015-BASELINE.json，权威check_batch015_scope.py。不改旧scope或基线；旧派工的检查不适用于架构师已写入新评审的当前状态。工具版本和数据根以本轮为准。

## 9. 连续执行与批末

每包或约60分钟写checkpoint（完成/剩余/精确下一步）。小阻塞记录后继续独立包，同因两次失败停止该路径，不无界重试；不要因某一个边界未通便丢弃其他已完实现。A依赖未通过不能对后续集成宣称完成。四到六包在当前单一对话完成，不新建会话。用户希望更大工作量，不代表允许越界。

必要回归→report/manifest/checkpoint/摘要→权威scope落盘复跑含日志自身→manifest及旧账本/模型hash→taskctl validate/next --repo .。status=submitted，batch_id=BATCH-015，dispatch_ref本文件+sha，base_ref新snapshot，result_ref新manifest；changed_files_this_round、B15-A01…F01结果及未知项清楚。原accepted12不改。可做部分完成后统一提交并停止，不自写accepted/执行下一批。
