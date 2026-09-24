# BATCH-013-R1 独立复核

结论：**按离线创作链范围 accepted**，R1-A01/B01/C01/D01通过；B13-R01/R02关闭。原156卡accepted仍12。此结论不接受模型代码的运行、安全、真实浏览器或产品视觉；这些继续not_run。

## 独立证据

评审写入前R1范围检查PASS：modified15 / added1711 / missing0 / outside=[]；build源文件已包含在检查中。49项manifest的hash/字节数及result_ref、派工hash/base_ref均一致。1733项变更/manifest文件归档于reviews/history/BATCH-013-R1/submitted/，复核结束hash无变化。76项旧候选、旧派生工作区、账本/锁和BATCH-013证据与基线一致。

实际复跑作者工具链28测、核心5测、宿主16测，共49测；TS类型检查和16个JS文件语法检查通过。测试副本只调整导入定位、测试scratch和CLI固定测试根，调用实际提交源码，不修改原证据。记录位于reviews/evidence/BATCH-013-R1/。

独立重放上次探针：四种错误源码（TS类型标注/interface、顶层return、顶层await）均source_validation=failed、build=source_invalid；正常JS仍通过。新Babel script解析也覆盖拼接后的有效JS。失败check误挂current_build现返回recovery_required；实现另校验源/有效文件、SDK前缀hash、来源及权限关系。旧合法构建仍可读但旧工具回执不再标当前有效。

恢复测试确实使用MountCoordinator.recover、BoundBridge、StableHost：原写已落盘但ACK未知，不再自动重发；显式宿主重挂建立新channel，读回原草稿，新保存只在新ACK后成功，旧ACK不能释放新请求。SDK reconnect本身仅等待fresh init，不再把这一中间态当作完整恢复。读超时也冻结，频率、重复init和报文限额回归通过。

新模型后代的作者hash与旧人工修订源相同，工具/SDK改变使artifact hash改变，来源仍model_candidate。旧工作区保持只读。模型源/后代没有进入eval或宿主；独立vm.Script探针只编译评审手写合成字符串、没有执行。本次模型/HTTP请求0、真实凭据读取0。

## 下一步

结束这段创作工具链修订，进入BATCH-014个人AI稳定身份与显式偏好的本地应用层。新功能应让界面/执行器变更不丢掉名称、称呼和已确认表达偏好，而不是继续扩展语法工具。仍不接真实模型、不设计首页、不建立第二套语义记忆库。ADR-005明确本地开发持久化与未来生产数据库的边界。

初始UI由架构师亲自负责，开始设计前另行通知用户并等待其调整推理档位。本轮未开始设计。
