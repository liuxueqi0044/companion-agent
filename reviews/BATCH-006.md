# BATCH-006 独立复核

M00.4.01 accepted；M00.3.01 本段离线观测准备通过，整卡 live 仍 not_run。累计 accepted=12，M00.4.02 的两个前置 M00.4.01/M00.0.05 已具备。

- 独立复跑离线观测器 13 项、原预检 23 项测试全部通过。
- 另行执行正常、缺失 result、取消和断连/重读四项场景：未知结果未标产品完成；取消请求与 wait 退出分别落档；断连/重读不重跑，单次 marker 保持一次。实际执行均为固定本地 offline fixture，不是 Hermes。
- 提交时写集 modified=4 / added=205 / missing=0 / outside=[]；两卡 manifest、各文件 hash/bytes、holdout 核对通过。审查过程中新增独立回放记录另留 REVIEW-B6 目录，不混入原提交成果。
- AIRI 候选 callout.vue 无直接 import，主题表现依赖上游生成样式；采用现有 Vue/原创 CSS 的放弃决定合理。21 份固定来源与已有 MIT 正文核对通过。

报告元数据整理由架构师执行且留痕：先完整归档原 M00.4.01 报告，把未采用路线的三个限制从 unresolved 移至 nonblocking_limitations（原文保留），将非真实 argv 的来源描述移出 commands 放到 source_acquisition_records。未改变成果、result_ref 或验收结论；新 review 绑定整理后的报告 hash。这样不会把排除范围内的未知项误当当前卡阻塞，也不伪造可重放命令。

原 preflight 用 cmd.exe mklink 创建自己拥有的 junction 测试夹具，属于本批要求复跑的既有测试，不是启动模型或 Agent。先前自动审批拒绝清理的旧临时目录全部保留，没有重试删除；目录位于本卡 tmp、无链接，不因此单独阻断验收。未来清理另行处理，本次不改变该审批边界。

后续 BATCH-007：可替换 Vue UI 小样，复用既定温暖/克制/有陪伴感的原创视觉。保留后端与实际 Agent 未接入的明确边界。
证据 reviews/evidence/BATCH-006/；原提交 reviews/history/BATCH-006/submitted/。
