# 本地任务服务（BATCH-015）

本模块只实现固定的 `local_csv_audit` / `csv_audit/1`。`PersonalWorkbench` 复用现有 `PersonalAIService`；身份和偏好保存在独立 profile 库，任务提交时固定 `profile_id` 与 `profile_revision`。任务正文不授予执行权限，不从自然语言推断字段或工具。数据库是本地开发状态，不是多用户远程 API。

## 状态与来源

`queued → running → completed|failed`。运行中取消先到 `cancelling`，worker 检查点确认停止才 `cancelled`；queued 可直接 `cancelled`。进程异常退出后状态仍为 running/cancelling，取得 worker OS 锁后的显式 `recover` 改为 `interrupted`，显式 `retry` 创建新 attempt 才重新 queued。终态不能被旧 attempt 覆盖。

任务库事务化保存不可变需求文本、CSV、输入哈希、事件序号、attempt 和结果。`completed` 仅指这个确定性 CSV 工具已结束且重新核对结果结构、金额与来源；`requirements_interpretation=not_run`，并未理解自由文本、完成用户确认或执行 Agent。结果金额保持十进制字符串；缺失为 null，已知零为 0；混合币种仅显示各币种小计。`paid_model_calls=0` 只计本工具模型调用，不表示机器总费用为零。

## 接口

`PersonalWorkbench(profile_service, task_repository, worker)` 提供 `bootstrap/submit/get/list/events/result/cancel/retry/run_next/recover`。请求为 `local-task/1` Pydantic 严格模型，契约由 `python -m services.local_tasks.schema` 生成。`task.list` 用 `before_task_id`；`task.events` 的 `after_seq` 只返回之后事件；`task.result` 用 `offset/limit` 和 `issue_offset/issue_limit` 分页。重复提交同 command UUID 和同正文返回同 task，不同正文返回 `idempotency_conflict`。

固定根 CLI `tools/personal_workbench.py` 每次从 stdin 接收一个 UTF-8 JSON 请求，返回一行 JSON。只有 `bootstrap` 会初始化库；其他操作不隐式创建身份。CLI 路径为 `reports/evidence/BATCH-015/local-state/`，拒绝重定向路径和重复 JSON key；输入≤384 KiB，输出≤1 MiB。仅供本机试用；正式 UI/身份鉴权由后续架构决定。
