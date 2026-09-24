# BATCH-011 · 可替换界面底座与有界 DeepSeek 试验

## 1. 唯一派工与责任

工作区 `C:\Users\xiayu\Documents\Codex\companion-agent`。单一 Codex GPT-6 Sol 实现对话，串行完成 A→B→C；包间无需另等批准，批末统一提交。不得启动子智能体、其他对话、Hermes、Codex app-server 或其他官方 Agent。当前 OpenAI 账号不得用于额外接入试验。

**初始产品前端的视觉设计与实现由交接方架构师亲自负责，不交给本批执行者。** 不制作产品首页、不决定配色/排版/角色形象、不修改已有工作台视觉、不开发模板选择器。B 包只允许使用带“开发验证页，非产品界面”标识的朴素测试宿主和手写测试包。测试控件是工程夹具，不得作为产品交付。今后初始界面可通过同一代码包接口接入，不因技术测试样式形成视觉约束。

本批目标：可编辑源码包→校验/封存→候选就绪与版本切换/恢复机制；然后用已授权 DeepSeek 生成一次代码并基于该代码继续修改一次。模型输出只落候选文件，不执行。不是完整 Personal AI、生产沙箱、真实任务执行或旧卡验收替代。

必读顺序：AGENTS.md → docs/product/PERSONAL-AI-VISION.md → docs/decisions/ADR-002-personal-ai-evolution.md → docs/decisions/ADR-003-personal-space-spike.md → 本文件 → docs/handoff/BATCH-011-MAPPING.md → docs/execution/common/ARCHITECTURE.md。按需读旧源码和 reviews/BATCH-010.md，不加载全部历史，不读 holdout 内容。

采用新的增补实验轨道 PAI-S01/02/03，不改旧156卡、原规范hash或 taskctl。前置已验收的工具链与 Vue 选型可复用；本批不依赖尚未通过的 Hermes/Codex 真实接入。根项目不得引用实验协议。ADR-003 冻结本批边界，执行者不得自行提升为正式公共契约。

## 2. A 包 / PAI-S01：代码包与修改工具

职责目录 `tests/spikes/personal-space/core/`。先实现纯逻辑和文件适配器，再做 B。接口技术说明写入本批 evidence 的 integration.md，供架构师接入原创初始界面。

支持一种透明的零依赖包：UTF-8 `view.html`、`view.css`、`view.js`，允许任意布局和普通浏览器交互代码；不是配置主题或固定组件 DSL。本批不支持包内 npm、外部资源、构建脚本、服务端代码。使用受信的装配器确定性复制/装配这三份源码，不执行其中的 JavaScript，不动态 import，不调用包内命令。保留可编辑源文件与产物，不只保留压缩结果。后续 Vue 编译链另行验证；这一最小格式不限制最终视觉设计。

私有格式 `personal-space-spike/1` 至少包含 package_id、revision_id、base_revision、host_api_version、entry、三个源码文件的 hash/字节数、build_input_hash、artifact_hash、来源类型（handwritten_fixture/model_candidate）、requested_scopes。当前 scopes 仅允许 `read_demo_state`、`write_demo_draft`，声明不等于授予。宿主授权为独立对象；模型不能提交身份、权限、验收结论或发布状态。清单由可信代码从实际字节生成，不能信任模型提供的hash。

实现 readSource、stageSource、validateSource、sealCandidate、readRevision 五个窄入口及 CLI：输入显式固定工作目录与revision，返回结构化结果。固定三文件名、无递归目录导入/压缩包/任意路径读写；严格 JSON/UTF-8、未知字段拒绝、总源码最多64 KiB、单文件最多32 KiB。文件读取前拒绝符号链接、Windows reparse point/junction 和路径穿越；逐段核对指定根下路径。不得沿用已发现漏检junction的旧实现。并发或不确定路径状态须失败关闭，不把检查当作操作系统沙箱。

定义唯一可独立复算的hash序列：固定文件顺序，文件名长度+文件名UTF-8、内容字节长度+原始内容，长度编码固定；不得trim/换行规范化。说明 build inputs 和 artifact 的实际字节组成。相同输入hash稳定、任一文件变化会变；已封存版本不可改写，重名不同内容拒绝。修改在新candidate上完成，基于明确base_revision。源码结构检查不等于代码安全验证，显式输出 execution_validation=not_run。

验收 B11-A01：正常包往返/独立hash、空白和换行保真、增量修改保留未改文件、篡改/超限/非法UTF-8/未知字段/路径与reparse负例、封存后不可覆盖。负例用本批自建临时文件，不动原tmp和旧证据；不需要为数量凑测试。

## 3. B 包 / PAI-S02：稳定状态与替换机制（无产品视觉）

职责目录 `tests/spikes/personal-space/host/`。复用已装 Vue/Vite/TS/jsdom，不安装依赖。可在本批 personal-space 根下建自己的 vite/tsconfig、测试入口；构建输出仅放该目录 dist。既有 ui-preview、根桌面与原工作台只读。

宿主拥有独立于界面revision的 demo personal_ai_id、未提交输入、会话标识和任务快照。均为明确标注的本地虚构数据，任务 unavailable/idle 等状态由测试服务实际提供；没有真实执行不能显示已完成。持久化带版本、限额和严格校验，损坏返回恢复状态；换包/回退/重新载入不能丢输入、换身份、改变进行中任务的绑定revision。它不是认证、长期记忆库或真实业务数据库。

生命周期实现 preparing→waiting_ready→active 或 failed/cancelled；旧active在候选ready、hash、base_revision与请求代次全部匹配之前保持。候选超时/异常/取消保留旧active；旧候选迟到不能覆盖新选择。切换原子提交一个状态记录，失败不留下半个指针；undo回到上一已知可用版本。停用/恢复入口在宿主外壳，始终不依赖模型。

定义最小桥：ready、read_demo_state、write_demo_draft、host_state_changed。绑定 frame/source、每次装载随机通道标识、revision、请求ID；校验字段、大小、频率、允许方法及宿主grant。不要用任何frame都接受的全局message handler；opaque origin不能靠origin字符串认证。普通postMessage初始化只转交绑定的MessagePort，之后用窄协议。生成界面不能写任务完成、费用、授权、host identity或原始HTML到宿主。桥对未来正式应用服务留接口，不暴露通用文件/HTTP/shell/IPC。

本批仅可装载**本仓库人工编写、清单固定的无外网测试fixture**；C生成的包、任意外部包一律拒绝执行/装载。测试宿主使用sandbox/CSP并避免allow-same-origin、弹窗、父导航、Node桥；这只用于验证接线，不能宣称实现了敌对代码的进程/网络/死循环隔离。真实不可信代码隔离留待原生宿主专批。不要为了完成B擅自安装Electron/E2B、启用远程沙箱或放宽策略。

验收 B11-B01：实际核心状态机测试覆盖ready/超时/失败/取消/迟到/过期base/并发操作/恢复；持久化重新实例化后身份与输入保持。B11-B02：错误source/channel/revision/权限/大小/洪泛与未声明动作均拒绝，真实状态不会由显示包伪造；模型包装载显式返回 untrusted_execution_unavailable。DOM行为测试验证朴素入口和恢复，不作为视觉/浏览器安全证明。若已有允许的浏览器通道可以验证测试fixture，单独记录实际观察；已被拒绝的URL/截图/通道不得换协议、端口、浏览器或工具绕过，失败就记not_run。无需截图作为本批功能提交前置。

输出 integration.md：初始UI三文件如何接入、只读状态/输入接口、ready示例、状态边界、实际支持和限制。示例不得变成多个官方主题；不得替架构师制作正式首页。

## 4. C 包 / PAI-S03：DeepSeek 网络窄适配与真实源码迭代

职责目录 `tests/spikes/personal-space/deepseek/`。先离线测试全部失败边界，再启动受限live。复用旧 deepseek_client 的限额/读取思路，不改旧文件或运行旧smoke live。CLI提供 --plan、--offline、--live；默认plan，import/测试发现/build不能发网或读密钥。

### 凭据与请求授权

用户已明确授权此项目使用提供的DeepSeek key。它已保存为 Windows DPAPI CurrentUser 加密文件：
`C:\Users\xiayu\AppData\Local\CompanionAgent\credentials\deepseek.dpapi`。
无需再次索要密钥，不扫描其他路径、环境、浏览器或账号。只允许专用PowerShell live launcher在真正执行时读取该文件并解密；不要改写、复制、备份或删除它。不把密钥放入仓库、prompt、报告、终端输出、异常、命令参数、截图或全局环境变量。

launcher只把解密值经子进程私有环境传入专用Node网络worker；用固定node绝对路径、UseShellExecute=false、显式最小环境，绝不传给编译器、测试框架、浏览器、生成代码或其他进程。worker无工具执行/文件搜索/子进程能力，除固定候选输出和本批ledger外不得写入。禁止打印环境/原始请求头/原始服务错误。--plan/--offline必须通过替身证明未读取凭据且网络0次。

本批**最多2次串行DeepSeek请求，含失败/超时/结果未知在内；无自动重试、无并行、无其他账号调用**。不启动当前OpenAI账号的官方Agent。第一次生成候选源码；仅第一次HTTP响应完整、JSON结构和A包校验通过且未触发预算限制后，才允许第二次提交第一次源码和一个新的虚构修改要求。第一次失败/超时/限流/截断/非法结果则live停止，完成其他本地任务并如实提交，不为了“变绿”改ledger或调用第三次。

ledger=`reports/evidence/BATCH-011/live-attempts.json`：在凭据读取/请求之前原子预留attempt号，重启/崩溃后已预留也算用过；排他锁拒绝两个进程同时运行，不能删除锁后重发未知请求。记录request ID（如有）、时间、model_requested/model_returned、阶段、finish_reason、token usage/null、候选hash/校验结论、错误类别；不存key、headers、完整错误body或reasoning。ledger单独保存请求状态，不与产品任务completed混淆。

固定 endpoint `https://api.deepseek.com/chat/completions`，model=`deepseek-flash`；非流式、thinking disabled、JSON object响应。固定可信system prompt；传给模型只有虚构指令、公开私有实验接口说明及第一次生成的三份源码，不传仓库/用户文件/真实身份/聊天/记忆/路径。JSON schema只含三份固定文件内容，不允许命令、URL下载、权限或清单hash。作为数据保存，禁止eval、动态import、vm执行、node运行或自动预览。HTML/CSS/JS静态检查通过也不能移除隔离门槛。

执行当天先查官方文档的模型/接口/价格（是公开网页读取，不是模型请求）：https://api-docs.deepseek.com/quick_start/pricing/ 、https://api-docs.deepseek.com/api/create-chat-completion/ 。架构取证日期2026-09-24 Asia/Shanghai，文档峰时cache-miss输入$0.30/百万tokens、输出$1.20/百万tokens；不是承诺价格。若价格/接口/模型不符，保留离线交付，live记blocked，不擅自换模型或增预算。以实际UTC日期记录执行，不把本地日期硬套UTC。

每次messages序列化≤16 KiB、max_tokens≤4096、response body≤128 KiB（流式逐块计数）、90秒内终止、redirect=error、不使用工具调用。按messages UTF-8字节数×2加1024输入token余量估算上限，加4096输出tokens，以执行日较高适用单价计算；两个预留请求合计估算不得超过US$0.05。预算不足先拒绝；这是本地保守估算门槛，不是供应商硬账单上限。未知usage/费用为null，非零假设不能据缺字段记免费。精确返回模型版本可记录供应商别名，不能伪写成请求名。

第一次虚构任务：写一个只在本地维护“三件今天想做的小事”的可折叠交互界面（自由写代码、无需设计产品首页）。第二次：在第一版增加“显示尚未勾选项”的切换，保留原功能与宿主输入接口。两版必须真实分别来源于两次响应；程序不能暗中补齐功能再称模型生成成功。结构校验成功不等于交互或视觉已通过。若静态结果不满足指令，保存候选和失败说明，不继续修复请求。本批也不让模型裁定自己的功能验收。

验收 B11-C01：离线覆盖不配置凭据默认0网络、预算/体积/超时/重定向/并发/上次未知/两次耗尽/非法JSON/截断/凭据不泄漏；只对自己构建的假key做泄漏负例，不能把真key写进扫描模式或报告。B11-C02：两次真实请求或准确失败/not_run记录；第二次prompt的base源码hash=第一次候选hash；输入输出与A格式、实际usage证据一致。成功也只称“真实源码生成与增量修改候选”，不称生产UI已替换或功能已运行。

## 5. 精确写集与排除

只允许新增/修改下列新目录与文件：
- `tests/spikes/personal-space/`：本批core/host/deepseek源码与局部配置，禁止放真实key或扫描其他目录；运行产物在该目录dist内。
- `reports/evidence/BATCH-011/`：测试/fixture/虚构生成候选/日志/manifest/文档/私有attempt ledger/专用tmp。
- `reports/BATCH-011.json`、`reports/BATCH-011.checkpoint.md`、`reports/BATCH-011.md`。

全部旧源文件、旧测试/报告/证据、根依赖和lock、apps/services/packages、156卡/helper/公共契约、reviews、架构/派工/基线/范围检查器均只读。密钥文件是只读例外，且仅C live launcher可读。不安装或升级依赖。不得编辑根AGENTS/PROMPT或扩大本写集。不得初始化Git/提交/推送/部署/公开分享。不要重试此前被拒绝的递归清理；本批tmp可保留。

每包建议3–6个职责清晰的手写源码文件，测试/fixtures另列；必要时合理拆分，不为文件数造巨型文件。连续工作无需每张小卡等我确认；每完成A/B/C更新一次checkpoint，超过约60分钟也更新。单一问题两次修复仍失败或必须改公共边界时停该路径，写清阻塞，继续能独立完成部分。不要扩大为完整记忆、人格系统、数据库、社区、桌宠/TTS或主控调度器。

## 6. 自检、证据、交接

使用已有本地runtime与测试依赖。A/C纯逻辑使用定向Vitest或现有Node，B使用独立局部build/typecheck/DOM；别以测试数量代替验收。未改旧工作台不要求重复完整历史测试。B10-T1只在本批需要复用旧等待harness时新建修订版本（按完成条件等待，不按固定tick），原证据不改。根桌面typecheck/build作为装配未受影响的必要检查各一次即可。

统一报告 status=submitted、batch_id=BATCH-011、track=personal-ai-supplement、dispatch_ref=docs/handoff/BATCH-011.md、base_ref=本批baseline.snapshot_id、dispatch_sha256=实际派工hash。报告覆盖B11-A01/B01/B02/C01/C02，各项分开写pass/fail/not_run及证据、blocked原因、模型请求计数和未知项。保持原M00.3.01/M00.4.02/M00.5.01的验收状态不动；原accepted12不增加。报告带changed_files_this_round；result_ref指向本批manifest实际hash。manifest收录源码/配置/测试/fixture/所需接口说明，不包含报告自身、日志、ledger、依赖或dist缓存；模型候选可列为单独明确来源的成果。

顺序：必要测试→manifest与report/checkpoint/批摘要→权威范围检查落盘复跑（包括日志自身）→复算成果hash→taskctl validate/next --repo .。基线 `docs/handoff/BATCH-011-BASELINE.json`，只读检查器 `docs/handoff/check_batch011_scope.py`；不要用旧批次基线判本批越界。报告清楚区分：已写实现、离线测试、真实模型、真实浏览器、原生隔离、产品视觉。后三者不能由源码或DOM推断，原生隔离和产品视觉本批not_run是预期。

完成本批或达到明确阻塞后停止，交接方统一独立复核。不要写accepted，不自动继续PAI后续阶段。
