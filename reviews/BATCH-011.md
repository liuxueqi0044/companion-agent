# BATCH-011 独立复核

结论：**changes_requested**。本批有实际实现成果，但A/B/C离线验收均发现需修订项，不能整体接受。B11-C02真实候选仍not_run，原accepted12不变。开发者submitted报告保留不改。

## 独立验证

复核写入前权威范围PASS：modified0 / added50 / missing0 / outside=[]，50项实际变化与报告一致。manifest28项逐文件hash/字节数、result_ref及派工hash均一致。已归档50项提交文件到reviews/history/BATCH-011/submitted/。

独立复跑核心Node4测、DeepSeek离线Node5测、宿主Vitest8测、局部host TypeScript及Vite构建均通过。日志在reviews/evidence/BATCH-011/check-01..05.txt。未改生产源码、根配置或产品代码；本次无需重复未修改的根装配测试。没有调用live launcher、读取真实凭据或发起模型请求。

## 必须修订

1. **B11-R01 / P1，宿主装配与恢复。** main.ts:72对全局pendingBridge做旧操作清理。独立DOM夹具同时发起两次候选，旧操作失败收尾先关闭新端口；给新frame发送正确ready也无法激活，最终timeout。另一个反例：连续成功装入两次手写fixture，再按undo，状态为restored、active_revision仍fixture-v1，但iframe为0。单测只测状态机、DOM只测输入与stop，未覆盖实际替换/回退。要求操作拥有自己的frame/bridge、过期完成无权清理新操作；activate/recover/undo共用代次规则，先验证旧目标ready再切换，失败保留可用视图，停止后迟到不得重新装载。
2. **B11-R02 / P1，出站状态未校验权限。** bridge.ts:27的stateChanged无ready/active/grant/closed检查；空grant调用即发出含草稿的snapshot。入站校验不能覆盖这个出站入口。要求统一read_demo_state权限、装载绑定及关闭状态门槛，覆盖暂停/撤权/候选/旧revision，证明未授权时没有发送数据。
3. **B11-R03 / P2，封存身份冲突误判幂等。** store.mjs:118仅比较源码构建和产物hash；不同package_id、source_type、requested_scopes但相同代码的revision会返回already_sealed而不是collision。要求比较完整规范化manifest（含base_revision及所有版本/来源/权限元数据），原封存保持不可变。
4. **B11-R04 / P1，凭据格式不匹配。** launcher:65–68按原始二进制DPAPI读取PowerShell序列化密文。独立合成值验证原方式失败、ConvertTo-SecureString正确；不需要再次索要key，也不能据此认定key无效。修正匹配的只读解码器，使用项目冻结Node路径，增加launcher层假凭据回归。移除ResumeReserved；预留即消耗尝试，旧failed_pre_send与锁不得清空或重新使用。

反例结果见probe-results.json、probes.mjs；DPAPI证据见dpapi-format-probe.ps1及dpapi-format-result.json。探针只转译已审阅宿主源码并用jsdom/模拟MessagePort测试接线，未运行生成代码或声称浏览器隔离通过。搭建探针最初有相对路径错误，后因1.5秒观察窗短于产品3秒timeout而超时；已修正夹具路径和等待，最终实测新端口先被旧操作关闭、再投递新ready失败。初始探针错误不是产品缺陷证据，不用于验收结论。

## Live与后续

开发ledger记预留1次、sent_at_utc=null、failed_pre_send，代码解密先于execute；现有材料与HTTP0次一致。没有独立provider回执，真实key/API有效性、余额、usage与费用仍未知。旧ledger/lock和所有BATCH-011证据冻结。

下一轮BATCH-011-R1只修四组问题和必要回归；允许独立零网络凭据格式检查，不授权重启live或重置尝试预算。后续真正试验需在修订验收后明确处理新批次预算与历史记录。产品视觉继续not_run，由交接方架构师亲自负责；用户要求正式设计前先通知并等待其调整推理档位，本轮不开展视觉设计。
