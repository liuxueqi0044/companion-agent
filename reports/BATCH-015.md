# BATCH-015 · 本地任务完整流程

状态：`submitted`，等待独立复核；原 accepted 为 12，本报告不写 accepted。权威派工为 `docs/handoff/BATCH-015.md`，结果 manifest 为 `reports/evidence/BATCH-015/artifact-manifest.json`。

## 实现

- **A** 修复 014 的幂等回执：完整缓存快照须等于真实修订快照，命令与修订双向对应；history 仅以 `None` 表示省略。个人 AI CLI 新状态根为本批目录，旧 014 数据库未改。
- **B** 新 `local-task/1` 严格契约和单独 SQLite 任务库：固定身份/revision 与输入 hash、幂等提交、任务/attempt/事件/结果、CAS 式状态转移、有界分页和显式 retry。
- **C** 固定 `csv_audit/1` 用 Python 标准库严格解析 CSV，以 Decimal 精确计算，给出原值、逻辑记录、物理行、列来源和公式。缺列/空值/非法值留待确认；混合币种不合计，未知金额不填 0。发布前重新从不可变 CSV 计算核对结果。
- **D** 单次 worker 的 OS 进程锁、合作取消、结果事务提交、异常退出后显式 recover，以及新 attempt 重试。取消请求与实际停止分别记录。
- **E** 无视觉 `PersonalWorkbench` 复用个人 AI 服务，固定根 JSON CLI 可通过真实子进程完成 bootstrap→偏好修改→submit→run-next→get/events/result→重启 read→undo。前端接线说明在 `reports/evidence/BATCH-015/frontend-handoff.md`。
- **F** 合成成功、待确认但工具完成、非法 CSV 失败、排队和运行中取消、子进程崩溃→恢复→重试均有实际回归；旧 attempt 不能晚发布或污染新 attempt。

## 验证与边界

联合定向回归 **54 passed、1 skipped**。跳过项是旧 symlink 创建受系统权限限制；真实 Windows junction 回归通过。固定根 CLI 另完成真实 worker 子进程异常退出→CLI recover/retry→新 attempt 完成。两份 Schema 的 `--check`、18 个 Python 文件 AST 语法检查、22 项成果 manifest 和 12 项旧报告/账本/模型/014 DB 哈希复核通过。`taskctl validate` 为 156 卡有效，`next` 仍显示 12 accepted、M00.3.01 `not_run`。首次 `--basetemp` 父目录缺失及联合 pytest 同名模块收集错误均保留日志，修正后全套通过。命令、退出码和证据见 [结构化报告](BATCH-015.json)；范围结果见 [scope-rerun.json](evidence/BATCH-015/scope-rerun.json)。

本批完成的是确定性本地工具链。需求文本语义理解、用户最终确认、Hermes/官方 Agent、原生隔离和产品视觉均为 `not_run`；`completed` 只说明固定 CSV 工具结束且产物检查通过。模型/HTTP/真实凭据读取/依赖安装均为 0。旧 014 数据、旧模型与账本、桌面 UI 未改；没有执行模型生成源码或部署。
