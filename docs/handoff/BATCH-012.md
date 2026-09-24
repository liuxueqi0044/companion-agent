# BATCH-012 · 剩余一次额度内的真实候选生成

## 1. 状态与目标

工作区 `C:\Users\xiayu\Documents\Codex\companion-agent`。先读AGENTS.md、reviews/BATCH-011-R1.md、本派工、ADR-003及现有DeepSeek plan/launcher-core和core源码。四组R1修订已独立accepted；这是增补实验，不变更原156卡与accepted12。

串行完成A→B→C：A搭建独立、有历史总额度约束的单次试验入口并离线贯通；B进行最多一次真实源码候选生成；C整理真实证据和给架构师的UI接入说明。包间无需等批准，失败记录后继续能独立完成部分。不开子智能体、新对话、官方Agent；不调用当前OpenAI账号。

这轮不是产品UI设计。初始界面由交接方架构师亲自设计实现，且须先通知用户、等其调好推理档位。不得设计首页/角色/配色/主题；生成任务仅沿用虚构三件小事工程样例，不能把它当产品视觉方案。任何模型源码均只存候选，不执行/自动预览。

## 2. 不重置历史与额度

历史BATCH-011预留1次，解码失败前HTTP0次，旧ledger/lock只读保留。新试验不是重用旧attempt，也不是重新获得两次额度。**BATCH-012最多1次预留；历史1+本轮1≤原总上限2。** 无重试、无并行，无第二阶段修改请求；成功后也停止live。崩溃/失败/未知/预发送失败均算本轮已消耗，不能删ledger/lock后重发。

旧ledger固定 `reports/evidence/BATCH-011/live-attempts.json`，预期sha256 `2503398cf3278e7b730b3dbae1cc493d3c6c2d77e48dc5623b24f1789064acf4`；旧lock预期sha256 `44e0b3e313c7b3695c16486134d793209f39dac30fefc9f4c2884f5cbbebbfcd`。新入口只读验证二者、旧记录为一个failed_pre_send且sent_at_utc=null，不匹配先拒绝。未知旧请求不得凭主观判断升级为未发送。

新账本 `reports/evidence/BATCH-012/live-attempts.json`、新锁 `reports/evidence/BATCH-012/live.lock`；记录local_attempt=1、global_attempt=2、previous_ledger_ref/hash和明确耗尽标记。成功可以按既有窄launcher协议关闭本轮锁，但ledger保留且下一次仍拒绝；不允许通过另一个入口取得本轮第二次请求。

模型固定deepseek-flash、endpoint固定https://api.deepseek.com/chat/completions。非流式、thinking disabled、JSON object；复用plan.mjs的虚构prompt与2500输出tokens限制。messages≤16KiB、response≤128KiB、90秒、redirect error、无工具调用/URL下载。读取执行日官方文档核对模型/接口/峰时价格；若与输入cache-miss$0.30/百万tokens、输出$1.20/百万tokens不符，则live停止记blocked，不擅自换模型或增加预算。官方来源https://api-docs.deepseek.com/quick_start/pricing/ 、https://api-docs.deepseek.com/api/create-chat-completion/ 。以实际UTC日记录核查，公开文档请求不算模型请求。

沿用plan的保守token估算；新请求估算+旧ledger.estimated_max_usd合计≤US$0.05，缺失/非法旧费用估算拒绝，不能当0。真实usage缺失为null；模型价格表估算不叫供应商实际账单，不把未知费用说免费。

## 3. A：最小独立入口，先离线证明完整工作链

新增 `tests/spikes/personal-space/deepseek/batch012-session.mjs` 保存本批持久预留/执行/失败状态逻辑，`batch012-worker.mjs`为固定路径窄CLI装配；`live-batch012.ps1`为固定路径launcher。复用已通过的launcher-core、credential-reader、plan/parseResponse/sendOnce和core包，不复制通用Agent或重写模型客户端。不要修改已验收代码；如果复用确需扩大公共接口，记录阻塞而非私自改旧实现。

worker对外固定 --plan/--offline/--reserve/--execute/--mark-presend-failed模式；只允许阶段1（原prompt首版生成），拒绝阶段2/任意prompt/endpoint/path。无参数默认plan。import不启动main；离线代码通过内部工厂注入本批合成目录/假transport，不向生产CLI增加任意凭据、worker、目录或URL参数。生产装配固定本批目录，不能用环境变量重定向旧账本。新PowerShell入口通过既有Invoke-CompanionLiveAttempt以Phase1、固定新worker/evidence路径启动；真实key路径沿用固定DPAPI文件，仅真正live时经launcher读取。

先校验历史身份/总额度，再原子预留并持久化；之后才读凭据；发送前写sent_unknown；返回后结构验证、保存三文件candidate、校验封存并记录hash。新账本区分local/global attempt，兼容既有窄launcher返回candidate_valid/错误类别，勿混淆provider phase与全局次数。要求崩溃时持久化到文件并sync，临时文件→改名；Windows下做不了目录级断电保证应在限制中说明，不能宣称绝对断电事务。

离线测试必须调用实际新session/worker编排与实际core存储，以假transport覆盖：正常response→candidate封存；坏response/截断/HTTP错误/超时→失败留记录；旧hash/状态/费用错误；预留失败不读key；已预留/未知/完成后重入全拒绝；历史1+本批1之外不能再reserve；双launcher竞争至多一个预留。证据中模型HTTP0，不能只测一个预算函数或复制的假账本实现。

至少一个合成端到端从launcher核心经假DPAPI凭据到新session，再到本批临时candidate的3文件/hash，验证实际集成；假transport必须可审计为内存返回，不能调用fetch/网络。仍在同一执行对话内串行开发；合成并发锁负例可仅并发本地无网络进程，不是额外模型会话。

## 4. B：真实一次试验（满足A才执行）

已有真实只读解码成功，不重跑credential-check，不搜索/打印/复制/改写密钥。专用新launcher在预留后读同一固定加密文件，以子进程私有环境传给固定网络worker；worker不再生成其他进程、不读仓库/用户资料、不执行代码。请求只含固定虚构prompt与必要的公开演示接口描述，无私人资料或本机路径。

确认A离线回归、范围检查、执行日文档核对及旧记录hash通过后，在同一对话串行调用新launcher一次。不要运行旧live-launcher或旧worker的live模式，不调用账户/余额端点试key，不做额外健康请求。网络错误/超时/限流/余额不足/非法JSON/内容不完整等均记录准确类别，停止live，完成C。一次凭据读取失败也停止，不凭“HTTP0”重置额度。

model-store在 `reports/evidence/BATCH-012/model-store/`，revision可固定`model-v1`，source_type必须model_candidate、execution_validation=not_run。保存源码和可信manifest，不执行、不加载到宿主、不让Node运行候选，也不让模型自评任务完成。可以人工只读审核源码，写instruction_fit=true/false/unknown及依据；不能偷偷补代码后仍称模型原产物。

记录request/model返回标识、UTC时间、finish_reason、usage/null、验证状态、源/产物hash、估算费/null；无headers/key/原始异常/reasoning。响应含key则只记credential_echo_detected，不落原body。静态结构符合不等于交互功能/视觉已通过；真实请求成功只能叫“实际模型返回且封存了一版源码候选”。

## 5. C：简洁接入交接，不继续扩大试验

`reports/evidence/BATCH-012/ui-host-handoff.md`写清给架构师的初始UI接入点：三文件格式、source→manifest/产物、稳定状态归属、ready/active时序、只读投影字段、草稿写入与消息约束、明确恢复/停止边界；对照当前实际代码，不许照旧integration.md复制已过期描述。给一段最小桥代码片段即可，不构建产品视觉。说明当前手写fixture信任注册方式、模型包禁止运行、原生隔离尚待验证。

整理本轮是否实现首次真实请求，若失败给下一次需要解决的一个具体条件；不为成功追加请求。第二版增量生成、真实任务业务、永久配置/记忆、人格、社区、UI设计或Electron沙箱均不在本轮。

## 6. 精确写集与收尾

只新增/写：
- tests/spikes/personal-space/deepseek/batch012-session.mjs
- tests/spikes/personal-space/deepseek/batch012-worker.mjs
- tests/spikes/personal-space/deepseek/batch012.test.mjs
- tests/spikes/personal-space/deepseek/live-batch012.ps1
- reports/evidence/BATCH-012/（官方文档核对、测试、合成tmp、真实账本/锁、候选、接入说明、manifest、日志）
- reports/BATCH-012.json、reports/BATCH-012.md、reports/BATCH-012.checkpoint.md

其余全部只读，包括所有旧源码/测试/报告/证据、旧ledger/lock、reviews、AGENTS/架构/派工/检查器、依赖/锁文件、原156卡/公共契约。真实凭据只限本轮live launcher读固定文件，其他入口不读。无依赖安装、无Git提交/推送/部署/社区发布、无holdout内容读取。不绕过以前浏览器/截图/删除拒绝；无需真实浏览器或截图，本轮不执行模型代码。

验收B12-A01实际worker离线端到端与历史总额度；B12-B01单次真实请求与候选证据（成功/失败/not_run逐实记录）；B12-C01准确UI接口说明与旧记录不变。新增测试用已有Node/Vitest/Powershell；复用模块只读，不重跑整套无关业务/视觉/根构建。每个包更新checkpoint后继续，任何live失败不能阻塞C交接。

统一报告status=submitted、batch_id=BATCH-012、dispatch_ref本派工、dispatch_sha256、本批base_ref、result_ref。报告必须列changed_files_this_round、全部验收结论、实际argv/exit与日志、local/global预留及HTTP计数、费用未知项。manifest覆盖新源码/测试/所需接口说明/候选固定成果，不含报告自身、日志、账本/锁、依赖、秘密或tmp；真实候选来源须显式标model_candidate。

收尾顺序：离线测试→有界live或准确blocked→报告/manifest/checkpoint/批摘要→`docs/handoff/check_batch012_scope.py`落盘复跑含自身日志→成果及旧ledger/lock hash→taskctl validate/next --repo .。基线docs/handoff/BATCH-012-BASELINE.json。开发者不得自写accepted，原accepted12不变；完成后停，等待独立复核。若本轮消耗剩余一次，后续模型请求必须另行明确派工，不能自动续费式重试。
