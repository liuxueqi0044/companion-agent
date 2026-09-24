# 当前状态：CORE-009 已实现并自验

工作区：`C:\Users\xiayu\Documents\Codex\companion-agent-core`。

用户明确授权先将已有代码提交到现有 GitHub 仓库，再继续开发。发布副本位于 companion-agent-github，仓库为 liuxueqi0044/companion-agent（private）。CORE-007/008 已由 bf72c37 上传；本轮 CORE-009 也将同步源码。原 companion-agent 目录保持只读；运行数据、凭据、原始证据不上传。

本批完成真实 DeepSeek 流式输出、公开摘要、实时工具过程、读取流重连、页面选择恢复、服务会话更新与迟到回执隔离。完整架构/边界/下一阶段见 docs/development/CORE-009.md。报告 reports/core-009/report.json，状态 submitted / architect_implemented_and_self_verified，不自写独立 accepted。

产品不设本地调用次数额度。保留原请求记录、串行执行、停止、时间和输入边界，无自动模型重试。所有部分模型 JSON 只可展示；最终通过原内核校验后才能执行工具、写记忆或安排联系。不要把公开处理摘要当作内部推理链或执行证据。

启动：`pwsh -File tools/start_personal_space.ps1 -DeepSeek`。复用已有本机实例 http://127.0.0.1:51794/ 。凭据只通过私有管道解密，不打印、不上传。无额外 Agent / OpenAI 账号请求。

下一阶段优先复用既有 personal-space 代码包、窄桥和恢复模块，打通用户提出改版 → AI 写代码 → 隔离预览 → 启用 → 回退。原生隔离和生成代码执行尚未验收；不得在可信页面直接 eval 候选。后台主动联系、安装包、官方执行器、TTS 与社区分享仍未完成。

历史报告、manifest 与旧有限预算 helper 保留其历史含义；不要运行旧 live 脚本覆盖旧证据，不执行过期派工。
