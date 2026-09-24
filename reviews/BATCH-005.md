# BATCH-005 独立复核：离线路径预检需小修

结论：M00.3.01 changes_requested；只对本段准备工作提出 B5-R1。A01–A03 保持 not_run，累计 accepted=11，不声称完成 Hermes 真实接入。

- 实际复跑原 13 项离线回归全部通过；正常 preflight/plan 只打印本地结果，integration_status=not_run。
- 写集 modified=0 / added=35 / missing=0 / outside=[]；三个产物 manifest 与 17 个上游来源文件/来源 index 的 hash/bytes 一致；holdout 未变。
- 抽查原生 CLI 参数、JSONL 输出、session 查询、显示状态默认 complete、WebSocket 事件与 PTY 生命周期的源码引用，记录的主要能力缺口有本地源码依据。源码分析不证明实际安装/运行能力。

## B5-R1：Windows junction 漏检

实现只调用 Path.is_symlink()。Windows 目录联接 junction 在本机 is_symlink=False、is_junction=True，因此可穿过判断。

独立真实夹具重现：upstream 链接到合成仓库外的自有测试源码，预检读取其内容后仍通过；user-a、user-b 两个不同路径链接到同一外部目录，预检也判定两者隔离成功。未读取任何用户凭据，未启动 Hermes；所有反例目标都位于复核者的临时工作目录。

下一轮仅补足源码及 home 路径的联接/符号链接检查和真实 Windows 回归。保留原有哈希绑定、结构化失败、无网络/进程副作用和 live not_run。原同名/嵌套路径检查不能被删除。

后续真实接入仍有稳定 run 标识、状态查询、Windows 取消语义、只读工具策略及账号/预算等未决项，本修订不解决或擅自执行它们。

证据 reviews/evidence/BATCH-005/；原提交 reviews/history/BATCH-005/submitted/；下一派工 docs/handoff/BATCH-005-R1.md。
