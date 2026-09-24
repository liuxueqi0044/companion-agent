# BATCH-014 · 个人AI稳定身份与偏好（四包连续）

## 1. 本批目标

唯一工作区C:\Users\xiayu\Documents\Codex\companion-agent。先读AGENTS.md、reviews/BATCH-013-R1.md、ADR-005-personal-ai-local-state.md，再完整读本派工；ADR-002为上位理念。旧CURRENT-TASK及013/013-R1只用于历史查询，不再执行。

创作链已独立通过，停止扩展它。本轮开发真正可调用的本地应用功能：AI有稳定id，能保留用户明确设置的名称、称呼与交流偏好，有历史、冲突处理、撤销和重启恢复。先建立无视觉底层供架构师的前端使用。四包A→B→C→D、约12个小任务连续执行，包间checkpoint后继续，统一批末submitted。

模型/HTTP请求0，真实凭据读取0；不安装依赖、不开子智能体/额外会话/官方Agent。原两次模型额度已耗尽。原accepted12不变。初始UI由交接方架构师设计，开始前通知用户等待其调整推理档位；本轮不做页面、组件、视觉、模板或角色。

## 2. A包：数据契约和服务边界（A1–A3）

A1：services/personal_ai/models.py为单一Pydantic权威，版本personal-ai-local/1，extra=forbid。冻结ProfileSnapshot、Preferences、PreferenceRevision、ChangeRequest、UndoRequest、CommandReceipt等少量模型，避免通用万能dict。profile_id为本地生成UUID、不可由修改请求设置；revision用单调正整数。UTC时间由服务端clock注入产生，不信请求自报时间。

Preferences只需三个自由文本字段：ai_name（UTF-8≤128B，非空）、address_user_as（≤128B，可空）、communication_instructions（≤8192B，可空）。名称允许Unicode，拒绝无效Unicode/控制字符；交流偏好允许换行。保留用户有效原文，不静默trim改变内容，空白名字拒绝。默认ai_name为“我的AI”，其余为空。不要做风格枚举/模板；这里存明确偏好，不做情感推断。字段不包含系统提示、权限、账号或凭据。

A2：定义服务方法bootstrap/read/change/undo/history，repository接口仅服务这些职责。change接expected_revision、command_id和1–3个明确字段替换，遗漏字段保持、null/未知字段拒绝；UndoRequest接expected_revision、target_revision和command_id，只复制这个本地AI既有修订的偏好。快照/回执区分当前head和命令原始结果。错误代码明确not_initialized/conflict/invalid_request/idempotency_conflict/recovery_required/busy。

A3：从Pydantic确定性生成JSON Schema到packages/contracts/personal-ai-local/。生成入口可放模块schema.py，可check模式比较而不写，不手工维护另一个TS/Python定义。schema与文档准确标本地内部接口；不改原156卡、C01–C11或现有公共架构草案。说明未来UI/模型如何提供明确结构化请求，本批不声称自然语言已经能自动理解执行。

验收B14-A01：非法字段、类型强转、字节限额、空/Unicode边界被正确处理；Schema重生成无差异，输入不能修改profile_id/权限/执行状态。

## 3. B包：事务持久化与幂等（B1–B3）

B1：标准库sqlite3实现窄repository，不引入ORM/数据库框架。固定单用户数据库、明确schema版本，bootstrap原子创建一个身份和初始修订；重复或两进程同时bootstrap仍只有一个id。connect/import/read不能隐式新建空库；缺失返回not_initialized，损坏/未知迁移版本返回recovery_required，不删库或覆盖。已有库文件损坏、head失联不能默默返回默认配置。通过已知表结构/必要关系检查，不把任意SQLite文件当自己的库。

B2：变更在单事务内校验expected_revision→创建不可变revision→更新head→记录command receipt。两份旧版本请求最多一个成功，冲突不留下部分head/历史。command_id是安全长度ID（例如UUID），同id同规范化请求返回原命令回执、不重复应用；同id不同内容明确冲突。重放早期命令时不能把旧结果说成当前head。事务失败回滚；db锁占用有限等待并给busy，不无限重试。SQL参数化，不把自然语言拼进SQL。

B3：undo是新的递增修订，记录operation=undo及target_revision，引用本AI真实历史；不篡改/删除旧版本。history有上限和简单revision游标，例如默认20/max100，不能无界返回全库。数据库连接关闭、进程退出后重新读取一致。数据schema不明不自动迁移，本批不实现导出/云同步/多用户/账户删除或通用事件总线。

验收B14-B01：真实SQLite多连接/本地子进程CAS、幂等重放/冲突、事务失败重开、bootstrap竞争和undo/history均正确。子进程只运行本地测试代码，不是Agent/模型并发。错误路径保留原库数据。

## 4. C包：无视觉应用服务与调用入口（C1–C3）

C1：实现进程内PersonalAIService，使用A模型+B存储。只接收用户明确的结构化编辑，不根据文本关键词猜偏好，不接模型，不把偏好拼成高优先级指令。只保存明确配置，未来Hermes/MemoryPort仍是唯一语义记忆入口；本轮不增聊天记录库/向量库。服务不接受调用方自报owner来越过身份边界，当前只有本地单用户上下文，无远程认证承诺。

C2：提供tools/personal_ai.py窄JSON stdin/stdout CLI，支持bootstrap/read/change/undo/history；一次命令一个请求，输入输出上限例如32KiB/128KiB，严格UTF-8，分类退出码0成功/2可判别请求或状态错误/3未预期错误。固定数据根reports/evidence/BATCH-014/local-state/，无任意root/db路径/URL/shell/env重定向参数。只测试内部可注入数据库位置；导入不执行main、不创建db、不读账号或网络配置。使用已有路径检查经验：逐段拒绝symlink/junction/穿越，不把拒绝转换成新建其他目录。

C3：README和本批service-handoff.md说明真实请求/响应、错误、恢复边界，给未来UI一条“读取快照→提交指定revision修改→显示实际新状态→撤销”接线流程。前端视图变化、模型不可用不改变profile_id/偏好。只提供接口与合成consumer测试，不修改demo/1 SDK、不设计按钮/页面、不创建网络服务/路由。未接通的provider/executor保持unavailable，不伪造工作完成。

验收B14-C01：实际子进程CLI串行bootstrap→change→重启read→undo→history可操作，错误和幂等与服务一致；import无文件/网络副作用。不记录原始偏好到日志，日志仅操作id/状态等必要元数据；成功read的业务响应可以返回本地偏好。

## 5. D包：综合流程与交付（D1–D3）

D1：使用虚构用户Alex/AI Mira的完整链，三字段修改保留Unicode/换行；两个合成consumer模拟换视图和换执行器后读取同一服务，稳定id/配置不变。明确这只是本地状态独立性验证，不是实际Hermes/Codex接入。无权字段/过期版本/重放旧命令不会覆盖较新偏好；undo保留历史并生成新版本。

D2：针对损坏库、缺失引用、未知schema、异常超大JSON、非法UTF-8、数据库busy、事务中途失败等有价值的边界回归。复用现有pytest/std库；本机.venv已有Pydantic/FastAPI/pytest、sqlite标准库，无httpx，故不引入TestClient依赖。只运行本批测试、Python语法检查与Schema check；不重跑无修改的49项authoring/core/host或旧桌面/API测试，不跑真实网络进程。测试tmp全部在reports/evidence/BATCH-014/tmp/或review可重定向的pytest --basetemp下，固定CLI测试在本批local-state。新fixtures只虚构。

D3：一份manifest/report/checkpoint/摘要，包含源/Schema/测试/必要fixture/服务接线说明，不将SQLite运行库、日志、tmp、依赖或报告自身算不可变成果。schema generator不得依赖调用工作目录或网络。命令准确留argv/exit，失败后修正的日志保留。本轮无真实用户数据、凭据、模型/HTTP。不宣称生产数据库/多用户认证/聊天记忆/原生隔离/视觉验收完成。

验收B14-D01：完整流程和边界测试实际通过，文件/Schema/manifest一致，旧成果/账本只读，清楚区分实现与未接入能力。

## 6. 精确写集和范围

仅可新增/修改：
- services/personal_ai/（新应用模块、模型/SQLite/service/schema生成器/README；一般4–7个职责文件，不需凑数）。
- tools/personal_ai.py（新CLI）。
- packages/contracts/personal-ai-local/（生成JSON Schema与说明）。
- tests/unit/personal_ai/（新测试、helpers与虚构fixture）。
- reports/evidence/BATCH-014/。
- reports/BATCH-014.json、reports/BATCH-014.md、reports/BATCH-014.checkpoint.md。

除此均只读：原services/control和tools/verify_task、所有spikes/authoring、apps桌面、原依赖/lock/pyproject、原156卡/helper、旧reports/账本/候选、reviews、架构/派工/检查器。不删除已有文件、不安装、不联网、不读holdout、不绕过历史浏览器/截图/递归删除拒绝，无Git提交/推送/部署/分享。父目录需要新建允许，但不改原__init__.py；现有wheel已包含整个services/tools，无需改打包配置。

权威基线docs/handoff/BATCH-014-BASELINE.json；检查器docs/handoff/check_batch014_scope.py。旧scope看到架构师评审/派工会报变化，不能拿来当本批权限依据。若需要越界写，先记录具体需求、继续独立工作，不擅自修改。

## 7. 连续开发及收尾

A→B→C→D连续做，每包或约60分钟更新checkpoint，包含剩余项/精确下一步。两次同因失败后停止该路径并记录，不无限重试、不把剩余全部说完成。

报告status=submitted，batch_id=BATCH-014，dispatch_ref本文件及sha256，base_ref新snapshot_id，result_ref绑定manifest；changed_files_this_round、B14-A01/B01/C01/D01结果、argv/exit/log及未知项如实列出。原accepted12不改。

必要测试→报告/manifest/checkpoint/摘要→范围脚本落盘复跑包含日志自身→成果及历史ledger/hash核对→docs/execution/taskctl.py validate与next --repo .。真实模型、浏览器、native、视觉仍not_run。四包完成可做部分后统一submitted并停止，等待独立复核，不写accepted/不执行下一批。
