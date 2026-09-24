# BATCH-009-R1 · 工作台编辑保真与输入切换一致性

## 1. 当前结论与目标

唯一目录 C:\Users\xiayu\Documents\Codex\companion-agent；单一Codex GPT-6 Sol执行对话。先读AGENTS.md、本派工、reviews/BATCH-009.md、reports/M00.4.02.checkpoint.md。架构docs/execution/common/ARCHITECTURE.md、业务docs/product/first-flow.md及BATCH-009的本地工作台边界仍适用。

上一轮独立复跑25项Vitest（A14/B6/C5）、新旧12组DOM、相关TS/vue-tsc和两套build全部通过；76项manifest hash/bytes一致，写集14修改/49新增/0缺失/0越界。A两项修复独立通过，C离线准备通过；二者真实试验均not_run。B另有两项独立复现的问题，当前M00.4.02 changes_requested，累计accepted仍12。

本批一个完整修订批次，按下面四阶段连续完成；阶段完成留checkpoint后继续，批末统一复核。A/C和旧成果冻结，不重做已通过的工作。用户未配置DeepSeek key，本批零模型/账号请求，不等密钥，不启动官方Agent/子智能体/额外会话。

## 2. R1：多行单元格编辑保真

复现：CSV item为带引号的“first\nsecond”，表格原值正确；打开修改后单行input的DOM值变成firstsecond；在末尾添加X保存得到firstsecondX，原换行丢失。独立证据reviews/evidence/BATCH-009/independent-ui-probes.txt。

使用成熟原生多行控件textarea显示/编辑任意CSV文本单元格，保持原始换行、空白和字符串值。不在v-model/保存/取消/来源/导出之间做无授权trim或格式化。不改变原CSV快照，修改链oldValue必须精确来自当前单元格。

键盘约定：普通Enter插入换行；保存按钮明确可用；可选Ctrl+Enter/Meta+Enter保存，但要有提示且event.isComposing时不能保存。Esc取消；focus trap要包括textarea，关闭后恢复触发控件。现有单价0/空值行为不变。CRLF/LF是原始内容的一部分；浏览器textarea可能规范化换行，须明确定义并实现编辑保真：打开后未修改直接保存不得凭控件规范化产生修改；实际编辑时不得默默移除逻辑换行，若主动采用统一LF则在本地编辑语义中说明，原始CSV始终保持字节内容与hash。

原生多行控件不要用CSS伪装成一行；长内容可滚动，仍有16KiB单元格上限。不引入第三方编辑器。对输入法组合期间Enter、Esc的行为避免误提交。

## 3. R2：全局输入意图、异步结果与页面生命周期

复现：旧CSV文件arrayBuffer未完成时，用户选择一个较新的JSON草稿；JSON已成功安装，旧CSV随后完成却覆盖CSV输入框和文件名。表格仍是新草稿、输入框变成旧文件，违背“最后一次输入选择生效”。目前csvReadSeq与draftReadSeq彼此隔离，不能抵挡跨入口竞态。

先明确简短状态规则，然后实现最小修复。可在组件内共享递增generation，也可抽出一个小型纯input-session.ts；不需要状态库或通用任务调度框架。

将所有会改变/替换输入的意图纳入同一过期判定：CSV文件选择、CSV/需求文本手动修改、JSON草稿选择、新草稿安装/确认替换，以及离开工作台的deactivated。异步完成、失败、finally和propose都必须核对当前意图；过期结果不得更新输入框、表格、文件名、notice/error、读取中状态或弹层。物理读取不能取消时可忽略结果。

JSON导入是一次“全部替换”意图，较早CSV读取完成不能污染它；用户在较早导入仍运行时手动编辑较新文本，旧导入也不能覆盖。较新选择失败仍保留已有核对草稿，不能让较早结果复活。模式切换保留已有草稿和未提交文字，但关闭相关弹层、使未决读取过期并清理读取中标记；返回工作台不出现迟到的替换弹层/数据。

替换确认必须绑定候选草稿和提出该候选时的意图；被更新的输入意图作废后，旧“确认更换”不能再安装。用户取消要保留现有草稿、修改记录和当前输入编辑。提前捕获文件选择触发元素，不在await以后才读取已经失效的event.currentTarget；可见且仍连接的触发控件才恢复焦点。

按当前设计：读取CSV只更新待核对输入，明确点击“核对输入”才安装草稿；JSON导入校验通过则按有无已保存修改进入替换确认。保留这个交互，不让竞态修复变成自动核对/自动丢弃修改。不将旧异步错误显示为新操作失败。

## 4. 针对性独立行为回归

新增测试放reports/evidence/M00.4.02/BATCH-009-R1/，旧测试/fixtures只读。复用已有Vitest/jsdom、Vite产物，不安装依赖/浏览器。

多行组：含引号换行和空白的cell在编辑器里可见；取消不改变、未改直接保存无新修改；在多行末尾添字后逻辑换行保留；Enter只换行、显式保存生效；有组合输入时不误提交；Esc恢复焦点；导出/重开仍保留原CSV和改后值。测试必须操作真实组件DOM，不能只测draft.ts绕过编辑器。

竞态组使用可手工resolve的Promise，不用长sleep：CSV→JSON乱序、JSON→CSV乱序、较早导入→较晚手动输入、较新读取失败、切换到固定演示再返回、带修改的替换确认失效/取消。断言输入框、文件名、核对草稿、修改记录、提示与busy状态彼此一致。基于用户可见结果，不只断言计数器内部值。

回归原工作台6项逻辑+新旧12组DOM，小样production build和完整vue-tsc。无需重跑A/C测试或整个根服务测试：它们文件被范围检查保护。本批如修改影响根入口的文件属越界，应停下记录而非擅自扩权。

## 5. 本批验收

- B9R1-A01：多行/空白可编辑并保真，0/空值与原CSV来源不回归。
- B9R1-A02：跨CSV、JSON、手工输入只有当前意图可生效，错误/状态不串线。
- B9R1-A03：失效替换和离开页面不产生迟到安装；焦点和读取中状态可恢复。
- B9R1-A04：旧功能回归、构建和SFC类型检查通过，原修改链/导入验证继续有效。
- B9R1-A05：精确写集、报告与manifest一致，无模型/账号/凭据/浏览器绕过操作。

视觉截图仍没有可独立审阅的产物。该缺口继续unresolved，不要求重试被拒绝的接收页、页面或更换工具/URL/协议绕过；DOM不冒充视觉。不要修改原视觉验收规则来推进accepted。

## 6. 精确写集

可修改：
- tests/spikes/input-workbench/InputWorkbench.vue
- tests/spikes/input-workbench/workbench.css
- docs/evidence/ui-preview.md
- reports/M00.4.02.json
- reports/M00.4.02.checkpoint.md
- reports/evidence/M00.4.02/artifact-manifest.json

可选新增：tests/spikes/input-workbench/input-session.ts。
本批新增测试/fixture/脚本/日志只在reports/evidence/M00.4.02/BATCH-009-R1/。
批级只写reports/BATCH-009-R1.md。

其他全部只读：A/C全部文件、旧B源模块（parse-csv/model/draft/draft-io/SourceDialog）、UI外壳/演示模型、所有package/lock/config、根底座、旧测试/证据/manifest生成器、reviews、历史派工/基线、156卡/hash/helper、holdout、先前临时目录。不递归清理；先前拒绝的删除不重试。不要为了范围通过删或移动其他文件。

## 7. 收尾与停止

本批基线docs/handoff/BATCH-009-R1-BASELINE.json；权威只读范围检查docs/handoff/check_batch009_r1_scope.py。
报告M00.4.02保持原spec hash；status=submitted；batch_id=BATCH-009-R1；dispatch_ref=docs/handoff/BATCH-009-R1.md；base_ref使用本批snapshot_id。本批额外源路径列dispatch_changed_files，原changed_files遵守原卡白名单；批级文件单列。本轮实际变化另列changed_files_this_round，避免把原开发历史混成新改动。
复算manifest files数组path/sha256/bytes，纳入实际源码、旧必要测试和新回归；报告/日志/manifest自身/依赖不纳入。旧提交已由架构师归档，原A/C manifest/report不修改。result_ref绑定新manifest。
顺序：测试日志→manifest/report/checkpoint/批摘要→范围检查落盘→含日志自身再复跑→hash复核→taskctl validate/next --repo .。原taskctl next停M00.3.01、accepted12是正常的。
四阶段可连续完成，不在小步之间等确认；全部完成可做工作后submitted停止，等待独立复核。
