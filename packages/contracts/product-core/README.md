# product-core/1（私有应用输入契约）

唯一源是services/product/models.py，通过services/product/schema.py导出。覆盖Policy、UserTurn、ModelDecision和FollowUpDecision；这些不是公网API，也不是生成页面可直接使用的授权协议。

模型返回回复及有限动作、记忆、跟进建议。模型不能返回权限配置、原始命令、材料路径、任务完成状态或自称的供应商推理元数据。实际工具结果来自原有local-task/1与personal-ai-local/1。

JSON Schema用于接入说明和模型结构化输出；Python仍运行额外跨字段、UTC、时区、字节上限与UUID验证，不能只靠JSON Schema声称业务验证完成。

公开摘要属于可信ProviderReply元数据通道。原生IPC来源认证、生成空间权限映射和公开版本冻结尚未完成。

## CORE-002 增量输入与投影

wire 仍为 `product-core/1`，本地产品数据库为 v2。`schema.json` 还导出 `ConversationListRequest`、`ConversationTurnsRequest`、`ReminderCreateRequest`、`ReminderIdRequest`、`ReminderListRequest`、`ReminderReviseRequest`、`StopTurnRequest`。数字字段是严格整数，UUID 是规范小写 v4，时间只接受 UTC。额外字段会报 `invalid_request`。

| action | payload | result |
| --- | --- | --- |
| `conversation.list` | `{limit?:1..50,snapshot?:nonnegative int,before?:positive int}` | `{items,snapshot,next_before}`；item 为 `{conversation_id,latest_turn_id,cursor,last_active_at,text_preview,reply_preview}` |
| `conversation.turns` | `{conversation_id,limit?:1..20,snapshot?,before?}` | 同分页外壳；item 为 `{id,conversation_id,cursor,text_preview,reply_preview,state,temporary,has_actions,created_at}` |
| `reminder.read` | `{id}` | `{id,text,due_at,state,revision}` |
| `reminder.list` | `{limit?:1..100,before?:positive int}` | `{items,next_before}`，item 加 `cursor` |
| `reminder.revise` | `{command_id,id,expected_revision,operation:'update',text,due_at}` 或 `{command_id,id,expected_revision,operation:'cancel'}` | 保存后的提醒投影；原样重放同一命令返回首次回执 |
| `turn.stop` | `{turn_id,command_id}` | `{turn_id,command_id,permission_revoked,tasks,worker_exited:null}`；每个 task 有原 action/task 标识、取消命令、`cancel_requested`、实际 `task_status`、`needs_reconciliation`。取消回执不表示 worker 已退出 |
| `runtime.migrate` | `{expected_version:1}` | `{state:'migrated'|'already_current',version:2}`；仅可信本地宿主显式调用 |

会话分页按 turn 序号快照过滤，后续页沿用返回的 `snapshot` 和 `next_before`；状态字段可随实际工作变化，它不是历史状态快照。摘要每段最多 240 字，不含 CSV 正文、grants、ticket 或主动联系计划；需要完整选择项再 `turn.read`。临时输入不在默认浏览中，已知 ID 仍可 `turn.read`。陌生 conversation ID 返回空页。

提醒创建命令的 request hash 永不随编辑改变；revision 从 1 开始，编辑、取消、到期投递推进。`reminder.cancel {id}` 为旧调用兼容路径；新控制层使用 `reminder.revise` 的 CAS。重复创建只返回当前状态，绝不覆盖编辑后的内容。已终态提醒不能复活。

停止先持久撤销建议权限，再尝试取消已知本地任务。`task_status='unknown'` 或 `needs_reconciliation=true` 必须按原 action ID 核对，不可重新执行被撤销的动作以“找”任务。`turn.revoke` 仍可用于只撤销建议的兼容用法。
重开后的新会话若重新给同一 turn 发 `turn.stop`，产品层将其别名映射到原停止意图和原 task.cancel 命令；回执中的 `command_id` 是原稳定命令。同一命令 ID 用在其他 turn 会报 `idempotency_conflict`。

CORE-002-R1 增加稳定错误码 `superseded_turn`：同会话已有更新用户输入时，旧 turn 不得重新 `turn.begin`。生成期间才出现更新输入时，旧 `turn.accept` 返回 `context_changed` 且不产生模型建议的持久副作用。此错误不改变已提交任务服务的查询、取消或显式 retry 权威。

## CORE-005：可信主动联系执行动作

`schema.json` 新增 `ContactIdRequest`、`ContactCompleteRequest`、`ContactFailGenerationRequest`。`contact.claim {}` 是写动作，会消耗真实评估次数并返回至多一个 `{id,ticket,context}`；模型不可见 ticket。`contact.complete {id,ticket,decision}` 的 decision 仍由 `FollowUpDecision` 严格校验，结果仅 `{id,state,reason,message_id}`；只有 `sent` 才有经持久 inbox 关系核对的消息 ID。`contact.fail-generation {id,ticket,reason}` 只接受四个 `provider_*` 原因，只结算同一 evaluating ticket。`contact.read {id}` 是只读的同形状回执，不返回计划时间、目的、上下文或 ticket。`reminder.deliver-due {}` 单独投递最多 100 条已到期的明确提醒，返回已提交消息 ID 数组；主动联系关闭或模型不可用不影响它。

这些动作只面向可信本地 host，不向生成页面暴露通用 request。未知写回执不能自动重放；模型输出不能自称已发送、改变政策或添加工具权限。旧 `contact.tick` 和旧同步模型路径保留兼容，新的 Node 协调器不调用它们。

## CORE-004：可信生成失败

`schema.json` 现含 `FailGenerationRequest`。私有写动作 `turn.fail-generation` 仅供可信执行器：`{turn_id,ticket,reason}`，其中 reason 仅为 `provider_failed`、`provider_timeout`、`provider_invalid_output`、`provider_aborted`。只有指定 turn 仍在 generating 且 ticket 完全匹配时，原子地置为 model_failed、清票据并记录规范事件；其它情况返回 `stale_generation`，不会影响新一轮生成或其它 turn。异常正文、额外字段和非规范 UUID 均拒绝。它不授予或撤销工具权限，也不触碰已提交任务。`turn.stop` 仍是用户显式撤销权限的入口。
