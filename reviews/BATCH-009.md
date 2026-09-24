# BATCH-009 独立复核

结论：A离线修订通过，C离线准备通过；B工作台changes_requested，需修复两个已复现的输入完整性问题。原官方Agent真实验收、DeepSeek live和UI独立视觉均未完成，累计accepted仍12。

独立验证：25项Vitest（A14/B6/C5）、新旧12组DOM、相关严格TS/完整SFC类型检查、小样和原桌面build/typecheck均通过。三份manifest共76项hash/bytes一致，局部新增依赖版本/integrity与lock一致；范围modified14/added49/missing0/outside=[]，复跑前后相同。holdout只核hash未变。没有运行官方Agent、真实模型或浏览器绕过操作。

## 两处必修复项

- B9-R1 / P2，InputWorkbench.vue:213：合法CSV包含多行文本，单行input在DOM中将换行去掉；用户添字保存就丢失原有逻辑换行。使用多行编辑控件并完整覆盖Enter/保存/取消和导出往返语义。
- B9-R2 / P2，InputWorkbench.vue:20–21及文件读取入口：csvReadSeq与draftReadSeq仅各自保护。独立探针让旧CSV晚于新JSON草稿结束，旧结果覆盖了输入框/文件名，而表格仍显示新草稿。需要共享输入意图与过期检查，覆盖跨来源读取、手工输入、替换确认和模式切换。

实际生产bundle在jsdom中的复现输出及独立脚本位于reviews/evidence/BATCH-009/independent-ui-probes.txt和ui-probes.mjs。这两个反例未被已有正常路径测试覆盖；不通过改旧测试预期掩盖。

A上轮B8-R1/R2均关闭：缺字段不再误判明确null，已知消息方向/类别有校验；仍仅离线准备通过。C没有发现本批范围内阻断性代码问题，密钥未配置、真实调用未运行；冻结其当前证据。不要为本轮B修订重复改动A/C。

下一轮BATCH-009-R1将编辑保真、统一输入切换、实际DOM回归、构建证据作为一个连续批次。不是扩展新功能或要求解除截图阻塞。原提交和源码已归档reviews/history/BATCH-009/submitted/。
