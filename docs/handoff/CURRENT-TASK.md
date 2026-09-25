# 当前交接：CORE-013 本地 Alpha 收尾

工作区：C:\Users\xiayu\Documents\Codex\companion-agent-core。原 companion-agent 只读；Git 发布副本 companion-agent-github。先读 docs/development/CORE-013.md 与 docs/product/LOCAL-ALPHA.md。本批由架构师串行开发，无额外 assistant 任务或 OpenAI 账户请求。

## 已接通

- 原有持久聊天、记忆默认开/可管理、主动联系默认关/模型选时、到期重评估、明确提醒、CSV 核对与成果下载继续保留。
- 私人工具是 AI 编写的 SQLite 查询：真实样例验证 → 不可变版本保存 → 新材料运行 → 可下载结果 → 停用/恢复/版本回退。独立 tools.sqlite3，不改旧三库 Schema；已验证两个真实串行 DeepSeek 请求的创建/复用链。
- Electron 44.4.4 桌面载体，窗口关闭后仍运行，托盘恢复/退出；SDK host.configureWindow() 经活动挂载的 window 权限授权，可调整大小、无边框、透明度和置顶。边框/透明切换重建视图，不重启执行服务。
- 完整前端代码包继续使用 CORE-011 SDK、构建/预览/授权启用/回退。不提供固定皮肤目录。自然语言作者仍没有接到普通聊天。
- 便携包包含 Electron/Node/Python/Vue/Rolldown，安装脚本核对文件清单并写入新目录。DPAPI 配置仍需 PowerShell 7。原生限制阻断外部 HTTP、弹窗、任意主框架跳转，不将这些措施冒充社区敌对代码全面审计。

## 启动与数据

源码桌面：pwsh -File tools/start_morrow.ps1 -HomePath <数据目录>。不指定 HomePath 时使用 %LOCALAPPDATA%/Morrow/data；原浏览器开发数据在 .product-data。安装包双击 Morrow.cmd。已有独立服务被附着时，关闭桌面不会杀掉该外部服务；菜单明确提示。

全新源码 checkout 可 uv sync --locked、npm ci，服务优先使用本 checkout 的 .venv 与 node_modules；显式 PERSONAL_AI_PYTHON/VUE/BUNDLER/NODE 可覆盖。源码桌面先执行 tools/fetch_electron.ps1 下载并校验固定官方分发，再运行启动脚本。Windows 包的构建脚本及一部分历史测试仍使用开发机相邻工具路径，产品发行包不依赖该 donor 目录。

## 冻结边界与下一步

不要修改旧 reports/reviews 的 accepted/submitted 结论。本批 reports/core-013/report.json 是架构师实现及自验。原始调用记录、截图、凭据、数据库、打包产物与 scope 基线不提交 Git。

本地 Alpha 之后先收集真实试用反馈；整套 UI 自然语言作者工具链仍按用户决定留到最后。官方 Coding Agent 真实 DeepSeek 连通、TTS、社区分发、云端常驻、任意电脑操作没有作为本批完工项。Windows 通知实际送达、长期睡眠唤醒、另一台机器安装继续单独验收。不得把“代码和定向测试已写完”描述成整个长期 Personal AI 愿景已经完成。
