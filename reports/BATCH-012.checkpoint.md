# BATCH-012 实现检查点

## A / 独立单次链路

- 新`batch012-session.mjs`在持久预留前校验旧ledger/lock固定SHA-256、唯一`failed_pre_send`历史记录、有效旧费用估算、执行日文档和累计≤US$0.05；新账本明确local_attempt=1/global_attempt=2/exhausted=true。worker仅接收固定phase 1模式，生产路径固定；新launcher复用已验收PowerShell凭据与排他锁逻辑。
- 新账本使用同目录临时文件、文件sync后rename；Windows没有便携的目录级fsync，不能称绝对断电事务。发送前保存`sent_unknown`；崩溃、失败与预发送失败都不重新预留。
- 新Node 6测通过，覆盖实际session/core封存、坏/截断/超大/HTTP错误/超时、历史hash/状态/费用/文档错误、重入拒绝，以及真实launcher-core→合成DPAPI→实际worker dispatch/session→内存假transport→三文件封存；两个本地launcher竞争至多一个新预留。旧核心5测、旧DeepSeek离线5测通过。生产`--plan`输出network_calls=0、credential_reads=0。
- 权威BATCH-012范围预检PASS（modified0、outside0）。合成测试模型HTTP0、真实凭据读取0；A结束，继续执行日官方文档核对与B的至多一次真实请求。

## B / 唯一真实请求与候选

- 2026-09-23 UTC核对DeepSeek官方价格、Quick Start、Thinking Mode与JSON Output：固定`deepseek-flash`、`/chat/completions`、`thinking.disabled`、`json_object`，峰时cache miss输入$0.30/百万tokens、输出$1.20/百万tokens一致。Chat Completion参考页直接抓取超时，官方索引和当日Quick Start证实端点；核对记录为`reports/evidence/BATCH-012/deepseek-doc-check.json`。
- 生产`--offline`返回历史1次、新全局第2次可用、预计累计US$0.0080748、network_calls=0、credential_reads=0。旧ledger/lock固定hash吻合，B前范围检查PASS且新ledger/lock均不存在。
- 仅调用`live-batch012.ps1`一次，退出码0，状态`candidate_valid`；新账本local_attempt=1/global_attempt=2/exhausted=true，HTTP 200、request_id `e3719f59-9bf5-42c4-a0d0-d25235532448`、返回模型`deepseek-flash`、finish_reason=`stop`，usage 275输入/2075输出/2350总tokens。按峰时价估算本次US$0.0025725，不是供应商账单；新上限估算US$0.0040374、历史+新上限US$0.0080748。成功后新锁已移除，账本仍保留并禁止再预留。
- 三文件`model-v1`只读`readRevision`复核通过，source_type=`model_candidate`、execution_validation=`not_run`，源码未修改、未执行/预览。人工只读审查发现HTML不是所需片段、桥消息形状与当前宿主不匹配且保存提示先于回执；`candidate-review.json`记录`instruction_fit=false`。首次真实模型返回成立，宿主接入和产品视觉未通过。B结束，继续C交接。

## C / 架构师接口交接

- `ui-host-handoff.md`据当前core/store/state/mount/bridge/main与可信fixture写明三文件片段格式、manifest/产物、稳定状态归属、ready/active与恢复/停止时序、窄桥读写投影、授权和消息上限，并给出最小桥示例。明确当前模型候选未注册、不可执行，原生隔离与产品视觉仍not_run；架构师正式设计前需通知用户等待推理档位调整。
- 本轮一版真实模型源码只作为候选证据，`instruction_fit=false`；后续若要接入，需另行修正并验收协议适配与原生隔离。总额度历史1+本轮1=2，后续模型请求需要另派工。本批继续统一报告/manifest/范围/旧账本hash终检。

## 批末统一提交

- 本批17项manifest覆盖4个新源码/测试入口、官方文档核查、候选只读审查、UI接口交接与candidate/revision两份三文件封存成果；不含报告、日志、账本/锁、秘密或合成tmp。逐项hash/字节数复算PASS，`result_ref=sha256:783857ec0e3dda0d319b6296028ed943eae66323290ed22bbe2134e6bcc3dda5`。
- 结构化报告和批摘要标记`submitted`，报告列出本批实际变更路径、命令/退出码、local/global次数、HTTP和费用未知项。首次权威范围检查PASS：modified0 / added229 / missing0 / outside0。接下来复跑范围检查并做旧账本hash、taskctl终检，然后停止等独立复核；不自写accepted。
- 批末范围落盘复跑PASS，并包含两份范围日志路径；报告`changed_files_this_round`与检查器229项完全一致。17项manifest/dispatch/result_ref复算、旧ledger/lock原始SHA-256及新账本封存引用终检PASS。`taskctl validate`退出0：156卡有效；`next`退出0：M00.3.01仍not_run、accepted12。状态submitted，停止等待交接方独立复核。
