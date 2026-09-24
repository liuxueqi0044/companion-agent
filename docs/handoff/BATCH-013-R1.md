# BATCH-013-R1 · 创作链正确性与恢复闭环

## 1. 目标和执行顺序

工作区固定C:\Users\xiayu\Documents\Codex\companion-agent。先读AGENTS.md、reviews/BATCH-013.md、ADR-004-authoring-kit.md，再完整读本派工。需要上位原则时读ADR-002/003。旧BATCH-013文档用于查原要求，不重跑旧派工。CURRENT-TASK.md是历史文件，不作为本轮入口。

连续完成A→B→C→D四包，约12个有界子任务；包间checkpoint后自行继续，批末统一submitted，不逐个小函数停。目标是把已经打通的离线创作链做正确、可恢复，保持用户自由代码改界面路线。不开新产品模块，不用增加无关功能填时间。

原accepted12不变。HTTP/模型请求0、真实凭据读取0；两次旧额度已耗尽。不运行live、credential-check、余额查询、官方Agent；单一实现对话串行，不开子智能体/新会话。初始产品UI仍由交接方架构师负责，须在开始前通知用户并等其调整推理档位。本轮只做工程fixture和基础能力，不做首页、配色、角色或模板。

## 2. A包：严格经典脚本解析（A1–A3）

A1：修复B13-R01。复用本机已装@babel/parser 7.29.9（位于tests/spikes/node_modules）；明确sourceType=script，无TS/JSX插件，不开allowReturnOutsideFunction/allowAwaitOutsideFunction等宽松选项。可继续用TS作AST辅助，但不能只用parseDiagnostics证明JS语法有效。不安装、不改根依赖或锁文件。未来正式依赖提升另批。

A2：作者view.js和最终SDK+作者view.js都用同一严格语法策略。作者错误定位到原view.js字符/行列；拼接后错误需区分作者与SDK/装配内部错误，不把SDK偏移冒充作者位置。诊断有界，不输出文件全文。严格校验作者的同时保留HTML片段、CSS、资源、经典脚本import/export拒绝、UTF-8与字节限额。只解析，不运行作者代码；禁止eval/vm/JSDOM执行模型候选。不要通过剥除类型标注“修复”错误源码。

A3：有意义的语法矩阵至少覆盖类型标注/interface、顶层return/await、模块导入导出、其他真实script语法错误与正常async函数/对象/注释内关键字，验证错误不会变成build成功、旧last_good_build留存。包含实际有效拼接的门槛验证。规则/解析器身份纳入validator_hash或明确工具身份，更新规则版本；旧回执不再冒充当前结果。文件hash需绑定实际工具输入，避免写了硬编码版本却运行其他版本。

验收R1-A01：复核四个负例全部拒绝、正例通过，诊断映射正确；同工具和同输入产物确定，源码/规则变化后原回执失效。该验收仅证明语法/结构，不是浏览器兼容、安全、功能或视觉验收。

## 3. B包：回执、版本头和历史关系（B1–B3）

B1：修复B13-R02。current_check只接受check；current_build和last_good_build只接受build。当前指针须匹配当前author revision/hash；last_good_build可引用旧版本。build回执必须有passed验证、完整有效包、合法hash、作者/产物关联、source_type及requested_scopes与工作区/对应不可变manifest一致。区分“检查记录仍对应当前代码”和“代码检查通过”，不强迫失败check消失。回执校验不能把JSON/hash完整当作全部语义正确。

B2：收紧记录读取中同类必需字段/角色/关联检查，保持合法旧私有记录可读取，工具版本变化只令current有效标记过期；没有兼容必要不迁移格式。缺文件、损坏JSON/完整性、错角色/错关联应返回明确recovery_required或既定可判别损坏错误，不重置、不覆盖原记录。损坏JSON/异常超大文件先限尺寸再读取（现有readJson先readFile后限长，可就此轻改）；普通非法用户请求仍invalid_request，不把所有错误混为恢复错误。

B3：针对错指针、失败check充当build、错误source_type/权限关系、旧build合法保留、来源不可洗白、缺失记录、有效JSON但字段不合法等设计回归。用重算校验和的合成记录测关系校验，明确这是逻辑损坏输入，不声称SHA抵抗本地恶意篡改。保留两写CAS竞争、过期check/build、不完整head提交后的重开行为，尽量复用测试工具，不复制一套存储。

验收R1-B01：独立探针场景拒绝；正常失败检查及last_good_build仍可读；所有失败路径不修改旧head/版本/宿主状态。历史不能因“修复”被清空。

## 4. C包：SDK恢复和边界回归（C1–C3）

C1：复用实际MountCoordinator.recover、BoundBridge、StableHost，以固定可信手写fixture测试完整链：写入已发生但ACK被扣留→客户端超时冻结→明确由宿主执行recover重挂同版本/新channel→新SDK收到init并等真实状态→读到已保存草稿→第二次写等真实ACK成功。旧port迟到ACK不能释放新写。没有宿主重挂时reconnect只waiting_init，须准确报连接超时，不能宣称自动恢复；不改旧host、demo/1或新增跨窗口恢复权限。

C2：补原A3中关键而未覆盖的限流与重复init，用fake clock/可控port验证30/60s边界（ready也计数）、非法或重复init不抢占现连接、超大完整包、关闭/撤权、读超时。refresh(timeoutMs)补与connect/save一致的输入校验。协议是连接级request_id；若读超时允许再读，必须避免旧读取回执被当成新一次“fresh”结果。可以冻结读取直至显式恢复或采用同等保守做法，不能自造per-call协议字段、静默重试或把迟到旧数据称最新。

C3：README/client.d.ts/局部API帮助同步真实行为；区分SDK对象重置与宿主重建连接。不要修改既有业务或增加恢复按钮/首页设计。subscribe/snapshot是最近实际授权投影，保存ACK只证明写入，不伪造新的任务状态。只在有可复现失败时做相关小修，勿全盘重写SDK。

验收R1-C01：真实宿主模块与SDK完成ACK未知→显式recover→读取状态→再次写入，且无重复提交；旧连接与迟到回执无效。jsdom仅证明接线/行为，不证明真实浏览器或原生隔离。

## 5. D包：整体收敛与封存（D1–D3）

D1：复跑完整可信fixture流程create→change→check→build→mount/save→recover→switch/undo及source restore/CAS。错误修复必须经新head重新check/build，旧结果不可冒充新结果。测试临时目录、CLI固定根与验证脚本改用reports/evidence/BATCH-013-R1/，不要再写BATCH-013任何证据。生产CLI仍固定根，禁止新增可任意指定root的参数/env；内部测试可注入根。

D2：工具hash变更后旧model-v1-derivative回执过期是预期，不能改旧工作区来刷绿。在R1新工作区建立来源仍model_candidate的静态后代：只读BATCH-013当前作者文件/来源以及BATCH-012原始hash，重新严格解析、构建、封存，记录developer_revision/tool_revalidation并关联旧source hash。无须再改已有页面风格。若新规则发现真实格式问题，仅局部修正并记录差异；原candidate和修订后代始终不执行、预览、加载或注册。派生来源必须真实，不能伪称再次模型生成或自主修复。

D3：更新authoring README和新的ui-integration.md技术交接，列实际SDK用法、恢复入口、私有hash/版本规则、真实隔离/视觉缺口。统一一份报告/manifest/checkpoint和摘要，四包结果分别列出，无须十二份报告。源文件+测试+必要fixtures+新静态派生候选进manifest；报告/日志/tmp/依赖不进成果manifest。旧BATCH-013成果留在原位和评审归档，不能原地回改旧报告。

验收R1-D01：全链回归通过、旧证据hash不变、新manifest一致、来源仍model且未运行；工具哈希变化有清楚的新证据，不冒充旧manifest继续有效。

## 6. 写集与不可变项

只允许新增/修改：
- tests/spikes/personal-space/authoring/（相关实现、局部配置、测试、README、朴素fixture）；不删除旧源文件，新增拆分文件可。
- reports/evidence/BATCH-013-R1/（合成测试临时数据、新工作区/日志/manifest/接口说明）。
- reports/BATCH-013-R1.json、reports/BATCH-013-R1.md、reports/BATCH-013-R1.checkpoint.md。

其他均只读：core/host/deepseek、所有旧reports/evidence（包括BATCH-013）、旧报告、reviews、根配置/依赖/lock、公共契约、原156卡/helper、架构/派工/检查器。旧model-v1和派生版本、两轮ledger/lock字节不变。禁止新依赖安装、网络/模型/凭据访问、运行模型代码或新增任意包到宿主可信注册表。不读holdout内容，不绕过历史浏览器/截图/递归删除拒绝，无Git提交/推送/部署/分享。

新权威范围脚本docs/handoff/check_batch013_r1_scope.py，基线docs/handoff/BATCH-013-R1-BASELINE.json。本次检查器已修正build源码漏扫；不要修改旧检查器来刷绿，旧scope相对旧基线会把架构师评审/派工识别为变化，不作为R1验收依据。

## 7. 验收收尾与停止

测试执行新/原authoring回归、类型检查和相关语法检查，core原5测、host原16测各一次；无需重跑旧DeepSeek/业务桌面全部构建。依赖路径以本地工具为准，缺工具不擅自安装。保留首次失败和修正后通过日志，准确写exit code。每包或约60分钟checkpoint；同因两次失败或需越界时记录受阻项、继续独立部分，不无限重试、不伪称完成。

报告status=submitted，batch_id=BATCH-013-R1，dispatch_ref=docs/handoff/BATCH-013-R1.md及其sha256，base_ref新snapshot_id，result_ref指新manifest；changed_files_this_round与实际范围一致。验收ID为R1-A01/B01/C01/D01；测试命令/exit/证据、未知项、旧model/ledger hash与模型/HTTP0清楚记录。无需把原accepted12改成新数字。

顺序：必要回归→报告/manifest/checkpoint/摘要→权威scope落盘复跑（含日志自身）→manifest/旧证据hash复算→docs/execution/taskctl.py validate与next --repo .。真实浏览器/native/visual仍not_run。完成四包可做部分后统一submitted并停止，不写accepted，不扩展下一批。
