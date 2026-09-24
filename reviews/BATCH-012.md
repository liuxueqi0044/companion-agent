# BATCH-012 独立复核

结论：**按本批范围 accepted**。真实请求和源码候选封存的证据一致，候选不符合宿主协议的缺口已如实记录。这个结论不接受model-v1的功能或视觉；它仍是不可执行、不可装载的未通过候选。原156卡accepted12不变。

独立复核写入前范围PASS：modified0 / added229 / missing0 / outside=[]；实际变化与报告清单一致。manifest17项hash/字节数、result_ref、派工hash通过，229项提交归档到reviews/history/BATCH-012/submitted/。旧BATCH-011账本/锁字节不变。复核结束原提交保持不变。

独立复跑：新session/worker/core的6项离线回归、核心5测、旧DeepSeek离线5测通过。新测试在复核副本中只重定向临时目录/导入路径，调用实际源实现；使用合成DPAPI和内存transport，包含两个本地launcher争锁，非模型并发。复核没有读取真实key、运行live、查询余额或追加模型请求。

新账本只有local1/global2，HTTP200、finish_reason=stop；request ID、模型名、usage275+2075=2350及候选源/产物hash与报告一致。peak单价计算US$0.0025725是估算，实际账单未查询。真实请求证据来自已落盘的调用日志、账本与候选，复核未通过第二次provider调用重复验证。

独立只读readRevision和parse5检查确认：view.html显式含html/head/body与一个script元素；JS期待init.binding并发送type/binding/payload，实际host要求顶层binding字段和method。另有null转空字符串、提前宣称saved。这与开发者instruction_fit=false一致，原源码未改、未运行、未预览。静态源码封存检查通过不代表桥协议或交互验证通过。

需要改进的是创作入口：现有prompt用自然语言说“same binding”，没有完整消息包络；手写fixture及handoff示例在ready之后立即请求读取，存在尚未active时读取被拒绝的时序。宿主激活时会推送状态，下一轮应由公共客户端等待这一可用状态、统一协议与保存回执，避免每个生成页面各写一次桥。

因此下一批BATCH-013扩大为完整离线创作工具链：公共客户端→语法/格式检查→版本化修改和构建→诊断/修复材料→整条离线回归。只复用现有demo/1协议与已装工具，不靠追加模型请求掩盖接口缺失，不改变页面自由编程路线。两次历史额度已耗尽，任何新模型调用均不在BATCH-013授权内。

产品UI尚未设计。初始视觉由交接方架构师亲自负责，正式开始前须先通知用户并等待其调整推理档位。下一批只做底层和朴素工程fixture，不设计产品首页。
