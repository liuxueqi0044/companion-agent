# BATCH-009 · 协议修订、本地核对工作台与DeepSeek适配

## 1. 接手和规模

唯一产品目录：C:\Users\xiayu\Documents\Codex\companion-agent。
执行者是单一 Codex GPT-6 Sol 对话。用户反馈前批约20分钟完成，本轮扩大为三个工作包，以功能交付量衡量，不凑时间。A协议修订→B本地工作台→C小型DeepSeek适配→统一验证。每完成阶段或45分钟保存checkpoint后继续，批末统一复核；不得完成第一包就停止等待。一个包遇到明确阻塞可继续另一个独立包。

先读 AGENTS.md、本派工、reviews/BATCH-008.md、docs/handoff/DECISIONS-BATCH-009.md。架构 docs/execution/common/ARCHITECTURE.md、modules/M00.md；契约 C03/C04/C06；业务 docs/product/first-flow.md。按需读取 M00.5.01、M00.4.02 原卡与各自checkpoint，不递归加载全部历史。

用户最新约束：不使用当前OpenAI账号做额外模型请求，不启动官方Agent、登录、探测账号/额度、读取其凭据、自动创建会话/子智能体。其他OpenAI/Claude测试账号也尚未指定。用户随后明确允许用自己的DeepSeek API做模型接入测试；这项例外仅适用于C包的一个有界请求，详见C包，不能用于驱动更多开发Agent。公开依赖资料可联网只读核查；A/B包产品运行时仍不联网。

当前accepted=12。M00.5.01离线准备有两处changes_requested；M00.4.02实现检查通过但视觉证据未齐。本轮不抬高accepted，不开展依赖它们整卡验收的M01/M00.6。本派工由架构负责人明确扩大仍未验收的M00.4.02小样写集，做S0输入准备和人工核对，不宣称S1–S5或真实Agent已实现。

## 2. 工作包A：修复Codex协议边界（阶段1）

依据 reviews/BATCH-008.md 和 reviews/evidence/BATCH-008/independent-probes.txt 修复，不修改既有固定版本来源/旧测试来迎合实现。

R1：account/read 的 result={}、account字段缺失或类型错误，当前被当成明确不可用。拆开account/read响应和account/updated通知的白名单解析，检查各自实际使用的字段及null语义；缺失/错误为unknown并有可读issue，只有显式合法null才能标unavailable。不要因另一消息形状中的authMode字段存在而绕过account校验；不回显敏感原文。

R2：响应处理目前不验证方向；client_to_server的result也能确认取消。已知方法还允许缺请求ID的turn/interrupt成为无issue通知。按固定版ClientRequest/ClientNotification/ServerRequest/ServerNotification和RPC类型核对方向、消息类别、关联ID：客户端请求必须有ID，initialized是客户端通知；服务端请求/通知的已知类别不得互换。响应须绑定对向pending request；本卡没实现的审批响应可返回明确unsupported/unknown，不强行当普通服务端响应。非法组合不能改变native/auth/usage/cancel正向状态。未知扩展仍unknown，不伪造成支持。

保持已验证的unknown/0、原生完成≠产品完成、取消确认≠退出、审批不自动批准和敏感字段白名单。原8测必须通过，新增针对上述反例的行为回归。仅校验窄投影用到的字段，不重建整个上游schema、不写传输层或更大的模拟器。

检查旧操作单中“stdio断开观察者后恢复同一turn”的未证实假设：明确官方server/stdio生命周期与我方观察者的区别。若当前固定证据无法证明这种恢复路径，则把它标为将来单独验证的缺口，不要求第一次单次任务试验同时完成互相冲突的成功、取消和恢复目标。本轮不执行操作单。

报告M00.5.01仍为submitted、A01–A03全部not_run；修订准备验收单列，不因修复而完成真实集成。

## 3. 工作包B：本地输入核对工作台（阶段2–6）

### 阶段2：局部工具链与私有数据结构

复用现有Vue3预编译SFC、原创CSS和组件、Vite插件、jsdom、根Vitest，保留现有演示模式和原六组DOM测试可用。入口仍tests/spikes/ui-preview.html，不为绕过任何浏览器拒绝新建镜像地址。新增“准备我的输入”模式；不接生产API、Electron主进程或Codex投影，两工作包互不依赖。

CSV解析用成熟库Papa Parse，不用split(',')或自写CSV解析器。Vue组件类型检查补用vue-tsc；官方参考 https://www.papaparse.com/docs 和 https://vuejs.org/guide/typescript/overview 。先查官方registry/仓库：准确版本、许可证、integrity、Node/TS/Vue兼容约束再安装。允许仅在tests/spikes/package.json/package-lock.json加入papaparse、必要的@types/papaparse和vue-tsc。已有Vue/Vite/TS版本保持不变，根依赖不动，无第二套UI框架或浏览器。安装显式 --prefix tests/spikes --workspaces=false，核根锁哈希。不得为绕过类型问题降strict/屏蔽项目错误。

新增tests/spikes/tsconfig.ui-preview.json，include仅原UI和新工作台相关ts/vue，避免把Python或Codex/Hermes spike混入SFC检查。Vite编译不等于类型检查。

私有类型放 input-workbench/model.ts：原始需求文本、原始CSV字符串/文件名、原始来源摘要、按记录索引定位的单元格、缺列/空值/格式问题、修改记录和草稿版本。这个结构是local-input-draft/1，不是TaskBrief、ArtifactRef或共享contracts。没有task_id、accepted/completed、active技能或认证会话。字符串原值保留；未知用null语义与空值标记表达，明确字符串0不被吞掉。

### 阶段3：真实本地输入和CSV核对

用户粘贴需求文本，并粘贴CSV或选择一个CSV文件。只读用户选中的File，不访问任意路径/目录、剪贴板后台或屏幕。不解析自然语言、不用正则假装AI抽取；需求原文供人并排核对。界面标“本地输入核对，尚未经过AI整理”。“核对输入”必须两项齐备；缺任一项给可操作提示，不进入仅文本替代链路。

限制：需求文本UTF-8最多64KiB、CSV最多2MiB/2000条数据记录/100列/每单元格16KiB；JSON草稿最多8MiB。超过限制明确拒绝，现有草稿不被破坏。文件读取使用严格UTF-8解码，可接受UTF-8 BOM；不可静默将错误编码替换成乱码。多个异步文件读取竞态时只采用最后一次选择结果。

CSV逗号分隔，成熟解析器处理引号内逗号/换行、转义引号、CRLF、BOM；关闭dynamicTyping，避免单号、金额、0与空值被自动转换。用行数组/明确列映射处理表头，不让解析器静默重命名重复表头。缺列允许继续核对并列出列级问题；重复/空表头、行宽不一致或语法错误显示结构错误，不静默丢行/丢字段。

核对列固定为item、unit、qty、unit_price、currency，不猜表头别名、不填缺值、不按地区设币种。多余列和重复数据行保留。名称含HTML/SVG、公式、URL均只作为文本，不执行、不请求资源。只提示可确定的CSV格式/缺值；不声称已发现需求文本与CSV的所有语义冲突。使用现有normal/missing公开样本时可载入其中requirement_text和csv.text，禁止读取holdout或套用expected结果。

来源标记采用文件名、数据记录索引（第1条数据为1）、原表头和原始单元格。含引号换行时记录索引不等于物理行号；不提供无法证明的物理行号、不另写扫描器猜行数。可展开查看原始CSV/原文与对应记录。解析结果摘要来自实际输入，不套用原固定演示成果。

### 阶段4：人工修改、版本和返回原值

用户能改一个选中记录的单元格、取消未保存编辑、保存本地修改，查看原值/当前值，撤销最近一次修改，清空本次修改。保存时记录记录索引、列、旧值、新值及“用户修改”来源；不覆写原始字符串。原输入和原解析快照保持可追溯，修改记录最多200条，超过时提示停止继续修改或重开新草稿。

修改quantity/price仍为字符串，不把格式错误的值变成0；空值维持待确认。币种来源只能是CSV或本地明确修改。对缺整列只展示列级待确认，本批无需实现添加列/行/自动去重。更换原输入前给清晰的丢弃修改确认或可撤销操作，取消保留原草稿；异步读取失败不能覆盖当前可用草稿。

本批不算报价总额、不猜税价、不生成自然语言摘要、不比对语义冲突。这样不会把有冲突的原始价格误包装为可交付报价。界面是S0人工输入准备，原演示成果继续明确是固定示例。

### 阶段5：草稿JSON导出与重新打开

用户明确点击导出才创建本地JSON下载；不联网、不自动localStorage、不常驻会话数据库。导出需求原文、原始CSV、原始内容SHA-256、版本标识及本地修改记录；只导出白名单结构。SHA-256用于核对完整性，不声称认证/授权/真实性。使用成熟Web Crypto，不自己造哈希。

重新打开用户选择的JSON时，先限制体积、校验版本/结构/原始内容hash、修改坐标/旧新值链，再重新解析原CSV并重放修改。任何输入摘要、成功状态、公式或成果字段即使出现在外部JSON中也不信任；未知版本、越界记录索引、错误旧值链、摘要不符都拒绝，保留当前草稿。不能用对象合并让__proto__等污染状态。整个导出是数据草稿，不是可执行技能或Agent指令。

往返后原始输入、当前单元格、修改顺序与unknown/0保持一致。没有真实文件保存证据时，只说明已测试生成/导入字节；DOM中的下载点击不能假装操作系统已保存文件。

### 阶段6：温暖易用的整合界面

沿用暖白、深绿灰、陶土色，伙伴图形次要。工作台主区提供输入、核对表格、问题和修改记录，来源可展开；每个状态只有一个主要下一步动作。术语用“原始内容、待补充、本地修改、导出草稿”，不向用户堆模型编排/JSON-RPC/CEO等词。

保留原固定演示入口，并明确区分演示与实际本地输入。所有可操作控件有标签、焦点、禁用/等待/错误状态；弹层Esc与焦点恢复；长文本换行，表格横向滚动限于容器；320/390/1440宽度布局保持可用。需求/单元格显示只用转义文本，禁止v-html。用户打开草稿不会被自动执行任何动作。

视觉证据：不得重试受阻截图接收页、原文件页面或换协议/工具绕过；本批不把截图作为开发者必须解除的阻塞。允许的页面若可正常查看可观察布局，保存获准工具原生提供的图像；一旦拒绝即停止该操作。无法形成图像仍如实保留视觉未验，不用DOM/文字替代。功能测试与视觉证据分别记录。

## 4. 工作包C：小型DeepSeek适配与可选一次真实冒烟

这是架构师授权的附加研究交付，不新增或伪造156卡中的accepted状态，也不能替代Codex/Hermes真实验收。最多两个手写文件：tests/spikes/deepseek_client.ts（窄HTTP调用与响应校验）和deepseek_smoke.ts（离线默认、显式live的单次CLI）。不用本产品UI收密钥、不接后端routes、不改官方Agent配置。

优先已有成熟HTTP能力：Node24原生fetch即可完成这一窄REST调用，不新造通用SDK，不增加根依赖。读取当前官方DeepSeek接口/JSON输出/模型价格文档后记录来源日期和必要字段依据。官方参考： https://api-docs.deepseek.com/api/create-chat-completion/ 、 https://api-docs.deepseek.com/guides/json_mode/ 、 https://api-docs.deepseek.com/quick_start/pricing/ 。本轮参考模型deepseek-flash，非思考、非流式JSON；执行时核对可用参数，变化不能静默切更贵模型。无需联网枚举账号模型。

纯函数负责请求构建和结果校验，HTTP transport可注入。离线测试用stub transport，无socket、无需key；测试正常结构、空内容、非JSON、截断、错误字段、401/429/5xx、超时、使用量缺失与0。完整HTTP响应不直接复制到报告；不持久化reasoning内容。Provider返回HTTP200/合法JSON也不等于业务验证通过，输出同时记录transport/schema/content-validation三个层次。

用户已明确回复“尚未配置”。本轮预期C包live=not_run，先交付完整离线能力，不等待密钥。约定未来配置名DEEPSEEK_API_KEY，当前不要扫描环境或文件找替代key。真实请求仅在用户之后明确说明已配置并要求运行时使用；以下上限随操作单保留。密钥只在发起请求时读取该项，不能出现在argv、日志、异常、fixture、manifest、浏览器或导出的草稿。不创建真实密钥文件、不改变用户环境；配置说明只能包含变量名和占位符，禁止回显。

允许的真实测试上限：全批最多1次模型HTTP请求、只向https://api.deepseek.com/chat/completions、redirect禁止、不重试、不并发、不调用tools/其他Agent。不读余额、不自动充值。输入只用本卡固定虚构测试材料，总请求消息UTF-8不超过2048字节；max_tokens=512、禁用thinking、总等待上限60秒。记录调用发起状态以防中断后重复运行；发出后结果未知仍算已消耗本批唯一尝试。不得在测试导入时隐式调用或缺key时回退OPENAI_API_KEY。

请求让模型把固定虚构2条记录转成约定JSON，覆盖缺单价null与明确0，字段允许列表和期望由本地确定性验证器核对；不读取holdout/用户工作台草稿或真实客户资料。请求/响应体设合理体积限制。联网前按官方当日最贵适用费率、保守输入token估计与512输出上限计算请求费用估计，若不能核实或估计超过0.05美元则不运行；这只是执行前上限估计，不能假称供应商提供硬扣费上限。费用缺官方回执仍null，估计另列。

显式--live之外默认只plan/offline；401/429/超时/失败即记录并停止live部分，A/B仍完成。真正live日志只保留模型名、endpoint主机、时间、HTTP状态、finish_reason、白名单usage、经过校验的虚构输出和独立判断，不保存认证头/供应商原始异常。单次请求结束后关闭资源，无后台服务。

交付docs/evidence/deepseek-smoke.md、reports/BATCH-009-DEEPSEEK.json和reports/evidence/BATCH-009-DEEPSEEK/（离线测试/来源/manifest/去敏证据）。sidecar清楚写offline结果和live not_run/passed/failed/unknown，不自造原任务验收ID。若key未到，不等待、不反复追问、也不把缺key视为整批失败。

## 5. 统一集成验证和验收

执行A包原8测+新增反例；B包原6组DOM回归及新工作台纯逻辑/实际DOM行为测试；小样production build、完整vue-tsc、原桌面build/typecheck。按精确测试文件运行，不安装额外浏览器或测试框架，不做无意义全仓复跑。

测试应覆盖正常输入、缺少文本/CSV、引号逗号/换行/BOM、缺列、重复表头、坏编码/超限、0与空值、恶意文本只显示、导入读取竞态、修改取消/保存/撤销、来源原值不变、草稿往返、篡改hash/修改链/越界拒绝且保留当前草稿。可以用一组数据驱动测试覆盖，不追求测试数量。不修改accepted样本；新增虚构测试材料只放本批evidence。

本批准备验收：
- B9-A01：协议反例修复且原测试不回归，原live A01–A03不变。
- B9-B01：真实输入被本地解析，缺输入/坏文件有清晰错误，无假AI结果。
- B9-B02：CSV边界、缺列/0/未知、来源位置与额外数据保留正确。
- B9-B03：修改、撤销和原值可追溯，新输入/异步失败不误覆盖当前草稿。
- B9-B04：草稿导出/导入实际字节往返并验证完整性，恶意/错误包不生效。
- B9-B05：原演示保留、SFC类型检查和必要构建/DOM行为通过；视觉证据单列。
- B9-B06：运行时无网络/凭据/执行器/持久化会话依赖，根底座未变。
- B9-C01：DeepSeek请求构建、校验、失败和脱敏离线测试通过，无隐式联网/凭据读取。
- B9-C02：具备指定配置才运行至多一次授权请求；否则live如实not_run。无当前OpenAI账号调用，没用API创建更多Agent。

## 6. 精确写集

A包允许修改：tests/spikes/codex_protocol.ts、tests/spikes/codex_connection.ts、docs/evidence/codex-connection.json、docs/evidence/codex-live-runbook.md、reports/M00.5.01.json及checkpoint、reports/evidence/M00.5.01/artifact-manifest.json。新增测试/日志/fixture等只在reports/evidence/M00.5.01/BATCH-009/，旧8测/来源索引/来源原件及BATCH-008日志只读。

B包允许修改：tests/spikes/ui-preview.vue、ui-preview.ts、ui-preview.css、ui-preview-env.d.ts、package.json、package-lock.json；docs/evidence/ui-preview.md；reports/M00.4.02.json及checkpoint；reports/evidence/M00.4.02/artifact-manifest.json。
新增配置：tests/spikes/tsconfig.ui-preview.json。
新增模块限tests/spikes/input-workbench/下这7个文件：model.ts、parse-csv.ts、draft.ts、draft-io.ts、InputWorkbench.vue、SourceDialog.vue、workbench.css。可不使用全部文件，不另增架构框架。
新增B包测试/fixture/依赖来源/日志：reports/evidence/M00.4.02/BATCH-009/。
C包新增路径仅：tests/spikes/deepseek_client.ts、tests/spikes/deepseek_smoke.ts、docs/evidence/deepseek-smoke.md、reports/BATCH-009-DEEPSEEK.json、reports/evidence/BATCH-009-DEEPSEEK/。不建配置文件存key，不改services或共享契约。
批级只写reports/BATCH-009.md。局部node_modules/dist为生成物。不要修改原ui-preview-model.ts/固定演示测试、Vite入口配置或旧manifest生成器；写新生成脚本到本批证据目录。

所有额外源/配置/CSS路径单列dispatch_changed_files，遵守原卡changed_files白名单；BATCH汇总单列batch_level_changed_files。其余根文件、apps/packages、Hermes、旧成果/来源/日志/tmp、reviews、派工/基线、任务规范/微任务JSON/helper、holdout均只读。没有Git提交/推送/部署/发消息。此前被拒绝的递归清理不重试。

## 7. 收尾

两卡status=submitted，batch_id=BATCH-009，dispatch_ref=docs/handoff/BATCH-009.md，base_ref为BATCH-009-BASELINE.json snapshot_id；原spec hash不变。M00.5.01真实A01–A03全部not_run；M00.4.02图像仍缺则unresolved保留。新增本批行为检查单列preparation_results，不改原验收ID的含义。
每卡manifest使用统一files数组（path/sha256/bytes），绑定实际源文件、必要测试/fixtures/依赖依据；不包含报告/日志/manifest自身或生成依赖。A包保留未变固定来源绑定，B包包含新模块与配置。旧manifest和原提交已由架构师归档，不改历史。
顺序：验证日志→manifest/report/checkpoint/批摘要→范围脚本docs/handoff/check_batch009_scope.py并落盘→含日志自身再复跑→hash复算→taskctl validate/next --repo .。accepted仍12，next停M00.3.01是预期。三个包均完成可做的已授权工作后submitted停止；不要把不可做的live/截图当全批停工理由，也不要自行开展下一批。

工具：.local-tools/node-v24.21.0-win-x64/node.exe；同目录node_modules/npm/bin/npm-cli.js；.local-tools/python-3.13.15/python.exe。优先精确命令，不用全局Python/Agent。该派工明确允许在同批内顺序完成三包；未改变独立复核和真实接入门槛。
