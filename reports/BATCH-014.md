# BATCH-014 实现提交

状态：`submitted`，等待独立复核；原 accepted 仍为 12。本批模型/HTTP 请求 0、真实凭据读取 0，未设计初始产品 UI 或启动网络服务。

## 四包结果

| 包 | 本地结果 |
| --- | --- |
| A · B14-A01 | Pydantic `personal-ai-local/1` 单源定义稳定 UUID、三项显式偏好、结构化 change/undo、修订与回执；严格校验 Unicode/UTF-8 字节、null、未知字段和类型。生成内部 JSON Schema，复算一致。 |
| B · B14-B01 | 标准库 SQLite 原子 bootstrap、revision/CAS、幂等回执、历史游标和生成新修订的 undo；多连接/本地子进程竞态及故障回滚通过。缺失或损坏库不静默重置身份。 |
| C · B14-C01 | 无视觉 `PersonalAIService` 和固定根 JSON CLI 可实际读写；真实子进程完成 bootstrap→修改→重启读取→重放→撤销→历史。import 不创建库或访问网络。 |
| D · B14-D01 | 虚构 Mira/Alex 全链、合成 consumer 切换及损坏/忙锁/输入边界通过；服务接线说明、成果 manifest、历史哈希与范围核对完成。 |

## 验证与边界

本批全量测试 **26 passed、1 skipped**；跳过项是系统不允许创建测试 symlink，真实 Windows junction 回归另已通过。另补了固定数据目录首次并发创建竞态。Schema `--check`、12 个 Python 文件语法检查、16 项成果 manifest 和 12 项旧证据哈希复核通过。权威 BATCH-014 范围检查 PASS（modified 0、added 83、missing 0、outside 0）；`taskctl validate` 为 156 卡有效，原 accepted 仍为 12。失败后修正的初始日志与最终通过日志均保存在 [BATCH-014 证据](evidence/BATCH-014/)；命令退出码见 [结构化报告](BATCH-014.json)。

SQLite 仅用于单用户本地开发存储。自然语言理解、真实 Agent/执行器接入、生产数据库与多用户认证、语义记忆、真实浏览器/原生隔离和产品视觉均未验收。初始 UI 由交接方架构师负责，开始设计前须先通知用户等待其调整推理档位。接口与错误边界见 [service-handoff.md](evidence/BATCH-014/service-handoff.md)。

本报告是实现者的 `submitted`，不写独立 `accepted`，批末停止。
