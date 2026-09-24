# CORE-002 独立复核：changes_requested

复核日期：2026-09-24。依据：CORE-002 派工、实现源码、提交 manifest、实际回归和额外反例。没有修改产品实现，也没有改写实现者的 submitted 报告。

## 结论

整体实现有效，原有 83 项 Python、11 项 Node 测试重新执行全部通过；21 项成果哈希与报告一致，Schema 一致，添加评审文件之前的原范围检查 PASS。实际 Node→Python→SQLite→CSV 演示重跑得到 total=6，重开后身份、会话、任务和结果仍可读。

四个独立补充场景仍失败，因此本批不 accepted。默认开关、明确提醒 CRUD、会话分页、真实取消与崩溃重放的已有实现保留，不重做。

## CR2-F03 / P1：新消息使旧生成失效后，重试却能绕过检查

位置：`services/product/kernel.py:83` 的 begin 与 `services/product/context.py` 的 turn_context。

复现：A 开始生成→同会话出现 B→A 的第一次结果正确返回 context_changed→再次 begin(A)→再次 accept(A)。begin 将当前最新 cursor（B）作为 A 的新基线，而模型历史又只包括 A 之前的消息，模型没有看到 B。本次 accept 通过，实际 execute 为旧材料创建 queued CSV 任务。

这不是要求离线代码理解 B 的自然语言。问题是派工明确要求“已有更新输入时，旧生成不能覆盖新上下文”，但重试重新采样最新 cursor 就绕过了这个约束。

修订：为同会话已被后续输入取代的 turn 定义明确、稳定的 superseded 边界。begin 和 accept 都校验当前 turn 的实际位置，不仅比较 begin 时的 MAX(rowid)。用户明确想重新执行旧工作时，应创建新的用户意图及授权；本轮不自动复制旧授权。

证据：`evidence/CORE-002/kernel-probes.json`，CR2-F03；对应脚本只用了合成回执和全新数据根。

## CR2-F02 / P1：重叠重试的旧回执能清掉下一次未知提交

位置：`apps/desktop/product/session.mjs:122`，replaySubmit 对共享 pendingSubmit 的无条件清空。

复现：A 的提交结果未知→同时发起两次 replay(A)→第一次成功后允许提交 B→第二个 A 回执迟到并清空 pendingSubmit→B 返回 outcome_unknown。此时 snapshot.submitUnknown=true，但 replaySubmit 返回 nothing_to_replay；B 原 command_id 和材料已不能从控制层继续核对，UI 可能诱导用户重新提交造成重复工作。

修订：提交记录具有自己的代次/身份，重试同一命令单飞或合并；每个回执只可影响它所属的记录。不能让旧命令成功/失败清空新提交。保留原命令直到本命令获得已验证的确定结果。

证据：`evidence/CORE-002/session-probes.json`，CR2-F02。

## CR2-F01 / P2：同一个选中任务的两次刷新仍会逆序覆盖

位置：`apps/desktop/product/session.mjs:91`，refreshSelected 仅捕获 selection generation。

复现：选中 A，先后发出两个 refresh(A)；后发请求先回 cancelled，先发请求后回 actions_ready。两者选择代次相同，旧回复仍被接受，界面从 cancelled 倒退到 actions_ready。原测试覆盖 A→B 切换，没有覆盖同一 A 的刷新重排；停止后的读回也有相同风险。

修订：读取请求独立代次与停止操作边界要同时生效；新读取或停止后的真实读回成立之后，旧读取不能再写 turn/error/loading。不要仅依赖 UI 不会重复点击，后续轮询与人工刷新也会交叠。

证据：`evidence/CORE-002/session-probes.json`，CR2-F01。

## CR2-F04 / P2：迁移的“结构一致”检查漏掉 trigger/view

位置：`services/product/store.py:66`，_v1_shape 仅采集 table/index。

复现：由冻结 v1 DDL 新建测试库，加入一条记忆及额外 AFTER UPDATE OF version 触发器。迁移被判为合法 v1，更新 meta.version 时触发器执行，记忆从1条变为0条，返回 migrated。这里只构造了异常测试库，没有用户数据受损。

派工要求拒绝结构不匹配的旧库且保留数据。漏掉 trigger/view 会让事务中的 UPDATE 执行未在预期结构中的行为。

修订：在任何迁移写入前检查完整相关 schema 对象，拒绝额外 trigger/view；错误身份、损坏、缺失和额外结构都必须无写入返回。保留标准 v1→v2 全事务迁移和幂等重放。

证据：`evidence/CORE-002/kernel-probes.json`，CR2-F04。

## 验收 ID 裁定

| 验收 | 裁定 | 依据 |
|---|---|---|
| A01 | passed | 原主动联系旧上下文缺口已修复；复跑回归 |
| A02 | changes_requested | CR2-F03，普通生成重试绕过后续输入 |
| A03 | passed_with_revision_followup | 过滤/排序逻辑成立，但旧 turn 的 begin 用例须随 F03 调整为明确拒绝 |
| A04 | changes_requested | CR2-F04，迁移结构检查不完整 |
| B01/B02/B03 | passed | 会话重开、序列分页和受限投影的源码与回归 |
| C01/C02/C03 | passed | 明确提醒、CAS、投递事务及回归；不代表系统级通知已验收 |
| D01/D02 | passed | 实际 worker 取消及取消跨库提交后进程终止重放回归 |
| D03 | changes_requested | CR2-F01，同一目标的刷新重排未处理 |
| D04 | changes_requested | CR2-F02，新未知提交被旧回执清空 |
| E01 | changes_requested | 原测试全绿，但额外行为反例仍失败 |
| E02/E03 | passed | 实际组合重跑、manifest、Schema、评审写入前的范围检查 |
| E04 | changes_requested | 接线文档须反映修订后的 superseded/刷新/重试语义 |

passed 表示该项当前所列本地检查通过，不提升整批状态或原项目 accepted 数。实际模型、原生隔离、系统通知、常驻运行和产品视觉继续 not_run。

## 证据与冻结说明

`evidence/CORE-002/` 保留复跑日志、独立反例脚本与输出、完整范围检查及21项哈希复核。反例脚本目前断言“缺陷确实存在”，不可把其 exit=0 当作产品通过；R1 要写方向相反的修复回归，评审脚本保持只读。

本评审文件、证据和后续 R1 派工是架构师在实现者批末停止后新增的授权文件，不属于原实现者写集。原 CORE-002 scope PASS 保留在对应证据中；下一轮使用自己的新基线，不修改旧检查器来吞掉架构师新增文件。

后续：按 `docs/handoff/CORE-002-R1.md` 一次完成五包修订，仍不开发视觉或调用模型，submitted 后由交接方再复核。
