# BATCH-011-R1 独立复核

结论：**本修订范围 accepted**，关闭B11-R01/R02/R03/R04。该结论限于本地界面底座修订、离线启动器与一次本地凭据解码证据，不代表真实模型接入或生产级隔离完成。原156卡accepted仍12；实现者submitted报告保持原样。

## 证据

复核写入前重新运行R1权威范围检查：11修改、173新增、0缺失、outside=[]。归档184项实际变化到reviews/history/BATCH-011-R1/submitted/，提交源码/证据在复核结束时全部字节不变。旧开发scope-rerun快照记录168新增，之后落盘的5项终检/任务证据都在本批允许目录内；以本次173项实际新增为复核范围，不因历史日志数字不同重做产品实现。

manifest23项hash/字节数、result_ref、派工hash均一致。旧BATCH-011 ledger/lock与原提交归档字节相同。核验单次configured本地检查输出decoded_nonempty=true；本轮没有重复读取真实凭据，也未执行生产live入口。

独立复跑：核心Node5测、DeepSeek离线Node5测、宿主Vitest16测、局部完整类型检查与构建均通过。启动器7组合成回归也通过；复核副本仅将临时文件根改到reviews/evidence/BATCH-011-R1/tmp，加载实际产品launcher-core/credential-reader，未复制或替换产品实现。无真实worker、真实key或HTTP。

另写独立entry-probe，经转译后的实际main入口和人工控制frame-load/MessagePort验证：v1→v2→undo恢复v1且有实际frame；无历史undo保留当前frame；双恢复以较新操作生效；stop移除装载且随后恢复可用；未提交多行草稿保持。独立空grant/撤权/closed出站探针和同源码不同包身份封存冲突均通过。结果见entry-probe-result.json。

初版探针让jsdom自己的load先于人工ready到达，导致测试夹具等待超时；改为拦截iframe load监听并按场景显式投递后通过。此为测试夹具适配，不是产品修复或真实浏览器测试。未修改产品代码/开发报告/旧证据。

## 修订判断

- R01：MountCoordinator统一资源归属、代次、切换/恢复/撤销。旧任务只清理自己的frame/bridge；候选就绪和状态提交成功后才替换实际视图。此前两个反例关闭。
- R02：出站和入站读取统一ready/current connection/active revision/grant/closed门槛；同revision旧连接也失效。空grant不再推送草稿。
- R03：完整规范化manifest决定封存幂等，不同包/base/来源/scopes碰撞被拒绝；已有版本未改。
- R04：对应PowerShell序列化密文的解码、冻结Node路径及失败留锁/预发送标记已落实。ResumeReserved已移除，原失败尝试不可复用。真实本地解码成功只证明文件可读解密，不证明API有效/有余额。

## 后续边界

真实模型、真实浏览器/原生隔离与产品视觉继续not_run。本轮复核HTTP/模型请求0、真实凭据读取0。下一轮BATCH-012仅消耗原两次额度中剩余的一次新尝试，保留旧attempt=1及锁，不复活旧失败请求。一次成功后也不自动追加增量生成；失败/未知立即停止live。

产品初始视觉由交接方架构师负责。用户要求开始UI设计前先通知并等待其调整推理档位，当前尚未开展。BATCH-012不制作产品首页。
