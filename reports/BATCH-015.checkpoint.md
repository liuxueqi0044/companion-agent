# BATCH-015 实现检查点

## A 完成

- 缓存回执现在与对应 revision 重建的完整快照比较；revision→command 和 command→revision 双向检查，显式识别 LEFT JOIN 缺失行。history 仅把 None 当省略。
- 固定 personal_ai CLI 根转到 BATCH-015。新增损坏缓存/关系及 falsey 输入回归；个人 AI 全套 32 passed、1 skipped。首次测试因 pytest `--basetemp` 父目录未创建而报错，已建立本批 tmp 后复跑通过；日志分别为 `a-personal-test.txt`、`a-personal-final.txt`。
- 下一步 B：建立 local-task/1 单源模型、Schema、SQLite 任务/attempt/事件、查询和幂等事务。

## B 完成

- `local-task/1` Pydantic 单源与生成 Schema 已落地；严格校验 UUID、文本字节限额、固定执行器/工具版本和分页参数。
- 独立 SQLite 库保存不可变输入、profile 快照、任务、attempt、事件、幂等命令和结果。提交重放返回同一 task；queued/running/cancelling/终态及 retry 新 attempt 均由事务更新；查询有界且不改状态。
- 仓库定向 3 测通过，包括重启、幂等冲突、分页、取消/重试和旧 attempt 迟到拒绝；日志 `b-repository-test.txt`。下一步 C：标准库 CSV/Decimal 工具与来源及金额回归。

## C 完成

- 固定 `csv_audit/1` 使用 `csv.reader(strict=True)` 和 `Decimal`；按旧输入小样的 `item/unit/qty/unit_price/currency`、十进制格式和原表币种规则核对。每行保留原值、逻辑记录索引、物理行范围、列来源及乘法公式。
- 缺列只报一项列问题，空/非法值定位单元格；混合币种分别列部分小计，不推跨币种总额；已知零保留。结果发布前从不可变 CSV 重新计算比较来源与数值。
- 8 项真实 CSV/金额定向回归通过（含引号内换行、CRLF、Unicode、缺失/混合、无效与限额）；日志 `c-csv-test.txt`。下一步 D：OS worker 锁、合作取消、异常退出恢复和进程竞态。

## D 完成

- 单次 worker 使用 OS 独占锁；claim 与 attempt 开始在事务内，处理期间不占写事务。取消先从 running 到 cancelling，worker 在检查点确认后才 cancelled；结果/终态同一事务发布。
- 显式 recover 必须取得同锁，才将遗留 running/cancelling 标 interrupted；不自动重试。retry 生成新 attempt，旧 attempt 迟到发布被拒。
- 4 项实际本地子进程回归通过：锁竞争、运行中取消、真实子进程 `os._exit` 后 recover/retry、结果提交故障回滚；日志 `d-worker-test.txt`。下一步 E：个人 AI 与任务 composition service、固定根 JSON CLI 和接线说明。

## E 完成

- `PersonalWorkbench` 组合原个人 AI 服务与新任务库；task.submit 从 profile.read 固定身份/revision。`tools/personal_workbench.py` 只接固定根、严格单个 JSON 动作，拒绝路径/执行器重定向和重复键；结果 rows/issues 各自分页，超过 1 MiB 时缩小只读页。
- 本地 CLI 的实际子进程 bootstrap→修改偏好→提交→run-next→结果/事件→重启读取→undo 通过，3 项定向 CLI 测试通过；生成 Schema 复核通过。说明见 `services/local_tasks/README.md` 与 `frontend-handoff.md`。
- 下一步 F：补全成功/问题/失败/取消/崩溃的整体链，跑全量回归、schema/语法/历史 hash/manifest/权威范围和 taskctl，统一 submitted。

## F 功能与必要验证完成

- 固定 CLI 成功、缺列待确认但工具 completed、非法 CSV failed、queued 取消已走真实子进程；worker 测试覆盖 running 取消与真实异常退出→recover→retry。伪造结果拒绝、删除结果触发 recovery_required、rows/issues 独立分页有回归。
- 两组测试联合最终 54 passed、1 skipped；跳过项是旧 personal_ai 测试环境不允许 symlink，真实 Windows junction 回归仍通过。新增固定根 CLI 的真实子进程异常退出→CLI recover/retry→完成回归。首次联合收集因新旧测试文件同名报 import mismatch，已把新文件改成唯一模块名并复跑通过；初始及修正日志均保留。
- 两份生成 Schema `--check`、18 个 Python 文件 AST、22 项不可变成果 manifest 及 12 项旧报告/账本/模型/014 DB hash 均通过；初步权威范围 PASS。`taskctl validate` 显示 156 卡有效，`next` 显示 accepted=12、M00.3.01 为 not_run。
- 下一步：写统一 JSON/Markdown submitted 报告，复跑落盘范围和 manifest；批末停止，等待独立复核。

## 批末提交核对

- `reports/BATCH-015.json/.md` 为 `submitted`；`result_ref=sha256:6c03efbcabe6b3630d85e2faff2fb4496d8e97e59bf8a74f6ede2843de7fa5d3`。22 项不可变成果和 12 项旧成果/账本 hash 复核通过，运行库/tmp/日志不计入成果 manifest。
- 权威 BATCH-015 范围检查初次落盘及复跑均 PASS、无越界/缺失；最终数量及完整文件清单以 `scope-rerun.json` 和结构化报告为准。开发者不写 accepted，原 12 不变。
- 语义理解、Hermes/官方 Agent、原生隔离、产品视觉仍 not_run；本轮模型/HTTP/凭据读取/安装为 0。到此停止，等待独立复核。
