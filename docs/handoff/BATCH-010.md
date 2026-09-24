# BATCH-010 · 输入快照与候选成果核对

## 1. 目标和执行方式

唯一工作区：`C:\Users\xiayu\Documents\Codex\companion-agent`。执行者为单一 Codex GPT-6 Sol 对话。先读 AGENTS.md、本派工、reviews/BATCH-009-R1.md，再读 docs/execution/common/ARCHITECTURE.md、docs/product/first-flow.md 和现有 input-workbench 源码。

BATCH-009-R1 的两处缺陷已独立关闭：31 项 manifest 一致；6 项逻辑、25 组 DOM、独立旧反例、build/vue-tsc 通过，范围 6 修改/20 新增/0 缺失/0 越界。M00.4.02 的本地实现准备通过，原视觉验收仍 not_run；累计 accepted=12。

本批连续完成 A→B→C 三个有依赖的工作包，每包更新检查点后继续，批末统一提交。预计比上轮修订更大，但不按时长凑工作。不要在包间等待批准，不提前开展后续批次；遇到越界或公共契约冲突，停止受影响部分并记录，能独立完成的本批部分继续。

这次实现一个可操作的局部链路：已有本地草稿 → 固定输入快照 → 导入对应的结构化候选 JSON → 校验 → 核对来源和待确认项 → 导出核对记录。目标是为未来真实模型返回结果建立可信边界，不声称已经实现 AI 整理或完整 S1/S2。

三个包共用 M00.4.02 的局部小样边界，不另造正式任务 ID 或修改 156 卡依赖。根项目不得引用这些 spike 类型。Hermes/Codex/DeepSeek 准备工作冻结；不运行官方 Agent、子智能体、其他对话，不调用模型/账号，不搜索或读取密钥。DeepSeek 未配置不阻塞本批。

## 2. A 包：固定输入快照

新增私有目录 `tests/spikes/input-workbench/candidate-review/`，主要文件 `snapshot.ts`、`candidate.ts`、`ReviewPanel.vue`、`review.css`。可另加 `types.ts`、`review-record.ts`，总计最多六个手写源文件；优先复用现有 draft、draft-io、model 和 Vue，不安装依赖，不复制 CSV 解析器。

在已有草稿下提供“准备核对快照”。快照只来自已核对的 InputDraft：原文、原 CSV、文件名、修改链均保留。复用 exportDraftBytes 得到独立字节副本，inputHash 定义为 `sha256:` + 这些**完整字节**的 SHA-256 小写十六进制。明确格式名 `local-review-input/1`；哈希覆盖本地修改，不能只绑定原 CSV。用 importDraftBytes 重建并验证隔离副本，再从副本计算 currentRows，避免共享可变对象。相同草稿重复准备结果稳定；名称/需求/CSV/修改链变化会改变 hash。这是本地内容绑定，不是签名、任务身份或用户授权。

快照创建有异步 hash；需在安装前确认草稿和输入意图仍有效。不得重新引入 B9-R2。草稿修改/撤销/清空/更换、输入框被手动改动或 CSV/JSON 新选择都会使当前快照和候选失效；直接清除派生面板并提示重新准备即可，不必保存历史版本。不允许将“旧核对草稿”的候选呈现为新输入的候选。原输入有待核对变化时，按钮禁用并解释应先核对输入；失败/取消替换继续按已有语义保留草稿，但派生结果可以保持失效。离开页面关闭临时状态，使未完成读取失效；返回可重新准备。

提供快照 JSON 下载便于检查，包装结构固定为 `{version:'local-review-input/1', inputHash, draft:<exportDraftBytes 解析后的对象>}`，不提供快照导入或自动发送。下载字节上限 10 MiB，底层草稿限制保持不变。导出时不重新修改内容或哈希；原草稿 JSON 导入导出格式保持原样。

A 验收：hash 可独立复算；CRLF/空白/0/空字段/修改链保真；修改后旧快照不能复活；hash 计算期间新的输入与页面失活优先；未改变的草稿可稳定复建。

## 3. B 包：严格校验不可信候选

新增纯函数解析/校验模块，不使用网络、eval、动态脚本或供应商 SDK。输入为候选 UTF-8 JSON 字节与有效快照；输出为结构化校验错误或可显示的规范化投影。错误包含字段位置和简短原因，不能把不可信候选传播成产品状态。

私有候选格式 `local-structured-candidate/1`：

```text
{
  version, inputHash,
  summary: TextClaim,
  elements: {deliverable: TextClaim, time: TextClaim,
             place: TextClaim, special: TextClaim},
  rows: [{recordIndex, item, unit, qty, unit_price, currency}],
  questions: [{text, target}]
}
TextClaim = {text: string|null, evidence: [{start, end}]}
target = {kind:'requirement', field:'summary'|'deliverable'|'time'|'place'|'special'}
       | {kind:'csv', recordIndex: positiveInteger|null,
          column:'item'|'unit'|'qty'|'unit_price'|'currency'}
```

规则：

- 严格 UTF-8、JSON、版本与每层字段白名单；必填字段不得省略，未知字段拒绝。拒绝不正确类型，不用强制转换把非法值修正。最多 8 MiB 候选 JSON；不得因文件扩展名信任内容。处理字节数前先检查文件 size，并在读取后再次检查。
- inputHash 必须精确匹配当前快照。候选自己不能指定信任级别、来源类别、费用、completed、权限或执行器身份；也不能给出可执行内容。
- TextClaim.text 非空字符串最多 2048 UTF-8 字节，或 null。null 时 evidence 必须空；非 null 时 1–8 个有效范围。start/end 为原需求字符串的 UTF-16 索引、左闭右开、整数、0≤start<end≤length，边界不能切开代理对。引用的原文从快照切片，不信任候选附带引文。引用有效只证明位置可追溯，**不证明摘要在语义上正确**；始终显示“候选内容，需人工核对”。null 只表示未提取/待确认，不保证原文没提到。
- rows 必须完整覆盖快照的每条 CSV 数据记录且恰好一次；recordIndex 从 1 起、无重复、无越界。可接受输入顺序不同，但显示按原记录顺序。名称重复的行不能合并。五个值均精确等于快照 currentRows 中对应表头的字符串；缺整列才是 null，存在但空白的单元格保持原字符串（包括空串），`'0'` 与 null 不相等。拒绝猜值、trim、数值化、价格改写、缺行、多行或按名称代替行定位。
- CSV 来源由可信快照自行解析：显示原文件名、数据记录序号、列、原值、当前值及对应修改链。存在修改时标“本地用户修改”，不是模型确认；没修改时标“原始输入”。缺列标待补充，不能制造来源。数据记录序号不是物理文本行号，多行 CSV 不得错称物理行号。
- questions 最多 100 条，每条 text 为 1–1024 UTF-8 字节；引用有效目标。csv recordIndex=null 只指缺整列；行目标须在范围内且列实际存在。需求目标只能引用上列固定字段。不按字符串拼 DOM id 或选择器定位。
- 面板必须独立保留 currentIssues 派生的问题，不允许候选 questions=[] 隐藏缺列/空值/格式问题。TextClaim=null 也派生待确认提示。候选问题与本地检查分开标来源。语义冲突仍需人工核对；不能声称引用检查自动解决了需求与 CSV 的冲突。

**本批不实现金额计算、合计、报价、规则保存或执行状态**。这些字段不在候选格式中，拒绝候选携带伪造金额。避免为了做“完整成果卡”扩展未获验收的业务契约。此格式是局部输入/来源验证试验，后续接入正式 Schema 时需映射和迁移，不能直接升为公共协议。

B 验收：正常/缺列/空串/0/重复行/多行/修改值均能核对；不同快照、改写价格、缺行/重复/越界、非法引用/代理对、伪造信任字段和超限都拒绝。异常不替换已有有效候选。测试用虚构数据；不读取 holdout 内容。

## 4. C 包：可用的候选核对面板与核对记录

在现有工作台中嵌入 ReviewPanel，InputWorkbench 只负责传入有效草稿/输入失效信号并保持原功能。包内投影和面板组件承担新增逻辑，不继续把全部业务堆进父组件。沿用温暖、克制、有陪伴感的样式、现有 CSS tokens 与按钮；不大改外壳和固定演示。

流程：准备快照 → 选择候选 JSON → 显示校验中/失败/候选已载入 → 摘要/需求要素/明细/待确认 → 展开引用原文或单元格来源 → 导出核对记录。文字说明一次到位，不让用户读协议细节才能操作。空态可展开格式说明/虚构样例，但不能自动生成一份“AI 已完成”结果。实际导入才载入候选；开发虚构 fixtures 只进 evidence，不当真实成果。

所有内容用 Vue 文本渲染，代码/HTML/链接/公式不执行、不自动跳转。来源面板支持键盘、Esc关闭和回焦；多行与空白可读；候选记录分页保持原始 recordIndex。错误展示不倾倒整个文件。窄屏以单列展开、表格容器内横向滚动，不靠大幅缩小字号。无障碍控件沿用原生标签/按钮。

用户可对每个有值的 TextClaim 标“已人工核对”或取消；仅是本地勾选，不修改文本、不替代真实授权。null 不允许标已确认，仍待确认。本批不提供“全部通过”“任务完成”按钮，也不伪装执行费用已知。CSV 显示结构一致并保留缺失/格式问题；不把自动相等校验叫作语义确认。

导出新的只读核对记录 JSON：固定版本 `local-candidate-review/1`、inputHash、原候选文件字节 SHA-256、规范化候选、五个 TextClaim 的本地确认布尔值，以及本地检查结果。不嵌入整份快照/原 CSV，原料已有单独草稿/快照导出；展示“这是核对记录，不是已完成成果或技能”。上限 12 MiB；下载需用户点击，操作开始时捕获一致状态，异步结束前验证快照/候选/确认状态未变。无导入/自动保存，不修改原草稿 JSON。

候选读取、hash、失败提示和下载状态均有过期保护：较新候选选择或原草稿/输入变化或页面失活后，旧成功/失败不能覆盖新状态。新导入失败可保留同一快照下的旧候选；换快照必须清除旧候选及人工确认。禁止把旧确认带到新候选。无需通用状态库，简单 generation/对象身份足够。

C 验收需操作实际 production bundle 的 DOM：正常导入/来源/手工核对/取消/导出，候选失败保留旧值，旧输入哈希拒绝，修改/撤销/新文件/切换页面失效，读取乱序及较新失败，危险文字仅渲染文本。既有 textarea/竞态/来源/撤销/草稿往返全部回归。DOM 不当作截图证据。

## 5. 写权限与复用

可修改现有文件仅：
- tests/spikes/input-workbench/InputWorkbench.vue
- tests/spikes/input-workbench/workbench.css
- docs/evidence/ui-preview.md
- reports/M00.4.02.json
- reports/M00.4.02.checkpoint.md
- reports/evidence/M00.4.02/artifact-manifest.json

可新增：candidate-review/ 上述最多六个手写源文件；reports/evidence/M00.4.02/BATCH-010/ 下新测试、虚构 fixtures、脚本和日志；reports/BATCH-010.md。

其他只读：原 draft/model/parse-csv/draft-io/SourceDialog、旧 DOM harness/测试/fixtures/日志，ui-preview 外壳及配置，所有依赖/lock，根服务、contracts、156 卡/hash/helper、reviews、所有旧派工与基线、A/C 整体。旧模块只导入复用。局部 tsconfig 已包含 input-workbench/**，无需改配置。新增测试可在本批目录建立适配 harness；不得篡改旧测试使其通过。已拒绝的截图通道和递归删除不重试或绕过，旧临时目录保留。

## 6. 验证、报告与停止

本批验收：B10-A01 快照绑定与保真；B10-A02 候选结构/来源/完整性拒绝；B10-A03 人工核对与记录；B10-A04 失效/竞态与原交互回归；B10-A05 精确写集及证据。

复用本地显式 Node/Python 路径。新增纯逻辑用已装 Vitest；Vue 行为用现有 jsdom 和生产构建；完整 SFC typecheck。回归现有 6 项逻辑及旧12组DOM、R1多行4组和竞态9组，不重复冻结的 A/C/根服务检查。模型/账号/网络请求数保持0。测试数量不作为完成标准，失败需查实。

只读权威范围检查 `docs/handoff/check_batch010_scope.py`；基线 `docs/handoff/BATCH-010-BASELINE.json`。不能套旧批次基线。三个包串行做，每完成一包更新同一 checkpoint，下一包继续；最终一个 report/manifest，避免制造三套重复台账。

报告 status=submitted，batch_id=BATCH-010，dispatch_ref=docs/handoff/BATCH-010.md，base_ref=本批snapshot_id，原 task_spec_sha256 不改。原 changed_files 仍按卡白名单，新增授权源码用 dispatch_changed_files，实际本批变化另列 changed_files_this_round。原视觉/真实Agent/live 验收维持 not_run，accepted 不自写。测试日志记实际 argv、退出码和证据路径；manifest 含所需源文件/测试/fixtures 的 SHA-256 与字节数，不把报告/日志/自身/依赖目录塞进去。

顺序：新旧测试 → manifest/report/checkpoint/批摘要 → 范围检查落盘并含日志自身复跑 → 哈希核对 → taskctl validate/next --repo .。旧 taskctl next 仍停 M00.3.01、accepted12 是预期，不改 helper 绕过。把包级状态、真实未解决项写进批摘要；完成本批可做工作后停止，等待独立复核。
