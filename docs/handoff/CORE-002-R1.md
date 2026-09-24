# CORE-002-R1 · 四个已复现缺陷的连续修订

日期：2026-09-24。工作区：`C:\Users\xiayu\Documents\Codex\companion-agent-core`。状态：ready_for_implementation。

## 1. 先读与边界

根 AGENTS.md → reviews/CORE-002.md/json → 本派工 → core-002-r1/scope.json/baseline.json → 对应源码/测试 → docs/development/frontend-handoff.md。CORE-002 原派工保留为产品背景，本文件覆盖其在这四处发现问题后的执行要求。

架构师独立复跑83项Python、11项Node、21项manifest、Schema与真实离线组合演示均通过；额外四个反例不满足验收，裁定 changes_requested。不要把已有回归绿灯当作可以跳过本次修订，不要重写原报告为 accepted。

五包是一个批次，同一执行者依次 A→B→C→D→E；包间写简短 checkpoint 后继续。没有必要逐包请求用户确认，也不要增加其它功能。

精确写集只允许产品 context/kernel/store/session、对应测试、前端接线说明、R1文档和新报告；见 scope.json。host、提醒、会话分页、旧业务层、依赖、旧报告/评审/派工/基线/数据库全部冻结。确实需要越界时记录具体接口原因，不能先改后补授权。

零真实模型/HTTP/凭据读取/安装/新会话/子代理/Git/部署/生成代码运行。原 companion-agent 工作区只读，R2 未提交完成报告，不进入原项目集成。Python -I -B 并断言源码根，测试只使用新建根。初始视觉由架构师负责，不写页面/CSS/主题。

## A. CR2-F03：被新输入取代的旧生成不能重新获得执行资格

目标：封住普通 turn 的“第一次过期，重新 begin 就重新合法”路径。无需自然语言解析，不变更业务任务的显式 retry API。

架构决定：对于同一 conversation，存在序列晚于当前 turn 的用户输入时，当前 turn 不能开始新的模型生成。新增稳定错误码 `superseded_turn`。它表示生成上下文已被后续输入取代；不是撤销已提交 task，也不是删除会话。

1. begin 在写 ticket/event/state 之前，在同一个产品事务内比较当前 turn rowid 与该 conversation 最新输入。非最新立即拒绝 superseded_turn，不生成新 ticket，不更新已有历史回复。temporary 后续输入同样算新的用户意图。
2. begin 之后新输入到达，accept 保持 context_changed 或兼容的明确 superseded 结果，整体丢弃旧决策的 actions/memories/followup。不能把 cursor 更新到最新后接纳旧内容。
3. recover 后或遇到 context_changed 再次 begin，同样拒绝旧 turn；相同最新 turn 在无新输入时的合法重试保留。其它会话的新输入不构成本会话 superseded，已有记忆/政策签名约束仍生效。
4. 前端交接说明解释：想重做旧工作，应由用户新输入建立新 turn 和本次授权；本批不偷偷创建复制命令，不继承旧授权、不增加自然语言按钮或 UI。
5. 更新旧 `test_history_filter_before_limit_and_no_future_turn` 的用法：它现在有意在更新输入之后 begin 旧 turn，应断言明确拒绝。历史过滤/限长仍须独立证明；不能删掉过滤测试来消除冲突。

验收：

- A01：复现 F03 的“生成→新输入→拒绝旧回执→重试旧生成”整个链，不能产生旧动作、记忆、主动计划或真实任务。
- A02：旧 turn 重开/recover 后仍拒绝；已有新输入再第一次 begin 旧 turn 也拒绝。错误必须经 stdio 可达且无原始异常泄漏。
- A03：最新 turn 合法失败重试、不相关会话、时间推进、正常历史过滤/记忆签名继续通过；任务已提交后的 get/cancel/retry 行为保持原业务权威。

## B. CR2-F01：同目标读取和停止操作的时序边界

目标：同一任务不再被较旧响应倒退；错误/loading 也不能被旧请求写回。

1. session 保留 selection generation，增加读取请求序号或等价控制。连续 refreshSelected 对同一个 turn，只有仍拥有最新读取资格的结果可发布；旧 success/error 都应返回 stale_view 且不动当前状态。
2. select/open/dispose 使旧读取资格失效；refreshing/loading 在正确的请求结束后清理，不被旧请求误清理或永久挂起。
3. stopSelected 的开始与完成形成明确操作边界，使停止前的读取不覆盖停止后的确认和读回。停止请求目标、command_id 继续固定在点击时；停止回执不等同于 worker 退出。
4. 停止中的读取可以等待或返回明确 busy/stale，选一种简单且一致的方式。不要同时维护多套真相，不根据文字状态猜 worker 退出，不把换会话当停止。
5. 同一目标重复 stop 的迟到结果也不能覆盖较新的停止读回；重复 intent 复用既有 stable command_id。不得杀死共享 host。

验收：

- B01：两次同目标刷新逆序 success/success、success/error、error/success；最新请求所有权决定可发布结果。
- B02：停止前读取迟到、停止期间刷新、停止后读回、重复 stop、A停止时切换B，当前状态不串线/倒退。
- B03：dispose 及切换使全部旧读回失效；可观察 loading/refreshing 终态正确，订阅者不收到过期状态。

## C. CR2-F02：每次提交拥有自己的重试记录

目标：回执未知时始终能用原命令核对，任何旧回执都不能清除下一笔提交。

1. pendingSubmit 不再由任意 replay 回执无条件清空。每次提交有独立的记录身份/代次，处理响应时必须校验仍是该记录；持有原 command_id、材料、conversation_id 和可信授予作用域。
2. 同一 pending 命令的 replay 单飞或合并 Promise，禁止双击/并发调用产生可交错的多个 pending 处理者。明确文档：正在请求、结果未知、确定失败/成功分别怎样处理。
3. 只有属于当前记录且关系校验通过的成功响应才能清除它。至少校验返回 turn.id、conversation_id 与原提交一致；不匹配的成功响应按结果未知保留原记录，不能当成功释放下一次提交。
4. 任意晚到旧成功/失败不得改变新提交的 pending、submitUnknown、error。transport_unavailable 和 outcome_unknown 的重试都保留原值；不要在重试时再次调用 intent 生成不同授权。
5. 输入由执行器保留内部深拷贝，订阅 snapshot 不暴露 CSV 原文、权限或 ticket。退回确定性输入错误后，UI 的未知标志不能残留，但这不意味着可以清除另一条正在核对的输入。
6. dispose 不向共享 host 发取消；未决请求完成不再通知订阅者。实现最小串行单用户提交状态机，不新建后台队列、数据库命令服务或多租户系统。

验收：

- C01：F02 的重复 replay(A)→A成功→B未知→旧A迟到序列得到安全结果；可以通过单飞证明第二个A请求根本没有发出，但还需证明记录身份校验不能清掉B。
- C02：并发 replay 的主机调用数可核验；B未知后 replay 使用 B 原 command_id/内容/权限，实际服务不会生成第二条 B。
- C03：旧成功/错误、错误 turn/conversation 回执、确定输入失败、dispose、输入对象被调用者修改均不破坏原提交记录或泄漏权限。
- C04：合成丢弃一次真实 Node→Python 提交回执，再从 session 重试；真实数据库中只存在该原 turn，材料及授权一致。此丢弃发生在测试 transport 包装层，不改 production host 或添加模型注入接口。

## D. CR2-F04：拒绝具有额外行为的旧数据库

1. `_v1_shape`/迁移预检覆盖预期表、索引以及所有额外用户 trigger/view；可将它们一并纳入 schema 比较，或在写入前明确拒绝。不能只查 table/index。
2. 异常结构、身份或完整性失败在任何 ALTER/UPDATE 前拒绝。不删除额外对象“修好再迁移”，不执行来路不明 SQL，不先迁移再检查数据条数。
3. 标准 v1 fixture 来自只读 `docs/handoff/core-002/v1-schema.sql`。完整 v1→v2、ticket失效、原数据保留、二次迁移 already_current 继续成立。保持 v2 存储结构不变，本轮无需 v3。
4. 验证迁移中断回滚时不要只看 version，检查新增列/表不存在，原行内容和引用保留。v1测试在本轮新根中构造，绝不对历史库操作。

验收：

- D01：带额外 trigger 的 F04 测试被拒绝，记忆保持1条，version=1且库字节在静止状态下不变；带额外 view 也拒绝。
- D02：缺表/额外列/索引、身份不符、未知版本、损坏库在写前拒绝；故障与标准库分开新建，避免一个失败遮蔽另一个。
- D03：标准迁移、幂等重放和受控中断的完整数据保留通过，不对旧运行数据做“修复”。

## E. 组合回归、准确交接和提交

1. 用新增修复回归覆盖四个反例；`reviews/evidence/CORE-002/probe-*` 是冻结的缺陷存在证明，不修改、不把其 exit=0 当成修复通过。其步骤可复用到新的 tests，但断言必须验证正确行为。
2. 复跑全部产品 Python 测试、新旧 Node 测试、Schema check、现有离线演示。本轮新增 Python/Node 可放 tests/product/core002_r1/；Python runner 自动收集，Node 必须显式列出测试路径。
3. 更新 frontend-handoff，新增 docs/development/CORE-002-R1.md，说明最新消息屏障、刷新/停止/提交重试的接线与恢复规则。所有 superseded/unknown/stale 都用清晰错误码，不含模型推理猜测。
4. 使用本轮 `core-002-r1/check_scope.py` 为权威。旧 CORE-002 检查器看到架构师添加 reviews/handoff 属于已知基线差异；不得改旧脚本、删除评审文件或回滚原项目来获得旧 PASS。
5. 仅写新 reports/core-002-r1/：report.json(status=submitted)、summary.md、checkpoint.md、artifact-manifest.json 和 evidence。对每个本派工验收 ID 给出实际结果、日志入口与未运行项。manifest只含实际交付源码/测试/契约说明，不含自己、运行库、正在增长的日志；报告记录其实算哈希。
6. 批末报告/日志落盘后复跑本轮 scope；保留原 CORE-002 submitted 与 changes_requested 评审，不自行更新 accepted 或原项目卡计数。

验收：

- E01：新旧实际测试通过；测试数量据实际输出，不为追求数量复制用例。任何 skipped/failed/not_run 如实记录。
- E02：真实 Node/Python/SQLite/CSV重开演示与 C04 通过，零模型/HTTP/凭据读取、零视觉更改。
- E03：成果哈希、Schema、本轮范围检查通过，旧报告、评审、派工/基线及已有运行文件全部字节未变。

## 2. 本机命令入口

```powershell
Set-Location 'C:\Users\xiayu\Documents\Codex\companion-agent-core'
& '..\companion-agent\.venv\Scripts\python.exe' -I -B tools/run_product_tests.py --tb=short
& '..\companion-agent\.local-tools\node-v24.21.0-win-x64\node.exe' --test tests/product/host.test.mjs tests/product/host_core002.test.mjs tests/product/session.test.mjs
& '..\companion-agent\.local-tools\node-v24.21.0-win-x64\node.exe' tools/product_core002_demo.mjs
& '..\companion-agent\.venv\Scripts\python.exe' -I -B docs/handoff/core-002-r1/check_scope.py
```

Node命令收尾要追加本轮新文件，不依赖 Windows shell glob。测试期不要修改冻结数据；测试创建新 `core-002-r1-*`、既有测试使用新的 host/core-002-host/core-002-demo 根均可。

完成全部五包后停在 submitted，等架构负责人复核，不展开 CORE-003。
