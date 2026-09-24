# CORE-012 · 日常可用的 Personal AI

用户授权继续完成工具、记忆与主动联系、后台运行及桌面交付；整套界面的自然语言编写明确后置。开发串行进行，原 companion-agent 只读。源码包仍可整体替换。

## 已实现的结构

1. 成果工具：复用已有 actions 事务与执行器，增加多文件文本成果及自然语言提醒。成果只存产品数据库，下载为文件或 ZIP；不执行模型代码，不写任意用户目录。每条成果绑定 turn/action，摘要来自持久回执。沿用 CSV 计算与取消机制。
2. 日常记忆和联系：复用已实现的记忆策略、上下文、到期重评估与收件箱；增加独立于浏览器的串行调度、消息游标、退出等待与通知出口。主动联系仍默认关闭；模型自行选时，普通回复不预告时间；提醒由明确用户要求触发。
3. Coding Agent 连接器：复用官方非交互协议，独立配置与指定工作目录；默认未配置，不读取当前 Codex 登录，不自动发起 OpenAI 请求。接入由可信宿主控制，执行日志与完成状态依据真实进程回执。
4. Windows 交付：系统托盘、打开界面/恢复、通知和退出；独立配置与数据根、诊断、离线可复现打包。不自动设置开机启动，不更换用户默认浏览器，不在验证中改写真实历史。

## 验收

有用成果与提醒需跑真实 Node→Python→SQLite 链；校验权限、幂等、路径、损坏成果、关闭记忆和临时会话。调度需验证共享槽、重复投递、失败不盲重试、暂停和退出。连接器用实际子进程合成协议验证，真实外部模型状态单独报告。Windows 包须在新数据根冷启动、关闭再恢复。旧回归继续通过。

## 成果、提醒与界面边界

`artifact.create` 沿用 kernel 的 action 事务，保存 1–12 个 UTF-8 文本文件，单文件最多 64 KiB、合计最多 128 KiB。路径仅允许相对 ASCII 路径和明确的文本/源码后缀，不允许绝对路径、设备名或跳转目录。文件内容和 SHA-256 存在 action 回执；读请求同时绑定 turn_id/action_id。下载始终是 ZIP，源码不会作为宿主网页运行。Python 是最后的校验方，模型声称完成不构成回执。

`reminder.create` 进入同一 action 事务，接受之前检查时间，持久化时统一 UTC 表示；过期动作导致整份 decision 拒绝。提醒随后进入现有提醒/收件箱流程，可以从“近况”修改或取消。明确用户提醒与模型主动关心保持各自的许可规则。

默认 UI 沿用现有视觉。在大的活动卡片中显示真实成果文件、下载按钮或提醒回执；普通聊天仍显示“正在思考”。可替换的完整 UI 通过 `morrow.ui/1` 的 `artifact.read` 能力访问同一成果，必须持有 tasks scope。新包和默认 UI 不拥有 runtime 生命周期，也无法读取模型凭据。

## 后台和恢复

`background.mjs` 每 30 秒通过同一 runtime 执行槽检查一次；前台有任务时跳过，不另开模型会话。主动联系默认关闭，开启后的时间、话题、每日限额、暂停、到期重评估仍由原 Python 策略控制。模型可以选择取消而不发送。失败停在已有 needs_retry/核对流程，不自动重复 HTTP 请求。

收件箱游标、暂停与系统提示开关写入私有 `background.json`。首次启动从已有收件箱末尾开始，避免把历史消息全部弹出。通知只写序号、数量和时间，不把正文送到桌面。先持久游标、后系统提示，保证不反复提示；这意味着极短的崩溃窗口可能丢失一次系统提示，但消息仍在收件箱。

可信启动器拥有独占 instance 文件和短暂 startup-lock。确认旧 PID 已退出后归档旧 instance，保留所有历史；活 PID 不替换。请求日志保存拥有者 PID 以及外部编码进程 PID；只有进程已退出的 reserved 请求才标记 interrupted_outcome_unknown，绝不重发。无法确定所有权、损坏文件或遗留 startup-lock 时保留原字节并停止启动，需要人工核对。应用内退出依次停止后台、等待 runtime/进程实际结束并释放锁。

## 可选编码连接器

设置 `PERSONAL_AI_CODEX` 为官方 Codex CLI 可执行文件的绝对路径，且用 DeepSeek 模式启动，才启用 `/code 请求`。默认不配置。每次调用创建独立 CODEX_HOME、空工作目录与 schema，使用官方非交互 JSONL 协议。模型提供商固定为 DeepSeek `deepseek-flash`，使用同一私有 key 和请求日志；不继承当前 Codex 登录、OpenAI key 或用户配置。shell、apps、多 agent、联网搜索、安装工具关闭，sandbox 为 read-only。

连接器目前负责生成可下载源码成果，不是任意仓库开发环境。只在退出码为 0、收到 turn.completed 与最后结构化输出后交给 kernel。取消/超时终止拥有的进程树并等待 close；日志只保留状态与计数。合成真实子进程已验证成功、超时、缺少完成事件；**尚未进行官方 CLI→DeepSeek 的真实连通试验**，不要将这些测试称为官方 Agent 已验收。

协议依据：[官方非交互模式](https://developers.openai.com/codex/noninteractive/)、[配置参考](https://developers.openai.com/codex/config-reference/)、[DeepSeek Codex 接入](https://api-docs.deepseek.com/quick_start/agent_integrations/codex/)。未执行文档中的远程安装脚本，也未修改用户 Codex 配置。

## Windows 交付

`tools/build_windows.py` 只读取已安装且固定的 Node、Python、Vue、Rolldown 和实际需要的依赖，离线生成带 SHA-256 清单的便携 ZIP。不含 key、业务数据、测试数据或用户界面包。`Install.cmd` 校验清单后安装到新的当前用户版本目录，保留旧版并创建开始菜单入口；不写开机启动。`Morrow.cmd` 直接运行托盘。需要 Windows 10/11 x64 和已安装的 PowerShell 7；这是未签名的开发预览包。

托盘提供打开、恢复界面、暂停后台消息、系统提示、配置 DeepSeek、数据目录和退出。关网页继续运行；退出托盘才关闭服务。数据默认 `%LOCALAPPDATA%/Morrow/data`；源码开发继续用 `.product-data`，两者不会自动混合。凭据用当前 Windows 用户 DPAPI 保存，禁止写进包、前端或命令行。可用 PERSONAL_AI_HOME 指定独立数据根。

通知使用 [Windows NotifyIcon](https://learn.microsoft.com/en-us/dotnet/api/system.windows.forms.notifyicon)；系统勿扰和通知设置可能影响提示，收件箱是实际送达记录。桌面原生托盘/通知的人工视觉验收、另一台机器安装和敌对代码原生隔离仍未完成。

## 验证与下一步

阶段证据和最终计数见 `reports/core-012/report.json`。真实 DeepSeek 使用新业务数据根完成三次串行请求：偏好记忆、使用记忆生成成果与提醒、到期主动联系重评估。第三次模型选择取消，系统按决定执行。原业务数据库哈希未变。源码成果 ZIP 已解包核验；浏览器看到真实交互卡片，但内嵌浏览器没有确认下载事件，不能称为磁盘下载视觉验收通过。

这批的目标是一个可以继续试用的本地 Personal AI。整套 UI 的自然语言作者工具链明确未开始；默认界面仍可以按 CORE-011 导出、修改、导入和回退。通用电脑操作、持续观察、社区分发、TTS、无边界的代码执行与跨设备同步不在本批完成声明内。历史 accepted 和旧报告保持原样，本批报告为架构师自验 submitted。
