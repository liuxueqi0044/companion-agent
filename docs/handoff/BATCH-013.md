# BATCH-013 · 完整离线界面创作工具链（扩大批次）

## 1. 一次完成五包，批末统一验收

唯一工作区 `C:\Users\xiayu\Documents\Codex\companion-agent`。先读AGENTS.md、reviews/BATCH-012.md、ADR-004-authoring-kit.md，再读本派工；按需读ADR-002/003、core/package/store、host/bridge/mount及BATCH-012候选。不要加载全部历史，不重跑旧派工。

用户明确要求本轮工作量更大。本批由5个连续工作包、约15个有界子任务组成；A→B→C→D→E串行完成，包间更新checkpoint后自行继续，批末统一submitted，不每做一个小函数就停。不按工作时长凑功能；单个阻塞两次同因失败后记录，继续独立部分，不无限重试。

整体验收目标：创建作者源码→校验并准确定位错误→基于指定版本改代码→确定性构建SDK+页面→生成来源清楚的不可变版本/回执→导出给未来Agent的修复材料→回退作者版本；可信手写fixture另外验证SDK与现有host接线。不是再次只交几份说明，也不是完整生产Agent。

**本轮模型/HTTP调用0、真实凭据读取0。** 原两次额度已耗尽；BATCH-011/012账本、锁、候选、证据全部只读。不开子智能体、额外对话或官方Agent，不用当前OpenAI账号。初始产品UI由交接方架构师负责；用户要求正式设计前先通知并等待调整推理档位。本轮不做首页视觉、配色、角色、主题或模板选择器，只做工具链和朴素测试fixture。

## 2. A包：公共界面客户端（A1–A3）

职责目录 `tests/spikes/personal-space/authoring/client/`。提供一个可信、可独立打包为经典脚本的SDK，以及类型说明/测试；例如client-runtime.js、client.d.ts、client.test.mjs。模型/作者使用 `window.PersonalSpace`，不逐页手写MessagePort协议。API命名可按下列职责做小幅实现选择，在同一份实际使用说明中冻结，不扩展公共产品契约。

**A1连接与读取：** connect/whenReady、snapshot、subscribe、dispose。监听init必须验证event.source===window.parent、恰一个port、全部binding字段类型/长度、base_revision严格保留null。初始化前无关message不能吃掉正确初始化；已绑定后重复init不能接管。准确发送五字段包络，绑定request_id仍为连接ID。先ready，再等合法host_state_changed或read回执确认可用；不能发送ready就当active，也不依赖固定延时。所有入站数据校验binding及demo投影，仅接受draft/tasks/active_revision的正确类型和限额；返回独立副本，不让作者通过引用修改SDK权威缓存。连接/关闭/不可用状态明确，不假装宿主存在。

**A2保存与失败：** saveDraft只在可用连接和有效输入时发送，收到该连接实际ok/saved回执才resolve成功。最多一个未确认写入，第二个调用明确busy，不暗中乱序或无界排队；request_id不得自造为每次不同而破坏demo/1。超时/关闭/错误后不能显示已保存；一旦某写ACK未知，冻结该连接后续写入，避免迟到旧ACK误认新写，显式重连并重新读取后才可恢复。不得自动重发。尊重8192字节完整消息上限与每60秒30条，UTF-8限额包括包络，不仅draft；超限/限流本地返回准确错误。格式错误或未知回执不作为成功。SDK不授予权限，不修改任务完成状态。

**A3回归：** 假MessagePort + 实际BoundBridge/StableHost验证等待active、nullable base、消息方向/字段、空grant、撤权、同revision旧连接、迟到ACK、双写busy、超时、关闭、限额和状态副本。浏览器模型可用jsdom，但只执行仓库可信SDK/手写fixture。不得执行任何BATCH-012生成源码。避免复制假协议测试自洽，必须有与实际host模块对接的测试。

## 3. B包：解析器驱动的作者校验与确定性构建（B1–B3）

职责目录 `authoring/validation/`、`authoring/build/`，复用已装parse5 8.0.1、TypeScript 6.0.3、PostCSS 8.5.28以及现有core；不安装、不改依赖、不自造解析器。

**B1作者格式校验：** 输入只允许严格UTF-8三文件内容和明确的私有authoring-kit/1版本，单文件≤32KiB、总≤64KiB，并在构建有效文件后再次应用原core限额。HTML是body片段：使用parse5及来源位置拒绝显式doctype/html/head/body、script（含外链）、外部stylesheet与不支持的外部资源引用；不得因parseFragment自动丢弃文档标签而误通过。允许普通DOM与内联SVG自由布局，不规定组件清单。CSS用PostCSS解析错误位置；JS用TS的JS解析模式检查语法，只支持经典脚本，import/export按当前构建能力明确拒绝，不执行JS/加载模块。模型源码是数据，不进入eval/vm/JSDOM runScripts/Node。

**B2结构化诊断：** 固定diagnostic字段code/severity/file/start/end/message/rule_version，位置映射到作者原始文件，不能将SDK前缀行号报告给用户。限诊断数与消息字节，无文件全文/隐私泄漏。增加迁移提示：原始postMessage桥、init.binding、type代替method等已知旧写法给出定位和SDK用法建议；此类语法模式检测不宣称能证明全部语义正确。真实BATCH-012候选必须被HTML格式门槛拒绝；其JS不兼容可由明确诊断或只读语义待审项体现，不能输出兼容通过。parse通过只标source_validation=passed，execution/native/visual均not_run，不输出safe=true。

**B3构建与回执：** 保留作者原始三文件，可信构建器生成有效三文件：JS为固定SDK字节+确定分隔符+作者view.js，再调用原core stage/seal；禁止作者覆盖SDK和工具版本。所有源码/SDK都只作为字节装配，不能执行。回执含作者hash、sdk_hash、validator_hash、构建工具/私有契约版本、有效源码hash、artifact_hash和该次验证报告hash；明确每个hash的实际字节定义。相同输入/工具字节产物稳定，代码/SDK/规则变化使旧结果失效。严格复算实际封存内容，不能信任调用方传入hash。模型来源和其修改后代必须保留model_candidate，requested_scopes不等于授权；候选结构通过也不能装载。

## 4. C包：版本化作者工作区与窄CLI（C1–C3）

职责目录 `authoring/workspace/`。不要重做已存在core包存储；复用其固定三文件stage/read/seal、完整manifest校验和hash能力，在其旁建立少量私有workspace head/receipt索引。作者源码版本与含SDK的有效包版本用明确类别/ID分开，不把拼接view.js当作者输入返回。

**C1版本编辑：** create/read/change/history，change接受expected_head及1–3个完整文件替换，未列文件逐字节保留。只支持固定文件名，无任意路径、压缩包、目录递归导入、shell或URL。修改形成新不可变author revision，记录父版本和来源；head按expected_head比较后原子更新。两个同时提交只能一个成功，过期返回conflict不覆盖新代码。工作区独立锁/串行事务、同目录临时文件+sync+rename；进程崩溃后允许保留孤儿候选但不能让head指向不完整版本。读取head/receipt严格类型、体积/hash校验，损坏返回明确recovery_required，不默默reset成新工作区。路径逐段检查，拒绝symlink/junction/reparse/穿越；不能声称这相当于OS沙箱。

**C2回退与构建归属：** restore作者head到指定已有版本，要求当前expected_head，保留完整历史和源码；这不回退真实任务/记忆/外部动作，也不擅自切换host active UI。check/build回执绑定开始时head、source hash和SDK版本；工作区变更期间旧成功或失败不能成为当前结果。失败留诊断与上版可用build引用，不覆盖已封存成果。SDK变化后不能复用旧验证回执冒充当前通过。

**C3工具入口：** CLI提供create/read/change/check/build/history/restore/repair-packet，JSON stdin请求→JSON stdout回执，限输入/输出字节、固定错误类别及exit code；import默认不执行main，未知命令拒绝。固定运行根 `reports/evidence/BATCH-013/workspaces/`，只接受安全workspace/revision ID，不提供任意文件系统root命令参数。内部可依赖注入测试临时根，生产CLI不可用env重定向到其他目录。无模型/网络/凭据访问。一次命令一个可观察动作，不引入通用DAG/作业平台。

## 5. D包：诊断反馈与修复材料（D1–D3）

职责目录 `authoring/feedback/`，使用现有源码与验证/构建回执。

**D1修复材料：** repair-packet固定只包含用户明确选择的当前作者三文件、base/head/hash、有限诊断、准确SDK API与小型代码用法，不附整个repo/路径/账本/聊天/草稿状态/凭据。总体有界（例如≤128KiB），只写本地JSON文件，不调用模型。代码本身可能含私人内容，不能称“已脱敏”或自动公开；本批全部用虚构fixture。包输出带状态“供后续Agent修改的材料”，不假称已自动修好。

**D2严格应用修订：** 从修复材料读expected_head/source hash，再使用C的change提交新版本；未知字段/文件名、base/hash错、超限/非法UTF-8等拒绝，不能模糊应用过期修改。返回新source hash和下一步check/build状态；修改前的验证结果不得继承。协议文档和CLI帮助明确如何读取当前源码→改代码→检查错误→重新构建→回退，供较便宜模型直接使用。

**D3真实失败样本闭环：** 只读导入BATCH-012 model-v1作为负例，在新的工作区生成诊断/修复材料；可由本批开发者手工修正其HTML与SDK用法并提交新revision，保留原hash、派生来源、修改原因。旧候选字节绝不变；修订后代仍model_candidate，不因人工改过就升级为handwritten_fixture。最多完成静态校验/构建/封存，禁止执行/预览/装载，报告为developer_revision，不能冒充第二次模型生成或模型自主修复。

## 6. E包：完整链路集成和交付（E1–E3）

**E1可信fixture链路：** 另建少量仓库原创的朴素fixture（例如文本清单与简单折叠控件），只证明任意作者DOM/CSS/JS与SDK组合可工作，不设计产品首页。实际跑create→change→check→build→基于hash在测试宿主中注册→实际MountCoordinator/BoundBridge→读取/保存成功或失败→UI版本切换/回退，断言源码版本、build指针、frame与稳定draft一致。仅这些明确测试来源的fixture在jsdom执行；模型源/后代始终被信任门槛拒绝。不得在生产main.ts增加任意包注册或model→handwritten强转通道。

**E2不良路径集成：** 候选build失败保留上一构建；head已改变后的旧check/build返回；并发修改冲突；新SDK版本使旧回执失效；过期修复材料；存储写失败/损坏恢复；重开工作区；同revision旧桥、超时ACK及撤权不假称保存。用可控Promise/transport/file adapter注入故障，不靠sleep碰时序。对每条关键断言说明实际走了哪个入口；不得只写纯函数正例。

**E3交付开发工具与接口说明：** `authoring/README.md`写实际可运行的命令和准确SDK例子，用户源码示例无需了解原始消息包络。`reports/evidence/BATCH-013/ui-integration.md`向架构师说明初始UI如何接入、源码与构建产物怎么区分、目前未支持什么；只谈接口不代替视觉设计。最终批摘要列五包完成情况、真实闭环证据与仍需原生隔离/模型/视觉验证的边界。

## 7. 写权限、复用与控制工作量

可新增/修改仅：
- `tests/spikes/personal-space/authoring/`：client/validation/build/workspace/feedback、CLI、局部配置、README、可信fixtures与测试。每包通常3–6个职责清晰源码文件，测试另列；不是强制文件数，不做巨型万能模块。
- `reports/evidence/BATCH-013/`：测试、虚构临时数据、工作区和模型后代的静态候选、诊断、修复材料、日志、manifest。
- `reports/BATCH-013.json`、`reports/BATCH-013.md`、`reports/BATCH-013.checkpoint.md`。

其他全部只读：既有core/host/deepseek、BATCH-012源码候选/ledger及所有旧证据、reviews、根依赖/lock、apps/services/packages/公共契约/156卡/helper、AGENTS/架构/派工/检查器。不得安装依赖，不得读取任何真实凭据或发出HTTP，不得绕过此前浏览器/截图/递归删除拒绝。无Git提交/推送/部署/分享。holdout不读内容。

可以只读导入现有模块/已装解析器；适配层放新authoring目录，不为了代码便利改已accepted实现。SDK只封装现有demo/1，若协议确需突破（例如并发写入ID、可取消服务动作），记录未来契约变更，不本批暗改。生产原生隔离、真实记忆/业务服务、API额度、社区、TTS均另批。

本轮预算以完成上述链路为目标，允许连续较长时间开发；每包结束或约60分钟更新checkpoint，包含已完成子任务/剩余项/精确下一步。上下文压缩后从它恢复，不返工旧证据、不自动开新会话。两次同因修复失败或需要越界时停受阻路径并写明，继续独立包，不把全部状态清成“完成”。

## 8. 验收与收尾

B13-A01公共SDK与实际桥互通/确认/错误；B13-B01解析诊断与有效bundle确定性；B13-C01工作区CAS/历史/恢复与回执失效；B13-D01可复用修复材料与真实失败样本派生来源；B13-E01可信fixture端到端及模型包永不执行；B13-E02准确接入说明、写集/历史hash。

定向运行本批测试、全部新TS/SFC类型检查（如有）与局部构建，核心stage/seal所依赖原5项回归和host原16项回归各一次。既有工作台/根桌面/DeepSeek真实通道没改，不重复所有历史构建或API试验。断言必须有价值，不用大量镜像测试凑数量。可用现有Vitest/Node/jsdom，不要求浏览器截图，DOM仍不是原生安全/视觉证明。

统一一个report/manifest/checkpoint+批摘要，五包独立结果列在同一report，无需15套报告。status=submitted、batch_id=BATCH-013、dispatch_ref本文件、dispatch_sha256、base_ref新snapshot_id、result_ref绑定manifest、changed_files_this_round、验收证据/argv/exit/失败和未知项。manifest含源码/配置/测试/必要fixture/接口说明；模型派生候选单列来源并绑定原model-v1 hash。不要收录日志、报告自身、秘密、tmp、依赖或dist缓存。

顺序：必要回归→报告与manifest/checkpoint/摘要→只读`docs/handoff/check_batch013_scope.py`落盘复跑含日志自身→复算成果和BATCH-011/012原账本及model-v1未变→taskctl validate/next --repo .。基线docs/handoff/BATCH-013-BASELINE.json。任何真实模型/原生隔离/产品视觉项继续not_run，开发者不得自写accepted，原accepted12不变。五包可做部分完成后统一提交并停，等待独立复核。
