# BATCH-015 独立复核

结论：**按本地确定性任务流程范围 accepted**，B15-A01–F01通过；B14-R01/R02关闭。原156卡accepted仍12。需求语义理解、官方Agent、原生隔离及产品视觉仍not_run。

## 证据

评审写入前scope PASS：modified3 / added241 / missing0 / outside=[]。22项成果hash、完整manifest重建--check、两份Schema --check通过；244项提交归档到reviews/history/BATCH-015/submitted/，复核结束字节不变。12项历史报告/014数据库/模型/账本已由只读verification核对。

本批result_ref改为canonical JSON artifacts数组的SHA256，并非整个manifest文件字节hash。评审最初按旧格式比较失败，读实际实现后按其明确算法复算一致；完整文档另通过verification --check验证。后续报告必须继续明确hash语义，不把两种算法混称。

独立回归：54通过、1跳过。symlink创建受系统限制跳过，真实junction拒绝回归通过。测试副本只重定向CLI/临时目录及导入根，实际实现未改。最初测试副本命名不符合pytest发现规则，随后一个内嵌崩溃脚本仍指旧固定根；该脚本返回0，旧库无queued任务且所有提交hash未变。修复评审脚本的路径和Windows嵌套字符串问题后，单独重跑该用例通过；其余53项已通过，无需重复。评审工具错误与纠正日志全部保留，不归为产品缺陷。

## 关键独立探针

- 014缓存回执被改为未保存名字：现在recovery_required；history的[]/False/0/空字符串均invalid_request。正常重放/CAS/撤销原测试仍通过。
- 精确金额：0.1×0.2加3×0.1得到字符串0.32；零金额保持0；引号内换行的来源指向physical-lines:2-3。
- USD/EUR混合输出各币种小计且total=null。
- claim后、publish前请求cancel，迟到成功产物返回cancel_pending；确认停止后cancelled，result返回not_ready。原测试另外实测子进程锁、崩溃退出17、显式recover、retry新attempt和事务失败回滚。

相关记录：reviews/evidence/BATCH-015/pytest-rerun.txt、pytest-crash-posix.txt、probes.json、task-probes.json、final-integrity.json。复核仅执行手写固定工具/合成探针，无模型/HTTP/凭据、无网络监听、未执行生成源码。

现在已有可实际驱动的本地任务链；下一批转为桌面与真实服务的调用连接，不继续扩CSV规则或堆独立小样。BATCH-016负责非视觉bridge/进程管理/订阅投影；初始产品UI仍由架构师设计，开始前必须通知用户等待调档。
