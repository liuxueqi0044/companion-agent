# CORE-002-R1 · 四个独立反例的修订交接

状态：implementation submitted，等待独立复核。原 CORE-002 报告与 changes_requested 评审保持原样。本轮没有视觉界面、真实模型、网络或凭据读取。

## 修订后的本地规则

1. 同一 conversation 内，任何晚于目标 turn 的输入（包括 temporary）都使旧 turn 无资格再次开始模型生成。`turn.begin` 在写 ticket/event 前返回 `superseded_turn`。若新输入在生成期间才到达，`turn.accept` 返回 `context_changed`，丢弃整份旧决策。重做旧材料需用户新提交并重新授权；任务服务已有 task 的 get/cancel/retry 不受影响。
2. `createProductSession` 的视图选择与读取有独立代次。同一任务的连续刷新仅最新请求能更新 turn/error/refreshing；停止开始使先前读取失效，停止中刷新返回 `stop_in_progress`。重复停止用同一 command ID；较早的停止结果不能覆盖较晚停止后的真实读回。切换或 dispose 不杀共享 host。
3. 每次提交有内部持有的深拷贝和唯一记录身份。`replaySubmit` 对同一记录单飞，不会生成交错的两个重试。成功回执须同时匹配 turn ID、conversation ID 才清除记录；否则按 `outcome_unknown` 保留原命令、CSV 与可信授权。`transport_unavailable` 也按不确定处理；明确的输入校验错误才释放该记录。订阅 snapshot 不含材料、权限、ticket 或底层 host。
4. 旧 v1 数据库迁移预检比较表、索引、trigger、view 的完整预期结构；额外行为对象在任何 ALTER/UPDATE 前被拒绝。标准迁移仍为单事务 v2，票据失效、数据保留、重放 `already_current`。

## 本地证据与未运行边界

R1 反向回归在 `tests/product/core002_r1/`；改动过的原历史过滤用例仍验证先过滤再截断。真实 Node→Python→SQLite 的一次提交回执丢失由测试 transport 包装层合成，不改生产 host；重试后数据库只有原 turn，CSV 任务完成且总额为 6。原 `reviews/evidence/CORE-002/` 是缺陷存在证据，保持只读。

最终测试命令、退出码、原始输出、manifest 与 R1 范围检查见 `reports/core-002-r1/`。真实语义、原生隔离、系统通知、常驻调度及产品视觉继续 `not_run`；初始视觉 UI 由架构师负责。本轮没有合并进原 `companion-agent` 工作区。
