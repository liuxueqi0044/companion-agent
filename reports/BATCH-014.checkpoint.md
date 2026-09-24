# BATCH-014 实现检查点

## A 完成（2026-09-24）

- `services/personal_ai/models.py` 已建立 `personal-ai-local/1` 的严格 Pydantic 单源：三项显式偏好、稳定 UUID 快照、修订、结构化 change/undo、命令回执和有界历史。Unicode/UTF-8 字节、控制字符、空白名称、null/未知字段/类型强转均受检，原文不静默 trim。
- `schema.py` 从模型确定性生成内部 JSON Schema；生成与 `--check` 通过。A 定向 9 测通过。首次失败日志保留于 `reports/evidence/BATCH-014/a-models-test.txt`：发现可空游标约束对 `None` 抛 TypeError，以及 pytest 临时根父目录未建；调整后最终日志为 `a-models-test-final.txt`。
- 下一步 B：实现固定单用户 SQLite 事务、CAS、幂等与历史/undo，使用实际多连接和子进程验证。

## B 完成（2026-09-24）

- `repository.py` 使用标准库 SQLite，明确 `user_version=1` 和私有 schema 标记；仅显式 bootstrap 可创建身份。read/import 不建库，未知版本、损坏库、失联 head/关系返回 `recovery_required`。
- change/undo 在 `BEGIN IMMEDIATE` 事务中完成 CAS、不可变修订、head 与原始命令回执；重放同一规范化命令返回原结果和当前 head，不重写历史；不同请求复用 command_id 返回 `idempotency_conflict`。undo 创建新修订，有界历史支持游标。
- B 定向 5 测通过：持久重开、双连接和双本地子进程 CAS、并发 bootstrap、故障注入回滚、未知/损坏库、幂等和 undo。日志 `reports/evidence/BATCH-014/b-repository-test.txt`。下一步 C：无视觉服务、固定根 CLI 与实际子进程操作。

## C 完成（2026-09-24）

- `PersonalAIService` 只接结构化 change/undo，不从自由文本猜测偏好；CLI 固定本批本地数据根、一次一个严格 UTF-8 JSON 请求/响应，拒绝额外根/owner 等字段、重复键、超长输入和 reparse path，分类退出码 0/2/3。
- 实际 CLI 子进程连续 bootstrap→change→新进程 read→同命令重放→undo→history 和错误路径通过；import 无数据库或网络副作用。C 定向 2 测通过，日志 `reports/evidence/BATCH-014/c-cli-test.txt`。服务/契约 README 和 `service-handoff.md` 已给出未来无视觉接线与恢复边界。
- 下一步 D：虚构双 consumer 独立性、更多损坏/锁占用边界、全量本批回归、Schema/manifest/范围/历史哈希和统一报告。

## D 完成（2026-09-24）

- 虚构 Mira/Alex 三字段链实测：合成视图/执行器切换后同一 profile_id 与偏好保持；过期修改拒绝，旧命令重放分离原结果与当前 head，undo 新建修订并保留历史。
- 损坏关系/未知格式、SQLite busy、超大/非法 UTF-8 JSON、真实 Windows junction 拒绝均有回归。收尾补了固定数据目录的首次并发创建竞态；最终本批全量 26 passed、1 skipped。跳过的是系统不允许创建测试 symlink，真实 junction 定向 1 passed。没有运行网络服务、模型或旧创作链。
- Schema `--check`、12 个 Python 文件 AST 语法检查、16 项源码/契约/测试/交接 manifest 和 12 项旧成果/账本 hash 复核通过；初步权威范围检查 PASS。下一步统一报告、最终范围复跑和 taskctl 核对。

## 批末提交核对（2026-09-24）

- `result_ref=sha256:1b0cd01c4e95448ef8093deb3d925fc83161550bd0965bdd71085fab01a08708`；16 项成果与 12 项历史 hash 复算 PASS。本地 SQLite、日志、tmp 均不进入成果 manifest。
- 权威 BATCH-014 范围检查 PASS：modified 0、added 83、missing 0、outside 0；`taskctl validate` 显示原 156 卡有效，`next --repo .` 显示 accepted 仍为 12，M00.3.01 仍 `not_run`。
- 四包统一 `submitted`，等待独立复核；不自写 accepted。
