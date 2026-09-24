# BATCH-014 独立复核

结论：**changes_requested**。基础身份、SQLite/CAS/撤销及CLI已有可用实现，独立26测通过、1跳过；存在两个边界问题，纳入下一大批第一包修复，不再单派零碎的小修批次。原accepted12不变。

写评审前权威scope PASS：modified0 / added83 / missing0 / outside=[]；16项manifest的hash/字节数、报告result_ref、派工hash和baseline吻合。83项提交归档在reviews/history/BATCH-014/submitted/，评审结束再次核对未改。Schema --check与verification verify通过，后者核对12项历史模型/账本/R1证据。

独立pytest使用原测试副本、实际源实现，仅将CLI测试入口和数据目录转到评审目录、保留原仓库导入路径。26 passed/1 skipped；跳过为当前系统不允许创建symlink，Windows junction创建及拒绝测试实际通过。此局部路径验证不代表系统级安全隔离。未读取凭据、调用模型/HTTP、启动网络服务或设计UI。

## B14-R01 · 幂等历史回执与真实修订不一致

_apply重放时对commands.result_snapshot_json只验证JSON/字段以及profile_id/revision相等，未与revisions中的真实原结果比较。独立合成工作区先将名字从默认改为Mira，之后只把commands缓存中的名字改成Never-saved-name（未改真实revision）；重放同一请求返回成功，result_snapshot名字是从未保存的Never-saved-name，current_snapshot仍Mira。

这是数据库内部关系损坏的探针，不是称普通操作会随机改名或把无签名存储当成防恶意攻击机制。服务已承诺回执代表原始结果且损坏不静默通过，故应在重放前核对完整原快照（含偏好/时间）与真实revision；不一致recovery_required，不能悄悄修回或覆盖历史。同时核对命令与revision双向关系，不仅行数。不要为此重做数据库。

## B14-R02 · 空的非法history输入被吞掉

PersonalAIService.history使用request or {}，导致[]、False、0、空字符串都被替换成合法默认请求并成功。CLI不会传入这些值，但公开的进程内服务允许调用，违背严格请求边界。仅None表示省略，其他值交给Pydantic拒绝；模型/实例/字典正常调用继续支持。

独立证据：reviews/evidence/BATCH-014/probes.py及probes.json；其余证据pytest.txt、scope-before-review.json、submission-hashes.json、final-integrity.json。

下一步BATCH-015扩大为六包：A关闭上述问题；B–F完成本地任务提交、实际CSV核对、结果持久化、取消/中断恢复、统一无视觉调用接口。允许在A边界内修复，其他独立包连续推进；批末统一复核。不存在“本批先自写accepted才继续”的要求。
