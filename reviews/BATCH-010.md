# BATCH-010 独立复核

结论：A/B/C 本地功能准备通过，未发现阻断性产品缺陷。原 M00.4.02 仍 not_run（视觉 A02 未完成），累计 accepted=12。报告 submitted 保留，不由验收方改成开发者自验收。

已阅读快照、候选验证、来源/导出、Vue面板与父组件集成，以及新增测试。固定输入覆盖完整草稿及修改链；候选拒绝未知字段、越界引用、行重复遗漏和不一致的单元格；来源从可信快照生成；过期输入和候选被丢弃，文本转义输出，人工确认不冒充任务完成。

独立验证：production build、完整SFC类型检查、测试严格类型检查、16项Vitest、新功能16组DOM、旧工作台12组DOM和旧竞态9组通过。manifest45项SHA-256/字节数与result_ref一致。范围检查前后相同：modified5 / added43 / missing0 / outside=[]；holdout只核哈希未变，无额外模型或账号请求。

## B10-T1：旧多行测试等待不稳定（后续修订，不阻断新功能）

原test_multiline.mjs在导入JSON后只等三个setImmediate就断言历史恢复。独立串行运行仍在第61行看到0次修改，而应为1次；原失败完整保留在check-10.txt。因此开发报告中“并行首次失败、单跑通过”不能解释为并行才有的问题。

复核者建立只存在于独立证据目录的副本：原四组产品断言不变，在异步导出/导入后等待Vue渲染及busy结束（3秒超时）。四组均通过，产品代码和原测试未改。最初探针未先等待Vue更新，仍提前读取旧disabled值，失败也保留为multiline-completion-probe-initial.txt；修正等待顺序后见multiline-completion-probe.txt。下次测试维护应采用完成条件等待，不靠反复运行碰绿。

## 证据和后续

reviews/evidence/BATCH-010/保存独立命令日志与探针；原提交及45项产物归档reviews/history/BATCH-010/submitted/。本次架构师review写入发生在权威范围检查之后；后续批次必须新建基线，不能把旧BATCH-010检查器当成新批次写集。

本轮只发布独立复核与项目进度判断，不新增开发派工。建议下一里程碑转为一次真实模型处理与UI结果回传；仍保持当前OpenAI账号零额外调用，DeepSeek配置和单次试验另按明确授权推进。正式Agent工作流、技能复用、部署均未完成。
