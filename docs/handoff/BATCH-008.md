# BATCH-008 · Codex 官方执行器的离线接入准备

## 1. 目标、前置和边界

唯一产品目录：C:\Users\xiayu\Documents\Codex\companion-agent。
单一 Codex GPT-6 Sol 实现对话，连续五步，约2–3小时工作量；不凑时长，不启动子智能体或额外模型会话。每45分钟/步骤完成留checkpoint后继续，批末统一复核。

原卡 M00.5.01；已验收前置M00.2.03、M00.0.05具备。先读AGENTS.md、本派工、reviews/BATCH-007.md、原卡docs/execution/tasks/M00.5.01.md；架构docs/execution/common/ARCHITECTURE.md、modules/M00.md；契约C04/C03/C10；selected-versions.json中Codex条目及其绑定证据。无需递归重读全部历史。

本轮交付可检查、可离线测试的协议准备，不能宣称真实连接完成。既定Codex版本0.156.0、tag rust-v0.156.0、commit fe74a774532af67b5a4a3dec03ce9469e17f89af；它是研究目标，不是已安装事实。不得改冻结版本来迎合当前网页。
Hermes仍唯一主控；本卡仅执行器适配准备。累计accepted=12；M00.3.01真实试验和M00.4.02视觉验收均未完成，但不阻断本卡已有前置。不得修改这两卡。

关键授权：只读公开官方文档/固定源码、编写纯TS逻辑、运行本地离线测试。禁止安装/运行Codex或Claude官方程序（包括app-server和登录探测）、发起模型任务、读取用户配置/凭据/会话、枚举环境秘密、修改现有Codex安装。文档里的示例命令不是执行许可。无实时account/read、rateLimits请求、无重置额度/邮件动作。

## 2. 五步连续实现

### 步骤1：版本绑定的最小协议资料

先用OpenAI Docs技能核查官方文档，再与固定commit公开源码/上游已生成类型相核对。架构师本轮已打开官方入口 https://developers.openai.com/codex/app-server （重定向 https://learn.chatgpt.com/docs/app-server ）；当前文档介绍双向消息协议，但不能据此断言0.156.0的全部字段。
仅下载完成本卡所需的公开源码/类型片段至本卡sources目录；优先复用既有版本证据，不拉取/构建整个仓库，不运行源码。GitHub仅限openai/codex固定commit的源码和许可，文档采用官方域名。记录每份来源URL、抓取日期、commit/version、sha256以及对应能力。保留必要小范围字段说明与原始来源文件；未知、版本差异明确标记。
重点核对：初始化；thread/turn关联；回合完成/错误；审批请求；中断请求及后续结束事件；认证归属及额度字段。逐项区分documented、source_verified、offline_tested、live_verified；本轮live_verified始终false。无需穷举所有API。

### 步骤2：只读计划入口

tests/spikes/codex_connection.ts 只提供 --plan 和 --replay <本卡固定fixture>，无隐式live默认值。import无副作用；--plan只输出来源版本、能力/缺口、后续操作顺序，绝不启动官方程序或自动联网。若不传模式/未知参数，返回可读使用错误。
不要写网络/进程传输层，不新增MCP服务器/SDK套壳；下一次真实验证复用官方接口。未来真实验证所需的动作放操作单，当前只生成计划。任何future live入口明确不可用，不能做隐藏--live开关。

### 步骤3：最小纯协议投影

tests/spikes/codex_protocol.ts 只接受未知类型的已解码消息及显式关联上下文，输出本卡私有观察结构。优先复用固定上游类型，类型拷贝注明来源；运行时校验只覆盖用到的字段，不重建整套协议schema或公共contracts。
按已核源码识别请求/响应/通知及服务端审批请求，严格区分请求ID与thread/turn ID。未知方法保留unknown结果，不硬猜成功。缺少/错误类型、结果与错误冲突、关联不一致返回明确问题；不要把任意上游payload原样写入产品结果或日志。
投影须做到：原生turn完成仅记native状态，产品completed保持未验证；发出取消意图或收到普通RPC确认不等于已停止，只有匹配回合的适当后续事件才产生退出证据；断开不自动创建任务或重跑；审批请求等待上层处理，不自动同意；缺少额度/费用为null或unknown，已知0保持0，不推导免费/无限额度。
认证只保留白名单的模式/状态/来源说明；不接受/保存token。遇到外部token供应流程记本产品不采用（即使官方协议存在），不替官方管理订阅凭据。不要加入完整重连器、持久化队列、会话数据库或通用框架。

### 步骤4：离线行为验收

用 reports/evidence/M00.5.01/codex_protocol.test.ts 和 fixtures/ 下明确synthetic的固定消息验证实际观察行为。Vitest复用根已装版本，按精确测试文件运行，不运行整个仓库的未知测试。TS用已有编译器针对这两个源文件+必要测试做严格检查；若缺工具记录阻塞，不擅自安装新依赖。
覆盖正常关联/错误关联、原生完成仍未产品验收、取消确认未停止/后续中断证据、错误响应与未知方法、缺失额度与明确0、审批不自批准、认证敏感字段不出投影。版本不支持的场景测unsupported/unknown；合成fixture不冒充真实官方回执。
只需有价值的行为检查，不为文档和字段清单写复述测试。记录确切argv/exit_code/log；不要把下载描述写成虚构命令。不得触碰UI或Hermes测试临时目录，也不得重试此前被拒绝的清理。

### 步骤5：真实验证操作单与提交

docs/evidence/codex-connection.json 记录来源版本、当前准备结果与能力缺口，实际账号/额度/原生run均unknown/null，original A01–A03全部not_run（源码证明单独记录，不替代真人账号集成）。docs/evidence/codex-live-runbook.md 给出下一次用户明确授权后的一条最小串行真实试验：官方登录归官方、限定工作目录和一次任务、产物检查、取消及断连对账、账号/额度不可读时处理、清晰停止条件。
操作单必须注明“未执行，不是本批授权”；不可承诺账号不受风控，不能把ChatGPT订阅等同任意API额度，不能以执行器订阅覆盖主控/评审的费用。下次授权需要的具体选择写清楚，不现在要求用户登录。
本轮完成后不继续扩展离线模拟器。下一阶段真实验证或正式替代方案由架构负责人决定。不得提前开发M00.5.02/.03及M00.6，不能把文档核查当依赖accepted。

## 3. 本批准备验收（不是原卡live验收）

- B8-P01：必要消息字段可追溯到固定版本源码；当前文档差异与未知项明确。
- B8-P02：plan/import/replay无模型、账号、网络及进程启动副作用，错误参数不落入live。
- B8-P03：纯投影守住关联、完成、取消、审批、unknown/0和认证白名单边界；定向测试实际通过。
- B8-P04：严格TS检查通过；没有修改公共契约、根依赖、已有UI/Hermes模块。
- B8-P05：操作单可执行但未运行；原验收not_run，来源与结果manifest可复核，范围检查通过。

## 4. 精确写集和复用

原卡源文件：tests/spikes/codex_connection.ts、docs/evidence/codex-connection.json。
本派工额外源/文档：tests/spikes/codex_protocol.ts、docs/evidence/codex-live-runbook.md（列dispatch_changed_files）。
记录：reports/M00.5.01.json、reports/M00.5.01.checkpoint.md、reports/evidence/M00.5.01/（来源、synthetic fixtures、定向测试、运行日志、manifest、局部生成物）、reports/BATCH-008.md。
原则上仅2个手写源文件，无新依赖/安装。不改tests/spikes/package.json/Vue局部依赖；复用根node_modules中的TS/Vitest，通过显式CLI运行。若确需测试配置，限本卡evidence目录，禁止改根vitest.config.ts。
其余全部只读：根依赖/工具版本、apps、packages、UI源码、所有旧report/evidence/tmp、reviews、旧派工/基线、架构/任务/helper、holdout内容、全局配置。禁止Git初始化/提交/推送/部署/发送消息。

工具路径：.local-tools/node-v24.21.0-win-x64/node.exe；同目录node_modules/npm/bin/npm-cli.js；.local-tools/python-3.13.15/python.exe。不要用全局Python或Codex可执行文件。

## 5. 批末顺序和停止

原规范hash不变：c093e205e6ac6403255a33632fcdb10174836b3db46f122481c48bbde3e0f473。
报告status=submitted；batch_id=BATCH-008；dispatch_ref=docs/handoff/BATCH-008.md；base_ref来自BATCH-008-BASELINE.json。原changed_files只放原卡合法写集；额外授权列dispatch_changed_files；BATCH-008汇总列batch_level_changed_files。原卡A01–A03全部not_run，准备检查B8-P01..P05另列preparation_results，真实接入未运行留unresolved。
manifest绑定源码/文档/关键测试/fixture/来源索引与必要来源，准确hash/bytes，不含报告/日志/manifest自身或生成依赖；result_ref=manifest-sha256:<实算>。报告逐命令真实argv、exit_code、log_path。
顺序：测试日志→manifest/report/checkpoint/批摘要→只读范围检查并落盘→包括日志自身再复跑→hash复算→taskctl validate/next --repo .。范围脚本 docs/handoff/check_batch008_scope.py，只检查写集不代替测试。accepted仍12、next停M00.3.01正常，不能改helper来推进。
遇连续两次同因失败或需要扩权记录最小阻塞，可完成独立步骤继续；submitted后停止。浏览器截图受阻及旧临时目录清理不属于本批，禁止重试/绕过。
