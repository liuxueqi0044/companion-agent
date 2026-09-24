# BATCH-013 独立复核

结论：**changes_requested**。已形成完整离线创作链，但两个可复现缺陷阻止整批接受。原156卡accepted仍为12，不把私有实验的成果计入原卡通过数。

## 提交核对和独立验证

写入评审前原检查器PASS，modified0 / added2328 / missing0 / outside=[]。88项manifest的hash/字节数与报告result_ref一致；2329个实际提交文件归档于reviews/history/BATCH-013/submitted/（比范围清单多一个build源文件）。复核结束再次核对2329项，无提交文件改动。旧账本/候选所在基线范围未改。

独立复跑作者工具链7文件20测、核心5测、宿主16测，共41测通过；作者TS类型检查通过。测试副本仅改临时目录与导入定位，仍调用实际提交实现；CLI副本仅重定向固定测试根，不向原提交工作区写数据。副本初次运行遇到jsdom依赖定位、Windows字符串和无扩展名TS路径问题，修正复核工具后7/20通过；这些不是产品缺陷。原始失败及最终成功日志均保留，未隐藏。

模型原候选/其后代仅静态读取，没有执行、预览、装载。独立语法探针使用评审手写的合成字符串，通过Node vm.Script只编译不运行作对照，不对模型源码调用vm。模型/HTTP请求0、真实凭据读取0。浏览器、原生隔离、产品视觉仍not_run。

## B13-R01 · P1：并未真正校验经典JavaScript语法

validateAuthor及prepareBuild都只用TS createSourceFile(...ScriptKind.JS)的parseDiagnostics判断JS语法。该解析器仍可生成含TS专用语法或非法顶层语句的AST，不等于经典脚本可解析。

独立探针：`const count: number = 1;`、`interface Foo {x:number};`、`return 1;`、`await Promise.resolve();`均返回source_validation=passed且prepareBuild成功。原生经典脚本编译对四者均抛SyntaxError；正常`const okay = 1;`通过。于是AI返回带类型标注的代码，会被包装成“构建成功”，到页面里才无法运行。这是格式/构建门槛缺陷，不属于已经声明不保证的业务语义正确性。

需在作者JS与最终拼接JS两处进行严格script语法解析，禁用TS/JSX和模块/顶层return/await宽松选项，保留作者诊断定位；不执行作者源码。已本地核实tests/spikes/node_modules/@babel/parser为7.29.9，script模式可拒绝上述样本，可直接复用；无需安装解析器或拼正则替代语法检查。更改规则/工具hash，使旧检查和构建状态明确过期。

## B13-R02 · P2：回执指针缺少角色和语义一致性校验

read读取current_check/current_build/last_good_build时使用同一个通用receipt()。它没有要求current_build和last_good_build必须指向kind=build。receipt_current对check回执跳过builder_hash，继而把它判成有效构建。

独立合成工作区：先构建正确源码→改为`function () {`→构建失败产生合法check回执→仅将head.current_build指向该失败check并按既有算法重算head完整性。read未拒绝，返回current_build_valid=true、receipt_kind=check、validation=failed、effective_revision=null。这里重算校验和用于构造“JSON/hash完整但关系错误”的状态；不是宣称发生过磁盘自然损坏，也不是把无密钥SHA当作防攻击签名。

需验证每个指针对应的回执类型、当前源码归属、build必须通过验证且有完整产物、来源/权限元数据关系；发现矛盾返回recovery_required。失败的check可以作为当前检查记录存在，但不能成为可用构建。last_good_build允许旧源码/旧工具记录，但必须是真实的历史build，且不能冒充当前有效。校验失败不可重置head或覆写历史来“修好”。

## 非阻断归因与完整性补充

旧范围脚本全局忽略任何build目录，漏掉authoring/build/build.mjs。该源文件实际在88项manifest中且hash正确；这是架构师提供检查器的盲点，不认定执行者越权或漏交。下一轮新检查器取消此排除，旧检查器及证据保留不改。

SDK已有超时冻结测试，但只测reconnect返回waiting_init，没有验证宿主重新发init到恢复写入的整链。README正确说需要fresh init；下一轮使用现有MountCoordinator.recover证明完整恢复，明确客户端reconnect本身不驱动宿主重挂载。再补消息频率边界、重复init、读超时等与此相关的小范围回归。不是要求增加新协议或重新设计宿主。

下一轮BATCH-013-R1四包连续完成：经典脚本语法门槛→回执关系→SDK实际恢复→整链收敛与新静态派生证据。旧提交报告/证据完全只读，源码修订单列新manifest。初始产品UI仍交由架构师，开始前须通知用户并等其调整推理档位。

证据：reviews/evidence/BATCH-013/independent-probes.json、test-rerun-final.txt、core-rerun.txt、host-rerun.txt、typecheck.txt、scope-before-review.json、submission-hashes.json。
