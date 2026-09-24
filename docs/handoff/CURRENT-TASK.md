# 当前状态：CORE-010 已实现并自验

工作区：C:\Users\xiayu\Documents\Codex\companion-agent-core。原 companion-agent 保持只读；发布副本 companion-agent-github，现有私有仓库 liuxueqi0044/companion-agent。

本阶段实现用户授权的“AI 写代码 → 独立预览 → 用户启用 → 回退”。目前作用范围是自由代码首页画布，保留可信聊天、导航、记忆和恢复入口；不向生成页传入私有数据，不开放任务/模型/记忆写桥。没有模板目录限制。

架构与接口：docs/development/CORE-010.md。报告：reports/core-010/report.json，submitted / architect_implemented_and_self_verified，不修改历史独立 accepted 数。

最终 Node 235 项、Python 121 项通过。两次真实串行 DeepSeek 请求均 HTTP 200，验证首次生成及带上版源码继续修改。浏览器已验证生成中刷新、启用、页面和服务重启恢复、回退、初始界面恢复、手机尺寸及隔离探针。真实三个业务库哈希未变，无额外 Agent 或 OpenAI 请求。

启动：pwsh -File tools/start_personal_space.ps1 -DeepSeek，复用 http://127.0.0.1:51794/ 。凭据只在服务端私有管道解密。无调用次数预算，保留串行调用、时长与体积限制、停止、无自动重试。不运行历史 live 脚本，不改写旧账本或删除未核对 reserved。

改版入口：首页右上角叶子“改变这里”。测试后恢复初始首页；两个书房版本保留供预览。候选、截图与运行数据不上传 GitHub。

下阶段可优先接普通对话中的改版提议，或后台主动联系与通知。原生隔离、资源限制、社区导入、全聊天界面重写、官方 Coding Agent、TTS、可安装跨机器分发尚未完成。生成代码只能在 opaque-origin iframe 运行，不能在 Node/可信 UI eval；浏览器隔离不能冒充原生安全边界。
