# 当前状态：CORE-012 日常使用闭环

工作区：`C:\Users\xiayu\Documents\Codex\companion-agent-core`。原 companion-agent 只读；发布副本 companion-agent-github。先读 `docs/development/CORE-012.md` 与 ADR-009。用户明确将整套 UI 的自然语言作者工具链放到最后；不要继续首页装饰生成器或预设模板路线。

本批新增事务型文本/源码成果、可下载 ZIP、自然语言提醒、真实活动回执、浏览器之外的串行联系调度、持久收件箱游标、Windows 托盘与离线便携打包。沿用原有记忆、CSV、联系策略、完整界面 SDK/预览/启用/回退。唯一运行时仍归可信宿主所有。源码不会自动执行。

可选 Codex→DeepSeek 编码连接器通过独立配置和账户环境运行，只有 PERSONAL_AI_CODEX 配置后使用 `/code` 才触发。目前用合成子进程验证协议和进程所有权；官方 CLI 真实模型连通未验收，禁止写成已完成官方 Agent 接入。

入口：源码服务 `pwsh -File tools/start_personal_space.ps1 -DeepSeek`；Windows 托盘 `pwsh -NoProfile -STA -File tools/morrow_tray.ps1`。源码数据是 `.product-data`；托盘默认 `%LOCALAPPDATA%/Morrow/data`，用 `-HomePath` 可明确选择。便携包带 Python/Node/Vue/构建器，仍需 PowerShell 7。不自动注册开机启动。

原有本地服务使用 http://127.0.0.1:51794/，独立恢复页 `/recover`。以后界面可完全换掉，可信恢复和数据不会属于新 UI。默认 UI 下载成果和提醒来自持久回执，模型的文字不代表动作成功。

本批证据：`reports/core-012/report.json`。三次真实 DeepSeek 串行检查用全新业务根，原业务数据库未变；未打开额外 assistant 任务或使用 OpenAI 账户。保持私密 key、请求日志和原始对话在 Git 之外。已有历史报告不改写，不自写独立 accepted。

后续先由用户试用成果、提醒、记忆、主动联系和托盘；真实 OS 提示、另一机器安装、官方编码 CLI 连通分别验收。之后才实现“自然语言→整套 UI 源码→构建→预览→启用/回退”的作者闭环。敌对社区代码原生隔离、真正无边框桌面小精灵仍是单独工程，不能把 iframe 或托盘当成完成。
