# CORE-002 · 让个人 AI 能重新打开、接着使用和可靠停止

日期：2026-09-24。派工角色：架构负责人。状态：ready_for_implementation。

## 1. 背景与本批完成标准

已有 CORE-001 实现 ProductKernel、可管理记忆、主动联系、一次性提醒、真实 CSV 任务和可信界面版本登记。派工前核对其 36 项成果哈希全部一致。既有记录为 Python 59 项、Node 5 项通过；这是历史验证，执行者须在本批最终代码上复跑。CORE-001 尚待集成复核，不能因为由架构师编写就免于验证。

本批交付一个可以供架构师 UI 接入的本地产品服务：能列出并重新打开会话；管理用户明确交办的提醒；停止待执行建议并对已提交任务发出真实取消；在会话切换及上下文变化时拒绝迟到结果。保持已有真实任务、身份、记忆和体验版本连续。

一次完成五包，而非做完一小卡就停。A → B → C → D → E 是同一个执行者的顺序工作，不开其他会话或子智能体。不以用满时长或新增测试数量为目标，不加入额外功能凑工作量。

## 2. 工作区、权威来源和冻结边界

- 唯一写入工作区：`C:\Users\xiayu\Documents\Codex\companion-agent-core`。
- 原 `C:\Users\xiayu\Documents\Codex\companion-agent` 只供读取文档和复用已安装运行时。BATCH-016-R2 仍在其自己的边界中，不复制或修补旧 host/client，不向原项目写报告、缓存、数据库或 Git。
- 先读根 `AGENTS.md`、`docs/product/product-experience.md`、`docs/decisions/ADR-008-product-core.md`、`docs/development/CORE-001.md`、`docs/development/frontend-handoff.md`，再读本批涉及代码。
- 本派工的精确写集见 `core-002/scope.json`。基线和检查器见 `core-002/baseline.json`、`core-002/check_scope.py`。派工文件、基线、检查器和旧报告只读；检查器输出不得改写成 PASS。
- 本批可演进 CORE-001 的产品源文件和接线文档；旧 manifest 保留原样，代表旧成果，不要求演进后的源码仍等于旧哈希。最终另建 CORE-002 manifest。
- 不触碰原有 `services/personal_ai`、`services/local_tasks`、`services/desktop_bridge`、个人空间实验源、依赖与锁文件、历史运行数据。产品层通过其现有接口复用。

所有测试新建数据根。不得读取旧 `.test-data` 下的数据库来构造场景；它们的字节也由本批基线冻结。Python 使用 `-I -B` 并断言导入的是 core 工作区；不得运行复制来的历史 CLI 测试。禁止读取环境密钥、DPAPI、凭据文件或使用旧 live ledger。

## 3. 共享产品与技术约束

1. 长期记忆默认开，可关闭、限定范围、编辑和遗忘；主动联系默认关。开启后由模型决定是否、何时联系。普通会话、首页和会话列表不能泄露自动联系计划、倒计时或预告时间；明确提醒则正常显示时间。
2. 默认 ModelPort 保持 UnconfiguredModel。测试只能使用明确标记的合成回执；不得增加真实模型/HTTP请求、额外代理、凭据读取、依赖安装、云服务或系统常驻任务。
3. 实际任务服务是状态权威。撤销模型建议、任务已请求取消、任务进入终态和 worker 进程退出是不同事实。不能因界面选择改变、Promise 被忽略或模型说完成就标记任务完成/已停止。
4. 可显示 provider_summary 仅来自可信适配器独立元数据；不从模型 JSON 中接受伪造推理链。不提供隐藏推理展示或计时假进度。
5. 前端接线层是可信本地宿主内部模块，不是生成页面的权限沙箱。不能把通用 request、路径、票据、权限或任意 action 转发给未来生成的 HTML。
6. 延续 product-core/1 envelope 和已有动作语义，新增命令采取增量形式。数据库版本与 wire 版本独立。新输入用现有 Pydantic 严格模式和统一错误码，拒绝多余键、bool 冒充整数、无效 UUID/时间/分页值。
7. 不重造任务队列、模型框架、向量库或模板系统；不执行模型生成代码。原生隔离、真实语义与产品视觉继续单列 not_run。

## A. 上下文一致性及可验证的数据库演进

目的：先修复已复现的过期主动消息，再为后续新增状态建立真正可迁移的数据库。

### 已复现的缺口

`core-002/dispatch-review.json` 记录了派工前的离线复现：同一会话已有第二条 turn，开始生成主动消息后再接受第二条 turn 的回复和自动记忆；没有新增 turn 行，也没有设置修订变化，旧联系结果仍被写入 inbox。当前 `MAX(rowid)` 只覆盖新增输入，覆盖不了已有回复或自动记忆变化。不要只补一个 if，应约束模型真正看到的上下文。

### 实现顺序和接口

1. 先写能复现该问题的失败用例，再修复。抽取可共享的上下文构建/校验模块，复用 ManagedMemory 的真实检索规则，不复制一套猜测的记忆列表。
2. 为普通 turn 生成和主动联系生成保存上下文签名或等价修订栅栏。提交结果前校验：同一会话新增输入、已展示给该次模型的历史回复变化、可检索记忆变化、来源遗忘/撤销、适用政策/授权变化。普通 turn 继续校验 profile revision。主动联系若实际传递了 profile，也必须将其纳入签名。
3. 签名只覆盖真实模型输入的稳定内容和必要授权；不含当前时钟、ticket、诊断事件序号或已读状态。单纯时间流逝、读取、标记消息已读、同一次生成自己的状态变化不能让结果永远无法提交。与该输入无关且不改变全局记忆/政策的其他会话，不应使其失效。
4. 历史检索先过滤 temporary 和 excluded_sources 再 LIMIT。普通 turn 历史只取该 turn 之前的可用记录，不把后来的用户消息当作此前历史；同一会话有更新输入时，旧生成结果不得覆盖新上下文。过期普通结果返回 context_changed，过期自动结果重新进入受预算约束的待复核状态，不自动无限重试。
5. 产品数据库升到 v2，统一容纳本批必要的上下文签名、提醒修订/命令日志及停止操作记录。可集中在 store.py，也可拆 migrations.py；避免每个包临时增加一种数据库版本。先列出 v2 表/列和约束，再实现。
6. 新根 bootstrap 创建 v2。已有 v1 只允许通过新增可信命令 `runtime.migrate`，payload 为 `{expected_version: 1}`，进行显式本地迁移。v1 上普通访问返回 migration_required；不删除数据库后重建。迁移到 v2 后，同一 expected_version=1 的重放返回 already_current，不能重复变换数据。
7. 迁移全事务；未知更高版本、缺表、错误身份、损坏库或不完整 v1 结构应拒绝且不改写。迁移中断不留下半套 v2。v1 生成中的 ticket 必须失效，转入既有 interrupted/model_failed 或 needs_retry；不自动重发模型、复活取消动作或改变已投递消息。其它既有 id、状态、偏好、记忆、动作、inbox 和体验引用保留。
8. `core-002/v1-schema.sql` 是派工时冻结的真实 v1 DDL，只读。以它在新测试根生成 v1 fixture，再放入代表性数据。不要调用演进后的 SCHEMA 再称作“旧库迁移测试”，不要借用历史运行数据库。

### 验收

- A01：上述复现改为不投递；重开后旧 ticket 同样无效。
- A02：普通生成期间收到新输入/自动记忆变更，旧结果不能写动作、记忆或 followup；负例覆盖无关读取、无关会话及单纯时间推进，不误拒合法结果。
- A03：超过 12 条且包含遗忘/临时来源的历史正确过滤、排序、截断；排除来源不能从历史绕过遗忘重新送给模型。
- A04：真实 v1 fixture → v2 保留业务数据；重复迁移幂等；受控中途故障回滚；未知版本/损坏/结构不匹配不写入。测试不得对历史文件做迁移。

## B. 可重新打开的会话与安全读取投影

目的：UI 重开后能找回对话和任务，不依赖前端内存里记住一串 UUID。

### 实现顺序和接口

1. 在产品层实现只读 `conversation.list` 和 `conversation.turns`。不创建第二套聊天存储，也不让前端直接读取 SQLite。
2. 两接口用确定性序列分页，不用时间字符串作为唯一排序键。输入采用 `{limit?, snapshot?, before?}`；turns 另需 `conversation_id`。limit 默认20/10，分别上限50/20。第一次返回 snapshot（当时最大 turn 序号）；后续显式沿用。输出统一 `{items, snapshot, next_before}`。无更多内容返回 null。
3. 会话列表按该 snapshot 内每会话最后一条非临时输入序号倒序分组，给出 conversation_id、latest_turn_id、cursor、最后活动时间、用户输入及回复的短预览。最多每段240字符，不自动调用模型生成标题。
4. 会话 turns 返回有界摘要：id/conversation_id/cursor/text_preview/reply_preview/state/temporary/has_actions/created_at。完整选择项仍从现有 turn.read 读取，避免每页夹带所有材料、任务事件和大结果。
5. snapshot 固定分页成员/顺序，允许记录当前状态更新；文档说明它不是整个数据库的历史快照。期间有新输入，当前分页不重复/漏掉 snapshot 中的成员，新输入在刷新到新 snapshot 后出现。
6. 默认历史浏览排除临时会话输入；已知临时 turn 仍可显式 turn.read。本批不声称临时输入从磁盘完全擦除，不新增删除会话功能。陌生 conversation_id 返回空列表或明确 not_found，选择一种并统一文档/测试。
7. 所有普通投影不得出现 CSV 原文、grants、ticket、内部自动联系 purpose/due_at/检查点。已有 turn.read 的行为保持兼容。

### 验收

- B01：真实重建 ProductKernel/Node host 后可列出并选回原会话，身份、turn id 和任务引用不变。
- B02：同时间戳、多会话分页、分页中插入新输入、空页、非法 cursor/limit 行为确定，不重复、不丢 snapshot 内成员。
- B03：临时输入不出现在默认历史；大文本只返回预览，输出在协议大小内；无内部计划/权限/材料泄漏。

## C. 用户明确提醒的查询、修改和取消

目的：用户能找回自己交办的提醒并修改；它与模型自主关心保持分离。

### 实现顺序和接口

1. reminders 增加正整数 revision；v1 行迁移为1。创建时的 request_hash 保持不可变，用于原始创建命令的幂等判断；不能随编辑覆盖。
2. 新增 `reminder.read {id}`、`reminder.list {limit?, before?}`，返回 id/text/due_at/state/revision 等可显示数据，列表上限100且确定性分页，只含明确提醒，不混入 followups。
3. 新增 `reminder.revise`：`{command_id, id, expected_revision, operation: 'update'|'cancel', text?, due_at?}`。update 要求完整 text 和未来 UTC due_at；cancel 禁止这些额外字段。严格形状由 Pydantic 约束，不在 JS 和 Python 各维护一套含义不同的校验。
4. 命令日志和修订在同一个产品数据库事务提交。相同 command_id/相同内容重放返回原回执；相同 id 改内容报 idempotency_conflict。先核对已有命令，再核对 CAS，丢失回执后重试不能被新 revision 错误挡住。
5. 只有 pending 可新修改/取消。已投递/已错过/已取消不能通过编辑复活。投递、取消或编辑都推进提醒 revision；与 deliver_reminders 串行化，保证旧时间/旧文本不会在修改成功后送出。已投递消息不被后续编辑改写。
6. 旧 `reminder.create` 和 `reminder.cancel {id}` 保持输入兼容，旧 cancel 也遵守终态和修订更新。本批新控制层只使用 reminder.revise 的 CAS 入口；文档将旧 cancel 标为兼容路径。重复 create 不能把已经修改的提醒重置回原值。
7. 关闭 proactive 不影响用户明确提醒；无额外模型调用。仍只支持一次性 UTC 提醒，系统通知、重复规则、自然语言时间解析不进入本批。

### 验收

- C01：创建→重开→列表/读取→修改→到期，只按新内容/新时间产生一条真实 inbox 消息。
- C02：同命令重放、冲突命令、过期 revision、非法时间、已终态编辑均按契约处理，无重复消息或重置。
- C03：修改/取消/投递的确定性竞态和丢失回执重放；关闭主动联系后明确提醒仍按既有 missed 规则工作。

## D. 真实停止闭环与无界面的可信会话控制层

目的：架构师以后只接少量稳定方法即可实现大任务区，避免 UI 自己拼取消和竞态逻辑。本包不写任何视觉页面。

### D1. 产品层 turn.stop

1. 新增可信命令 `turn.stop {turn_id, command_id}`。先持久记录停止意图并使该 turn 的待生成票据、未执行建议与依赖 followup 失效，再向已经确定提交的 CSV task 发实际 task.cancel。复用旧服务，不重写 task 状态。
2. 为每个需取消的 task 持久保存稳定取消 command_id；停止重放/重开恢复使用同一 id。跨库提交不宣称原子；已撤销权限不能因取消工具失败而恢复。
3. 输出分别表明建议权限 revoked、各任务真实状态/取消请求回执、未知结果及可继续核对的原标识。task.cancel 的回执不代表 worker 已退出。重复点击同一个停止意图不得产生新任务、新取消命令或复活动作。
4. 若 CSV submit 曾写入旧业务库但产品回执未知，不能为“找 task”而重新 execute 被撤销动作，也不能猜全部停了。没有已知 task_id 时保留需核对状态和原 action_id。本批不改旧任务库增加查询能力；这是明确的保守边界，写入交接说明。对已知 task_id 的取消未知，可读回现有 task 状态并重放原取消命令。
5. 保留 turn.revoke 原语及旧调用兼容；新用户“停止这次工作”走 turn.stop。普通切换会话不调用 stop。

### D2. 无界面控制层

新增 `apps/desktop/product/session.mjs`，只使用注入的可信 host transport。建议稳定入口：createProductSession({host})，提供 snapshot/subscribe、loadConversations、openConversation、selectTurn、refreshSelected、submitTurn、stopSelected、dispose。可补最少辅助方法，不提供任意 action 转发。

- capabilities 不从自由文本、模型 JSON、生成页面或普通 submitTurn 数据读取。若 submitTurn 需要授予作用域，必须来自构造时注入的可信意图判定函数；默认空。路径、运行时配置和受审代码 hash 不进入会话输入。
- 每次选择立即增加 generation，清空上一项可操作绑定并进入 loading。新快照到达后才启用对应操作；迟到结果、失败或已取消请求不能覆盖新选择。
- 停止操作在点击时冻结 turn_id/command_id，并等待该 turn 的真实 read/stop 结果。操作中切换页面不能把停止发给另一任务；切换回来可重新查询。取消旧视图的 Promise 不等于取消后台任务。
- submit 保留稳定 command_id、材料和所需确认上下文。传输 outcome_unknown 时通过原标识查询/按同内容重放，不生成新 ID 当作新任务。默认不自动 turn.respond，不因队列状态启动真实模型。
- snapshot 只含可呈现的选择、loading/error/unknown、会话摘要、当前 turn 和工具回执。不得把底层 host、ticket、能力列表、自动计划、SQL/path 暴露给订阅者。
- dispose 后不再更新订阅者；不默认杀死共享 host，host 生命周期由构造它的可信应用持有。宿主错误标准化，不暴露原始 stderr。
- 不引入 Vue/Pinia 等依赖；未来 UI 可用简单适配订阅此状态。它本身不是原生隔离的替代品。

### 验收

- D01：生成中、建议就绪、真实 task 排队/执行、已终态、未知提交等停止场景；真实 task 用既有服务，至少一个实际子进程运行/取消链。未知不能冒充成功。
- D02：停止进程在旧任务库取消已提交、产品停止日志未收尾时被真实终止；重开重放原 command 得到一致状态，不重复任务，不恢复权限。
- D03：可控延迟 Promise 覆盖快速 A→B、A 迟到成功/失败、B loading 时点击停止、停止 A 后切到 B、刷新重排、dispose 后回执；不得串任务/覆盖新页面。
- D04：提交回执丢失后仍保留原 command_id；新组件 snapshot 和所有订阅结果不泄露宿主权限/自动时机。读取和选择不偷偷触发模型或任务。

## E. 真实组合验收、契约和交接

1. Node host allowlist 加入上述新增动作，READS 正确区分读取与写入。错误的只读分类会把未知写入错误当未执行，必须测试。保持现有 stdio 上限、stream error 处理和 close 所有权。
2. Python 是输入契约权威；更新 `services/product/schema.py` 与 `packages/contracts/product-core/schema.json/README.md`，schema 可确定性生成/校验。新增会话和提醒投影在文档明确字段，避免模糊 dict 让下一模型猜接口。
3. 实际 Node → Python → SQLite → CSV 组合演示：建会话/提交材料（合成 ModelDecision 明确标注）→真实完成或取消→关闭 host→重开列回会话→读回原结果；明确提醒创建/修改；设置与记忆；确认普通投影不出现自动时机。主动联系到期竞态用 Python 可控时钟和脚本模型验证，不为演示引入产品可远程改时钟/注入模型的接口。
4. 更新 `docs/development/frontend-handoff.md` 和新增 `docs/development/CORE-002.md`，列出 UI 接线顺序、方法参数、状态、错误/恢复动作、仍未知边界。初始 UI 的布局、CSS、角色形象和动效留给架构师。
5. 复跑全部 `tests/product` Python、新旧 Node `tests/product/*.test.mjs`、产品 schema 检查和本批 scope。Node 文件使用显式枚举列表，不依赖 Windows shell glob 展开；所有产物必须来自实际命令输出。
6. 可运行旧 `tools/check_product_workspace.py` 作辅助诊断但不改写它；若原项目 R2 有新变化，其 original_source_drift 只能如实记录，不能回滚原项目让它通过。本批权威是自己的冻结基线、业务源不改约束和实际回归。

### 验收

- E01：旧产品行为回归与新增全部场景通过；失败和 skipped 逐项说明，不能用静态检查替代真实执行。
- E02：至少一个真实组合运行录得稳定个人身份、会话/任务 id、实际 CSV 结果或取消状态、重开可读；不触碰旧运行根。
- E03：契约生成一致，精确写集检查 PASS，manifest 逐项实算，历史报告和基线保持不变。
- E04：交接材料可让架构师只读它就开始 UI 接线；UI/模型/原生隔离/系统通知分别保持 not_run，不以本批测试数冒充整产品完成度。

## 4. 开发节奏和交付文件

每包完成后更新一个简短 checkpoint，继续下一包，不等用户逐包确认；不要自建几十份重复证明文件。遇到授权外源代码必须修改、不可恢复迁移问题或真实回归，先尽力在本批边界解决；确实不能解决时记录具体阻塞，不擅自扩大目录或伪造通过。

最终交付：

- `reports/core-002/report.json`：status=submitted，A01…E04 的实际判定及证据路径、变更文件、已知限制、模型/HTTP/凭据读取计数（本批必须为0）。每个验收 ID 按本派工实际存在的编号列，不补虚构编号。
- `reports/core-002/summary.md`、`checkpoint.md`：对人的简短汇总、可续接位置。
- `reports/core-002/artifact-manifest.json`：实际交付源码/契约/文档及各文件 sha256/字节数，不含运行数据库/自身/正在写的日志，报告记录该 manifest 实算哈希。
- `reports/core-002/evidence/`：命令、工作目录、退出码和原始日志；最终范围检查包括已落盘报告和日志自身后再复跑。没有截图就明确无截图，本批不要求视觉截图。

本批不使用原项目 taskctl/156 卡 accepted 数。五包完成后停在 submitted；独立复核和与 R2 的合并由交接方负责。

## 5. 本机运行入口

```powershell
Set-Location 'C:\Users\xiayu\Documents\Codex\companion-agent-core'
& '..\companion-agent\.venv\Scripts\python.exe' -I -B tools/run_product_tests.py --tb=short
& '..\companion-agent\.local-tools\node-v24.21.0-win-x64\node.exe' --test tests/product/host.test.mjs
& '..\companion-agent\.venv\Scripts\python.exe' -I -B docs/handoff/core-002/check_scope.py
```

第二条只展示既有 Node 入口，收尾必须显式列全新增 test.mjs。新增综合演示可放 `tools/product_core002_demo.py/.mjs`，必须每次 mkdtemp 新根，禁止以默认 `.product-data` 冒充测试隔离。脚本源码要断言本 workspace 导入根。
