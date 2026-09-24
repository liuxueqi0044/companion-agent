# BATCH-011-R1 · 四组独立复核修订

## 1. 目标与顺序

唯一工作区 `C:\Users\xiayu\Documents\Codex\companion-agent`。单一既有实现对话，串行完成R01→R02→R03→R04，批末统一submitted。先读AGENTS.md、reviews/BATCH-011.md/.json、本派工，按需读原BATCH-011与ADR-002/003。四项是同一批收敛，不开展新功能或完整产品接入。

初始产品UI视觉和实现由交接方架构师负责；开始设计前须先通知用户并等待其调好推理档位。你不设计首页、不改视觉、不新增主题。可新增两个朴素手写fixture证明不同版本替换，不作为产品设计。

旧BATCH-011已归档，现status仍submitted，独立结论changes_requested。原156卡、accepted12不变。旧DeepSeek预留1次/HTTP0次；ledger/lock冻结，**本修订模型请求数必须0**。不运行旧live或新live，不清锁、不改ledger、不新增或消耗live预留。不开子智能体/新会话/官方Agent，不碰当前OpenAI账号。

## 2. R01：修好实际frame生命周期

问题位置main.ts:72、undo与mountCurrent，独立反例见reviews证据，只读引用或复制到新证据后改为正确行为断言，不改原探针/结果。

- 每个装载操作拥有自己的frame、bridge、timer、代次与取消清理；旧操作完成只能处理自己的资源。先验证并完成candidate ready再原子替换旧active。核对frame/source通道绑定、版本hash和当前base；后到旧成功/错误不覆盖新选择或提示。
- activate、恢复、undo使用一致的协调入口，不要保留mountCurrent绕开取消/代次的第二套路径。undo必须恢复实际frame与桥，不能只换record指针后删除当前视图；候选失败保留上一可用视图，未提交draft、身份和task绑定保持。
- 用户stop/cancel在hash校验期间、load前、ready微任务期间、恢复期间发生，迟到工作都不得重新装上；关闭端口和timer。恢复失败不破坏可用active；无历史undo不拆掉当前视图。存储写失败要同时保留正确指针和实际frame，不显示成功。
- 新DOM/适配器回归必须操作实际入口/协调器：两次成功后undo、不同revision回退、旧先失败/新先成功/旧迟到、连续recover、recover后stop、hash未完时stop、写入失败。状态机纯测不代替渲染装配。不要靠固定tick或重跑碰绿，以完成条件和有界超时等待。

## 3. R02：所有出站状态也服从授权

stateChanged与read_demo_state共用明确读取门槛：本连接ready、当前active绑定一致、尚未关闭、拥有当前有效read_demo_state grant。候选/失活revision、空grant、写权限但无读权限、关闭后与撤权后不能发snapshot。对外数据仍限定demo投影，禁止角色/界面自报授权。

关闭幂等，关闭后receive/stateChanged均不处理业务，不仅移除onmessage。明确同revision多次装载的连接生命周期，旧连接不能因revision字符串相同继续收发。测试断言port的实际发送次数/内容及host状态，不只断言函数返回码。增加正例证明激活且授权连接可收更新。

## 4. R03：完整manifest封存身份

sealCandidate已有目标时，只在完整规范化manifest（全部固定字段及源码/产物hash、package/revision/base、host版本、来源、scopes）相同且现有成果复核通过时返回already_sealed。字段顺序不同可按格式的规范序列处理；实质元数据不同必须revision_collision。不能通过修改旧封存目录迁就候选。

负例分别改package_id、base_revision、source_type、requested_scopes但保持代码相同；每例验证拒绝及原版本字节不变。正常完全相同重复封存仍幂等。保持原UTF-8/大小/hash/路径/junction回归，禁止为了修它扩大为目录导入、npm包或执行生成代码。

## 5. R04：匹配凭据格式、收紧尝试入口

原凭据是Windows PowerShell ConvertFrom-SecureString生成的DPAPI CurrentUser**文本**。用ReadAllText+ConvertTo-SecureString对应解码；真正live时才按需要使用SecureStringToBSTR/ZeroFreeBSTR转换，并在finally清理。不要用ProtectedData.Unprotect直接解码密文文本字节，不写回/改格式，不输出任何明文/原异常/环境。固定Node改用项目`.local-tools/node-v24.21.0-win-x64/node.exe`，不引用Hermes安装目录。

移除ResumeReserved以及重新使用reserved/failed_pre_send/未知attempt的入口。launcher层持久排他锁、预留与失败状态要闭环：预发送失败记录不冒充已发送，已预留仍消耗配额；post-send未知保持不可重试。已有真实BATCH-011锁和ledger不能碰，开发验证使用本批新目录里的合成ledger、合成DPAPI凭据、假worker/假transport。生产路径固定，不向最终CLI新增任意凭据路径/任意worker可执行参数。

将只读解码抽为专用小模块供launcher与credential-check复用；导入不得执行live。新增`credential-check.ps1`：默认只用本批合成密文验证，只有显式`-CheckConfigured`才读取固定真实路径 `C:\Users\xiayu\AppData\Local\CompanionAgent\credentials\deepseek.dpapi`。本修订允许在合成测试通过之后执行**最多一次零网络的真实本地解密检查**，返回仅decoded_nonempty=true/false及固定错误类别，不返回key/长度/密文；不调用worker、不读写ledger/lock、不发HTTP。此只读检查不是live，不需要预留或消耗模型attempt。真实凭据只允许该专用检查器读一次，其余工具不得搜索或读取。

合成测试必须覆盖完整序列化→解码→假worker秘密传递与最小环境；假key断言可比较，但不得写真实key作为扫描模式。覆盖坏格式/空文件/解码失败、保留锁拒绝且未读凭据、两个launcher竞争、预发送失败闭环和最多两次策略。测试要触发项目launcher/提取的实际逻辑，不能只证明fs.open('wx')或WindowsAPI本身。测试秘密和tmp只放本批evidence/tmp，允许保留，不递归删除旧目录。

`-CheckConfigured`失败就保留准确阻塞，不重试/改格式/搜索其他账号；成功也只能叫本地凭据可解码，API有效性/余额仍未知。**不进入live、第二阶段生成或任何HTTP试验。** 后续复核再派新的真实试验范围，不能因用户曾提供key而重置旧批历史。

## 6. 精确写集

可修改已有源文件仅：
- tests/spikes/personal-space/core/store.mjs、core/package.mjs、core/core.test.mjs
- tests/spikes/personal-space/host/main.ts、host/state.ts、host/bridge.ts、host/state.test.ts、host/bridge.test.ts、host/dom.test.ts
- tests/spikes/personal-space/deepseek/live-launcher.ps1、deepseek/worker.mjs、deepseek/policy.mjs、deepseek/deepseek.test.mjs

可新增源码仅：
- tests/spikes/personal-space/host/mount.ts、host/mount.test.ts
- tests/spikes/personal-space/host/recovery-fixtures/ 下可信工程fixture及生成manifest（无产品设计）
- tests/spikes/personal-space/deepseek/credential-reader.ps1、credential-check.ps1、launcher-core.ps1
- tests/spikes/personal-space/deepseek/launcher.test.ps1

新证据/报告：reports/evidence/BATCH-011-R1/（含tmp、离线合成ledger、测试、结果和manifest）；reports/BATCH-011-R1.json、reports/BATCH-011-R1.md、reports/BATCH-011-R1.checkpoint.md。

其他只读，尤其旧reports/BATCH-011*、旧reports/evidence/BATCH-011/全部、原live-attempts.json/live.lock、原host fixture、plan.mjs、reviews、架构/派工/基线/检查器、根依赖与lock、原156卡/helper/旧应用。真实密文仅上述专用检查器可读不写。不会改的允许文件不必动。局部构建产物仅写原host/dist（检查器排除缓存不是扩大源码权限）。如确需超出清单先记录边界问题，不自行扩权。

## 7. 验收与收尾

R1-A01完整manifest幂等/冲突；R1-B01实际装配/撤销/竞态/取消；R1-B02出站授权与端口关闭；R1-C01匹配解码与真实launcher离线流程；R1-C02单次只读本地凭据检查结果（pass或准确blocked）；真实模型/浏览器隔离/原生隔离/产品视觉not_run。所有结果附实际命令argv、退出码、对应断言和证据；沿用独立复核格式，不用“测试全绿”掩盖未运行项。

必跑原A4测/C5测/B8测和新增针对反例的回归、局部host类型/构建；实际数量随合理拆分变化，原断言不降级。不碰旧工作台，无需再次跑所有历史业务测试；根配置没变不重复根构建。不要求真实浏览器或截图，若使用已允许通道仍不得绕过此前拒绝。生成代码一律不执行。

报告status=submitted，batch_id=BATCH-011-R1，dispatch_ref本派工，dispatch_sha256实际文件hash，base_ref新基线snapshot_id，supersedes_ref指向旧report，result_ref绑定本批manifest。一个统一report/manifest/checkpoint加批摘要即可，manifest含本轮所需源码/测试/接口说明，不含自身、报告、日志、秘密或临时文件。旧BATCH-011报告保持submitted和历史不变，不写accepted。

每组修订完成更新checkpoint并继续；同因两次失败或越界停该路径，继续独立工作。收尾：必要验证→manifest/report/checkpoint/摘要→`docs/handoff/check_batch011_r1_scope.py`落盘复跑含日志自身→哈希终检及旧ledger/lock字节不变→taskctl validate/next --repo .。新基线docs/handoff/BATCH-011-R1-BASELINE.json；旧scope在评审新增后失败属历史范围不适用，不用改旧checker消红。结束后停止，等待统一独立复核。
