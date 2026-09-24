# CORE-006 源码上传校验

2026-09-24。用户明确要求将已完成代码提交到 GitHub。本次更新已有私有仓库 liuxueqi0044/companion-agent，沿用独立上传副本；原 companion-agent 和 companion-agent-core 的源码、验收基线、历史数据库均不修改。

## 范围

- 保留已上传的 BATCH-015 基础；复制 companion-agent-core 当前 317 项源码、契约、合成测试、文档及摘要（含未变化文件），其中包含 CORE-006 架构师补丁。
- 同步可信本地桥接依赖、产品身份/记忆/对话/联系内核、Node 宿主/执行器/应用控制器/统一运行时、回归与离线演示。
- 不复制依赖目录、构建输出、凭据、运行库、个人记忆、测试运行根、原始证据/日志、历史归档、私有 holdout 或机器范围基线。
- 原 submitted 报告仍是历史记录；当前 CORE-006 以 reviews/CORE-006.md 及 reports/core-006-architect/final-artifacts.json 为准。
- 不宣称已完成原开发目录全部后续工作的合并、正式桌面发布或产品视觉验收。

## 在上传副本实际复跑

| 检查 | 结果 |
| --- | --- |
| Python：tools/run_product_tests.py --tb=short | 121 passed |
| Node：产品 host/session 及 core002_r1 至 core006 全部 *.test.mjs | 172 passed，0 failed/skipped/cancelled |
| services.product.schema --check | PASS |
| tools/product_core006_demo.mjs | PASS；真实本地 CSV/持久状态/消息及重开，合成模型最大并发 1 |

复用现有 Python 3.13 / Node 24 环境，不安装依赖。Python 使用 -I -B 和显式导入根；每次运行用新测试数据目录。模型 HTTP 请求和产品凭据读取均为 0。

SOURCE-SNAPSHOT.json 记录当前复制文件的逐字节哈希；上传暂存内容另外做哈希、敏感信息模式及禁止路径检查。开发源码原有 CRLF 保持，以确保成果哈希可核对；Git whitespace 检查使用 cr-at-eol。

原始运行日志和上传审计清单留在本机独立输出目录，不作为产品源码入库。旧 scope/manifest 依赖的未上传证据无法在此快照完整复现，不能伪造或重建成通过。

## 已知限制

Node 测试和演示仍使用相邻 companion-agent/.venv/Scripts/python.exe，跨机器执行需先配置相应解释器路径。生产宿主支持显式解释器路径；本次为保存已验收代码，不改运行环境接口。

真实模型语义、后台常驻、原生隔离、生成页面实际运行及正式产品视觉均保持 not_run。
