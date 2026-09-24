# BATCH-011-R1 · submitted

按R01→R04完成四组独立复核修订。原accepted=12不变；这是实现者提交，等待独立复核。

## 修订结果

- **R01 / 实际frame生命周期：** 新`MountCoordinator`统一activate、recover、undo；每次操作独占frame、bridge、timer和代次。候选ready、base与hash匹配后才切换；撤销恢复实际frame。失败、取消、停止及持久化失败保留正确旧状态或阻止迟到装载。新增第二个朴素手写工程fixture，仅供版本切换测试。
- **R02 / 出站授权：** `stateChanged`与`read_demo_state`同用ready、当前revision、准确连接、有效read grant和未关闭门槛；实际端口发送次数及内容有正反例。同revision旧连接也失效。
- **R03 / 封存身份：** 已封存目标按完整规范化manifest判定幂等；相同代码但不同package、base、来源或scopes拒绝为`revision_collision`，原封存字节不变。
- **R04 / 凭据与launcher：** 匹配PowerShell `ConvertFrom-SecureString`的文本解码；固定项目Node路径，去除`ResumeReserved`。合成launcher贯通预留、解码、假worker及失败留锁，覆盖并发和两次上限。旧live ledger/lock未触碰。

## 验证与边界

核心Node 5测、DeepSeek离线Node 5测、宿主Vitest 16测、PowerShell合成launcher 7组均通过；局部host TypeScript及Vite构建通过。命令、退出码和断言见[结构化报告](BATCH-011-R1.json)，原始输出在`reports/evidence/BATCH-011-R1/`。23项源码/测试/fixture的manifest逐文件哈希与字节数复算通过，`result_ref=sha256:572c23bcc46ce476b4fc650e76a1fd0e3e29227827ba80c3563b155bccc0f586`。

专用`credential-check.ps1 -CheckConfigured`仅执行一次，只读本地解密结果为`decoded_nonempty=true`、`error_category=null`；未启动worker、未发HTTP。这不证明API key有效或余额可用。本轮真实模型请求 **0次**，未生成、执行或装入模型候选。原批预留1次、HTTP 0次的历史和锁保持。真实浏览器、敌对代码原生隔离、架构师负责的产品视觉均为`not_run`；本批未制作产品首页或视觉。

R1权威范围检查复跑PASS，manifest和旧ledger/lock哈希终检PASS；`taskctl validate`确认156卡有效，`next`仍为M00.3.01 `not_run`、accepted 12。检查记录见本批证据。批末停止等待独立复核，不自写accepted。
