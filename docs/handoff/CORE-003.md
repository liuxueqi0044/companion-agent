# CORE-003 · 将核心服务接成可用的应用层

日期：2026-09-24。状态：ready_for_implementation。

唯一开发目录：`C:\Users\xiayu\Documents\Codex\companion-agent-core`。

## 1. 这一批要交付什么

把已实现的对话、记忆、主动联系偏好、提醒、收件箱和任务结果，接成一套**不含视觉界面的可信应用控制层**。下一步架构师制作首页、记忆页和任务展开区时，应能直接调用这一层，不再把数据库和并发逻辑塞进 Vue 组件。

这次是五个完整功能包，不是五个文档卡。按 A→B→C→D→E 连续实现；每包记 checkpoint 后继续，全部完成后统一 submitted。不要按运行时长停止或为了凑时长增加功能。初始视觉仍由架构师亲自负责。

前置已完成：`reviews/CORE-002-R1.md` 裁定 accepted_with_architect_fixes，仅限本地核心。当前有效成果是 `reports/core-002-r1-architect/final-artifacts.json` 的15项；原 submitted manifest 代表补丁前版本，不能据此覆盖架构师补丁。原项目的 accepted 卡数不变。

## 2. 必读、复用和冻结范围

阅读顺序：根 `AGENTS.md` → `docs/handoff/CURRENT-TASK.md` → 最新评审 → 本派工 → `core-003/application-contract.md` → `core-003/scope.json` → 对应实际源码和测试。先复用 `createProductHost`、`createProductSession` 和既有 Python 命令，不另建数据库、事件总线框架、命令服务器或 Agent 执行器。

- 新实现放 `apps/desktop/product/application/`，使用现有 Node ESM，无框架依赖。
- 新测试放 `tests/product/core003/`；新演示 `tools/product_core003_demo.mjs`；实现接线文档 `docs/development/CORE-003.md`。
- 只允许追加/校正 `docs/development/frontend-handoff.md` 中本批接线内容。Python、host.mjs、session.mjs、旧测试、Schema、依赖和锁文件全部冻结。若发现只能改冻结生产文件才能处理的真实缺陷，记录最小反例和所需接口改动，由架构师处理；不偷偷扩大写集。
- 原 `companion-agent` 只读。BATCH-016-R2 未有完成报告，不合并、不执行其历史测试。
- 不制作 HTML/Vue/CSS/主题/角色形象；不接 Electron、生成页面、MCP、新模型适配、定时后台、系统通知、网络监听或自动恢复。
- 模型/HTTP/凭据读取、额外会话/子代理、安装、Git提交/推送/部署、生成代码运行均为0。

权威架构是 `core-003/application-contract.md`。本派工决定目标与验收，该契约固定入口、数据所有权和不确定结果处理。实现者可决定私有函数与合理文件拆分，不自行变更公共语义。

## A. 共享控制基础与偏好入口

目标：用户从记忆页或主动联系页改设置时，使用同一份有版本的政策；并发响应不会把新的意图覆盖掉。

1. 实现契约中的最小共享状态/传输助手及政策控制器。构造和 subscribe 不发请求；所有输出深拷贝、字段白名单、错误码净化。通知前登记请求所有权，隔离订阅者异常；dispose 后不发新请求、不再发布迟到结果，不关闭共享 host。
2. `refresh()` 读 `policy.read`；`updateMemory`/`updateContact` 只接各自字段白名单和 expectedRevision。由当前确认的政策构造完整 CAS 请求，不从页面接收整份内部配置。内存策略与主动联系策略共用修订号和写操作闸门。
3. 冲突重新读取供用户查看，但不自动重放旧修改，不把旧值合并到新政策后再次写入。未知回执保持 uncertainty，不能默认成功；显式读取当前政策后才允许用户以当前 revision 再表达意图。
4. `contact.controls` 只取用户可管理的政策与屏蔽话题；block/unblock 走既有固定命令。禁止调用 contact.inspect/tick。默认记忆ON、主动联系OFF；读取/导航不会开启主动联系。开启只由显式 updateContact 意图触发，暂停/恢复也不预告下一条消息时间。
5. 后续 memory 操作会提升 policy revision。共享层提供失效/重读机制，避免记忆页和联系页各藏一份被当成权威的陈旧政策。

验收：

- A01：无IO构造、重入单飞、listener抛错、通知中dispose、迟到成功/错误均有实际断言；既有 session 不重写。
- A02：真实政策CAS成功/冲突、两个入口交叉修改、未知回执后读回，不丢其它字段、不自动重试写操作；默认值保持正确。
- A03：字段越权（如通过 memory patch 开 proactive）、未知字段、恶意异常字符串被拒绝或净化；所有默认快照中无内部联系计划。

## B. 记忆管理控制器

目标：用户能查看、分页、手工增加、修改、忘记、清空记忆，且这些动作与全局记忆开关含义一致。

1. 实现 refresh/loadMore/select/add/edit/forget/clear；列表使用真实 memory.list 倒序游标。刷新首屏使旧分页失效；相同页去重，不能把旧页拼到新列表。明确本批分页是现有API的实时分页，不声称快照隔离或完整语义召回。
2. select 只绑定已确认条目ID与revision；edit/forget冻结点击时的对象，不在await后重新取当前选择。更新与读回形成边界，先前读取不能恢复被忘记的条目。关闭记忆使用不等于删除内容，用户仍可显式进入管理页查看和修改。
3. clear 必须接收用户已确认的布尔参数和当前 expectedPolicyRevision；本批仅实现接口契约，不设计确认弹窗。它清空的是记忆，不删除身份、会话、任务、用户文件。
4. 重点处理现有 memory.add **没有命令幂等键** 的限制：发送结果未知时绝不重发。保留 operationId/操作种类/unknown 状态，刷新真实列表帮助核对；不得按相同文本或列表长度猜测“已成功”。按契约显式 acknowledgeUnknown 后允许新的用户意图，不能把 acknowledge 写成后端成功。
5. 内部待核对命令可保留必要材料，但普通应用快照不暴露请求正文、授权、路径。离开 memory 面板清空展示内容与选中绑定，迟到请求不重新填入；必要的写入核对记录保留到结算或应用dispose。

验收：

- B01：真实增加/编辑/忘记/清空、修订冲突、关闭记忆后仍可管理；身份和已存在任务不受影响。
- B02：分页重复/乱序、刷新与加载更多交错、选A编辑时切B、删除前的旧读回、离开面板后迟到响应，不串线或复活旧内容。
- B03：在包装层丢弃一次真实 memory.add 回执，数据库仅增加1条，控制层不自动重发；读回不凭文本认领成功。确认 unknown 的操作绑定正确，旧回执不能清除新操作。

## C. 收件箱与显式提醒

目标：用户能看真实到达的消息、标记已读、了解联系原因，以及创建/修改/取消自己明确要求的提醒。

1. 收件箱基于 inbox.list 实现刷新、增量分页和去重；字段白名单去掉 dedupe_key 等内部字段。打开/刷新不自动已读；markRead只能指向已展示消息。未读数以 home 读回为准，不用当前页条数或乐观减一冒充全局数量。
2. explain只在用户请求时调用，并绑定该消息与当前选择代次。主动消息显示真实 explain 的 basis；不泄露未发送计划，不推导或补写未来联络时间。
3. 提醒实现 list/select/create/update/cancel；取消使用 reminder.revise(operation=cancel)，不用旧 reminder.cancel。创建和修改都在内部生成稳定 command_id；未知结果只允许原命令显式重放，双击/重入单飞，重放不能改文本、时间、目标或revision。
4. 更新成功必须核验ID/revision等回执关系，陈旧结果不覆盖新选择。冲突让用户读当前版本后重新操作，不悄悄覆盖。显式提醒的时间正常展示，与自主联系的不预告原则分开。
5. 单次加载与内存留存有界（每页最多50，列表最多保留200）；不要为找一条记录启动无界分页。说明截断和刷新语义。跨应用实例的已读变化在显式refresh时从起点重读当前页，不把只拉增量误当已同步已有条目的read状态。

验收：

- C01：真实任务完成消息入箱，重复sync无重复消息；打开不已读，显式markRead后home未读数正确；解释归属不串线。
- C02：真实提醒创建/修改/取消、过期/非法输入与revision冲突；丢弃一次真实提醒写回执，原命令重放不产生第二条提醒或第二次修订。
- C03：分页/读回乱序、已读操作前的旧refresh、提醒选择切换、返回错误ID/版本、dispose与同步重入；未知回执不冒充成功。

## D. 真实工作进度与结果投影

目标：为后续大面积任务活动区提供可信数据，用户能分清“AI说要做”“任务已提交”“工具正在做”“确实完成”“仍需核对”。

1. 新建纯函数活动投影，不改变Python状态、不解析聊天文字猜完成。分别保留turn状态、每个action状态、工具task当前attempt/status、取消请求和unknown。对已接纳但工具未完成的action，不显示整体完成。
2. provider_summary仅使用现有可信字段，可空；独立标注为公开摘要。事件使用真实task event，按(task_id,attempt_id,seq)去重/排序并核对归属。没有阶段百分比来源时留空，禁止按时间假造进度、思维链或成功消息。
3. 新结果控制器只允许打开当前确认turn中已完成CSV任务，调用task.result分页读取。冻结turn/task/attempt绑定；迟到旧attempt结果不能成为当前结果。task/attempt不符返回protocol_error或stale_view，旧页面不能拼接新attempt。
4. 行和issues分别沿next_offset/next_issue_offset加载，每页上限50；最多留500行和500条问题，并显示截断状态。各游标独立前进，已耗尽的一侧不能反复追加；不预拉全部材料。保留来源引用、币种、completeness、requirements_interpretation，混合币种/缺列时不伪造总额或语义理解。
5. 取消回执与停止工作分开：permission_revoked/cancel_requested不能当worker_exited=true；turn已cancelled但真实task仍running时，活动区数据必须保留这个事实。不要给未知状态套上成功文案。

验收：

- D01：表驱动覆盖queued/generating/accepted/failed/cancelled/outcome_unknown及任务queued/running/cancelling/completed/failed/interrupted，模型回复自称完成不影响判定。
- D02：真实CSV完成后分页读取来源/总额；混合币种与缺列样本正确呈现不完整结果，语义理解仍为not_run。
- D03：错误task/attempt、停止后仍运行、事件串线、旧结果迟到、新attempt与分页交错、行/问题单侧耗尽，都不能产生错误完成或结果拼接。

## E. 组合入口、真实演示与交接

1. 实现契约中的createProductApplication。组合已有session和本批控制器，提供首页、会话、记忆、联系设置、收件箱、提醒的无视觉导航/操作入口。app持有自己的控制器，不拥有共享host生命周期；dispose只清自己的状态/订阅。
2. initialize显式bootstrap/read home；refresh只读当前面板所需状态。导航不触发模型、tick、worker、recover、migrate、界面激活或授权改变。无自动计时器/轮询/OS通知。首页不默认加载记忆全文和联系计划。
3. 新演示在每次新建的core-003-demo-*根中，以真实host+新应用层完成：初始化→记忆编辑/开关→主动联系显式开启/暂停/关闭→提交虚构CSV输入→测试驱动器显式注入合成决策、execute/worker→应用活动与结果→消息已读→提醒修改/取消→释放并重开读回身份/结果/政策。生产应用层不提供合成模型入口；演示驱动器单独持有可信host。
4. 真实Python服务仍是权威。可控乱序/断线/丢回执在测试transport包装层注入，不能只用静态假数据通过验收。禁止改变系统时间或旧数据库；自动跟进/提醒的时间相关后端行为用新Python测试的注入clock验证，不增加生产“设置时钟”命令。
5. 复跑全部产品Python、新旧Node、Schema只读检查、旧离线演示和新演示。既有基准99Python/22Node；新增数量按实际，不追求虚高计数。新Node测试应提供显式文件入口，Windows命令不依赖shell glob。
6. 写docs/development/CORE-003.md与frontend-handoff，交付API表、用户动作顺序、错误/unknown处理、产品状态与未实现项。保留新源码的设计选择和最少必要注释，不写假想UI截图。
7. 写reports/core-003/{report.json,summary.md,checkpoint.md,artifact-manifest.json,evidence/...}。逐个验收ID记实际结果/证据；status=submitted，manifest只含源码/测试/演示/文档，不含自身、动态日志和运行库。批末日志落盘后复跑本批scope，不改accepted或旧报告。

验收：

- E01：一次真实Node→Python→SQLite→CSV组合演示和重开通过；常规导航实际请求日志中没有禁用命令/网络/凭据读取，主动联系默认为OFF且没有计划预告。
- E02：全量定向回归、Schema、产物哈希、CORE-003范围检查通过；全部历史文件除授权frontend-handoff外保持字节不变。
- E03：五包有可调用源码和接线说明；真实模型、语义理解、后台运行、系统通知、原生隔离、视觉/截图均如实not_run。完成后停止，不自行进入CORE-004。

## 3. 命令与证据

在唯一工作区运行：

```powershell
& '..\companion-agent\.venv\Scripts\python.exe' -I -B tools/run_product_tests.py --tb=short
& '..\companion-agent\.local-tools\node-v24.21.0-win-x64\node.exe' --test tests/product/host.test.mjs tests/product/host_core002.test.mjs tests/product/session.test.mjs tests/product/core002_r1/session-races.test.mjs tests/product/core002_r1/session-submit.test.mjs tests/product/core002_r1/session-reentrant.test.mjs
& '..\companion-agent\.local-tools\node-v24.21.0-win-x64\node.exe' tools/product_core002_demo.mjs
& '..\companion-agent\.local-tools\node-v24.21.0-win-x64\node.exe' tools/product_core003_demo.mjs
& '..\companion-agent\.venv\Scripts\python.exe' -I -B docs/handoff/core-003/check_scope.py
```

实现者在命令表追加所有新增Node测试入口。Schema检查用Python -I -B，显式sys.path指向本工作区并断言services.__file__，随后调用services.product.schema.main的--check路径；不得运行会改写schema的默认路径。

Python依赖只读复用原项目venv，其editable指向原目录，所以不得直接python -m导入原项目。测试只使用全新pytest根或新建.test-data/core-003-*；旧测试可新建host-*、core-002-host-*、core-002-demo-*、demo-*。严禁复用历史库。不要运行复制来的旧CLI总测试。

本批scope/baseline由架构师封存，不重建、不修改。旧scope会看到后续架构师reviews/handoff变化，这不是要求你删文件“修绿”。若本批scope失败，如实列出来源并停在提交状态；不回滚不明并发修改。
