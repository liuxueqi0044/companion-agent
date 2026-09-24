# BATCH-007 · 可替换的 Vue UI 小样（M00.4.02）

## 1. 接手与规模

唯一产品目录 C:\Users\xiayu\Documents\Codex\companion-agent。执行者：单一 Codex GPT-6 Sol 对话。先读 AGENTS.md、本派工、reviews/BATCH-006.md、docs/evidence/airi-extraction.md、原卡 docs/execution/tasks/M00.4.02.md。
架构 docs/execution/common/ARCHITECTURE.md、docs/execution/modules/M00.md；契约 C01–C04；业务 docs/product/first-flow.md。原型视觉输入见下方固定目录。
当前 accepted=12；M00.4.01/M00.0.05 已通过，M00.4.02 可开工。taskctl next 仍可能优先显示未完成的 M00.3.01，不阻断本卡独立前置。M00.3.01 及其所有代码/证据本轮只读。
本批一个可见目标、五个连续步骤，按约 2–3 小时工作量组织；每45分钟/步骤完成写检查点后继续，批末统一交接。无需凑时长，不扩大为七页面完整产品或 Electron 原生集成。

## 2. 交付目标与技术边界

做一个真正可以构建和打开、可替换且不影响现有桌面底座的 Vue 3 + TypeScript 小样：一张桌面工作台，呈现伙伴/任务列表/成果核对/来源与待确认项，能切换明确标记的演示状态。视觉温暖、克制、有陪伴感，复用已有原创视觉，不重新设计另一品牌。
M00.4.01 结论为零 AIRI 文件进入产品；本批用现有 Vue 与原创 CSS/几何图形，不下载 AIRI 素材、不引入它的后端、会话、记忆、TTS 或模型。
现有 apps/desktop 目前是 renderer 构建骨架，没有 Electron main/preload。该事实必须保留：本卡验证 renderer 小样的构建与显示，不自称已经实现真实 Electron 桌面集成。
入口与样本独立放 tests/spikes/，不修改 apps/desktop 和其 import 图，不新建公共契约或改服务端。保持原底座构建可运行。

## 3. 五步开发

### 1）视觉复用与隔离构建

先只读以下原型的 README.md、HANDOFF.md、src/tokens.css、src/components.js 中的原创 SVG 与必要样式：
C:\Users\xiayu\Documents\Codex\2026-09-23\html-svg-2d-2\outputs\companion-ui
将用到的颜色/间距/原创 SVG 移植成预编译 Vue SFC，保留来源记录。暖白 #f8f7f3、深绿灰 #34392f、陶土色 #a34f35；系统中文字体、克制留白。无需照搬原7页应用、global Vue/vendor、运行时模板编译或 localStorage 记忆。
本轮主文件 ui-preview.vue / ui-preview.ts / ui-preview.html；允许额外独立 vite.config.ts、ui-preview.css 与纯演示 ui-preview-model.ts 以分离布局、样式、状态。编译器用成熟官方插件，不自写 SFC 转译器。
已有工具：固定 Node .local-tools/node-v24.21.0-win-x64/node.exe 和同目录 node_modules/npm/bin/npm-cli.js。Vue3.5.43、Vite8.3.0、TS6.0.3、Vitest5.0.1 是已核版本；优先复用已装工具。
若 SFC 必需 @vitejs/plugin-vue，授权在本卡独立 tests/spikes/package.json/package-lock.json 内新增：先读取官方 registry 元数据/仓库许可，选与固定 Vite/Vue/Node peer/engine 相容的准确版本并记录 license/version/integrity/URL，再安装。不得用范围版本或 latest 作为最终锁定值；如无相容版须记录阻塞，不降级根工具链。
DOM测试若需要可复用已验证 jsdom30.1.1；同样限本卡局部依赖并留来源，不新加完整UI库/Electron/浏览器/其他测试框架。根 package.json/package-lock.json、selected-versions、ADR 与全局工具均只读。
局部安装显式指定 tests/spikes 且关闭向根 workspace 写入；安装前后核对根依赖 hash。允许必要官方工具在局部 node_modules 内的安装步骤，不运行来源不明脚本、不改系统配置。所有新依赖选择写 reports/evidence/M00.4.02/toolchain-selection.json，供独立复核。
提供能复现的 dev/build/test 命令。Vite仅绑定127.0.0.1；输出固定 tests/spikes/dist/，不覆盖原桌面 dist。不依赖 CDN、远程字体、运行时网络资源或 unsafe-eval。开发热更新和生产构建的连接策略分开，不能把开发便利写成正式安全策略已完成。

### 2）主布局与可替换组件

只做一张工作台：轻量导航/最近任务列表、当前任务详情、成果/来源面板，伙伴图形占次要位置。至少有可访问的状态提示、来源展开、待确认卡片和示例切换控件。
组件只接受展示数据并发出本地 UI 意图；数据入口是明确的 DemoAdapter/纯 fixture，能替换为未来真实数据，不直接耦合生产 API、进程或云服务。不要建立第二套会话/记忆，除当前页面演示状态不做持久化。
保持代码职责清楚：ui-preview-model.ts 管小样数据/状态映射，ui-preview.vue 管显示/交互，CSS 管视觉，ts 仅装配。不要引入路由/全局状态框架。

### 3）成果与来源的可操作演示

使用固定演示询价数据，不读取 holdout 或真实客户资料。参照已有正常/缺失字段样本：明细、币种、部分小计、待确认字段、来源类型（输入/用户确认/确定性计算/待确认）。每个关键数值能展开来源。
未知单价/费用显示“待确认/未知”，不填0；已知0单独正确显示；混合币种不合为单一总额。展示已有确定性金额/整数分计算，避免二进制小数导致显示错误。
至少能：选择一个示例任务、打开来源、对一个演示字段补充/取消修改、切换查看原值与新值、重置演示。保存/确认只改变本地示例，不能宣称真实任务/技能已验证或已发布。
自定义输入不生成伪AI结果；本轮可不开放任意CSV/文本上传。若界面有入口，清楚说明未接执行器，不能自动套用示例假装处理。

### 4）状态、响应式与键盘体验

提供显式“演示状态”控件：待确认、运行中、等待退出确认（cancelling）、已确认退出（cancelled fixture）、结果待核对/中断，以及附演示验证依据的完成样例。取消按钮只进入等待退出，不能凭点击立刻显示取消成功；未知结果不自动完成。所有数据始终可辨认为演示。
费用未知保持 null。断连提示使用状态文字而非假进度百分比；不用模拟流冒充真实后台工作。实现有限的 loading/empty/error 样例，避免空白死页。
桌面1440×900、窄屏390×844和320px宽布局可用；窄屏可折叠辅助面板。按钮有文字或可访问名称、键盘焦点可见；弹层能Esc关闭、焦点返回触发控件；不以颜色作为唯一状态提示；尊重 reduced-motion。
本批不做真实通知、主动聊天、TTS、OAuth、托盘、文件系统访问或 Electron IPC。

### 5）实际验证、可拆除性与证据

运行小样生产 build、针对性 TS/DOM交互检查，至少验证：未知/0金额区分、来源展开、补充/取消/重置、取消请求与确认退出分开、未知不完成、弹层键盘关闭及焦点恢复。测试验证用户行为，不复述CSS和实现细节。
根桌面 build/typecheck 用原命令验证无回归；根源码/锁hash必须未变。A01 可通过独立入口、无底座反向依赖和构建证据证明；不为证明可移除而递归删除任何目录。
使用当前允许的可视工具检查真实页面，保存桌面和窄屏截图与截图条件，修正真实溢出。原 outputs/companion-ui 曾被浏览器安全策略拒绝，不能换URL/协议/浏览器或工具绕过对同一页面的拒绝；本卡新构建小样也须遵守工具返回的访问边界。若真实视觉访问被拒绝，只记录阻塞与已完成的构建/DOM证据，不伪造截图或宣称已完成视觉验收，不因此丢弃其余已授权工作。
构建成功不等于视觉/原生桌面实测通过。清楚记录 renderer验证、截图、Electron未实现及真实后台未接入各自状态。

## 4. 精确写集

原卡允许：tests/spikes/ui-preview.vue、ui-preview.html、ui-preview.ts、package.json、package-lock.json；docs/evidence/ui-preview.md；reports/M00.4.02.json、同名checkpoint、reports/evidence/M00.4.02/。
本派工额外授权：tests/spikes/vite.config.ts、tests/spikes/ui-preview.css、tests/spikes/ui-preview-model.ts、tests/spikes/ui-preview-env.d.ts；这些补充文件记 dispatch_changed_files。临时声明只解决实际 Vue 模块类型导入，不降低项目 TS 严格检查。
局部生成物：tests/spikes/node_modules/、tests/spikes/dist/（不提交进成果 manifest）；批级 reports/BATCH-007.md。
tests/spikes/内任何 Hermes spike 均只读，禁止因设置Vite根目录而清空该目录或重写它们。本批不改任何已有 accepted 文件、M00.3.01/旧报告/日志/tmp、reviews/、派工/基线、架构/契约/任务/helper、根依赖/系统配置。
先前自动审批拒绝清理的目录继续保留；禁止换命令/脚本重试该删除。通常无需清理旧目录，新的本卡构建只使用自己的输出。

## 5. 收尾与停止

使用 docs/handoff/BATCH-007-BASELINE.json 和只读检查：
`.local-tools/python-3.13.15/python.exe docs/handoff/check_batch007_scope.py`
每45分钟/每步完写checkpoint后继续；同因两次失败或需扩权时记录最小阻塞。可完成的独立步骤继续，批末统一报告，不逐小步等确认。
report status=submitted，task_id=M00.4.02、原spec hash不变、batch_id=BATCH-007、dispatch_ref=docs/handoff/BATCH-007.md、base_ref=本批snapshot_id。新增本批授权文件单列dispatch_changed_files，原changed_files保留合法原卡范围。
逐个 A01/A02/A03 写真实证据；视觉检查缺失及影响验收的真实阻塞保留 unresolved。明确排除的Electron/后台/模型能力放 nonblocking_limitations，不把排除范围写成当前卡已实现，也不混成阻塞项。
manifest绑定实际手写成果、必要测试/新增工具选型、选定截图，包含准确hash/bytes，不包含报告、日志、node_modules/dist或manifest自身；result_ref=manifest-sha256:<实际hash>。原始命令逐项实际 argv、exit_code、log_path，不能用“读取官方信息”等描述伪装可重放命令。
最终顺序：检查/截图/日志→manifest/report/checkpoint/批摘要→范围日志落盘后含自身复跑→hash复算→taskctl validate/next --repo .。未独立复核前accepted仍12，next仍可能停M00.3.01，这是正常状态，不能改helper/review推进。
完工提交 reports/BATCH-007.md 并停止，不开展M01整套页面或其他批外任务。不发起模型请求、额外会话、子智能体，不部署/推送/发消息。
