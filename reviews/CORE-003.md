# CORE-003 独立复核及架构师补丁

日期：2026-09-24。判定：**accepted_with_architect_fixes（仅本批本地应用层）**。

先独立复核执行者提交，再依据用户已授权的“遇到难点可以直接修正”完成补丁和自检。补丁由本架构师编写，不将其称作另一位验收者独立审查的代码。原 `reports/core-003/report.json`、16项manifest及原证据保持submitted历史记录，不改原项目accepted数量。

## 提交复核

提交态范围检查PASS，16项源码/测试/文档哈希一致；原99项Python及43项Node独立复跑全部通过。全部提交文件已在 `reviews/evidence/CORE-003/submitted/` 保存副本。

检查代码和额外反例后发现以下遗漏，已直接修复，没有要求实现者再做一轮同类返工。

| 编号 | 问题与影响 | 修订 |
| --- | --- | --- |
| AR3-01 | 四类分页先通知后登记请求；同步订阅重入实际产生两条分页请求。五类读取在通知中dispose后仍发送尚未发送的I/O | 分页先登记Promise再通知，发送前核对当前生命周期/读取所有权；旧响应仍受原代次限制 |
| AR3-02 | A提醒冲突后自动select(A)覆盖用户已选择的B；旧详情可覆盖新refresh；修订命令旧回执把revision=3倒退到2；创建重放遇到已编辑的revision>1会永久unknown | 冲突读回绑定仍然选中的目标；refresh使旧详情失效；保留已观察的较新版本；按后端实际语义区分创建当前行与修订历史回执 |
| AR3-03 | memory.add的internal_error被当作确定失败，允许立即再次添加；成功结果还转发了未知字段 | 保守区分明确业务拒绝与不确定结果，unknown不自动重发；写回执采用固定字段投影 |
| AR3-04 | application直接返回可信session的原始task字段，input_hash进入普通会话；home读取的新政策被旧控制器缓存覆盖 | 对应用快照与turn操作返回值增加嵌套白名单；首页发现修订变化时刷新共用政策；导航和未读数变化使旧首页读取失效 |
| AR3-05 | 历史attempt取消被算到当前attempt；CSV完成掩盖其它动作失败；任务错误与动作错误混用 | 当前取消仅看当前attempt事件；整体完成条件考虑其它动作；分离并净化action.error/taskError，保留真实task状态 |

最初18项架构师反例在提交代码上16失败、2通过；第一轮补丁后全部通过。继续核对幂等协议增加的两项提醒回执反例实际失败，再修复。新增的真实子进程回归还验证：丢弃写回执→另一命令更新→重放时数据库仅一条提醒，历史命令回执不使已观察的新版本倒退。

## 最终验证和界限

- 产品Python：99通过；Python生产与其既有测试未改，因此沿用本次独立复跑结果。
- Node：65通过，0失败/跳过/取消，包含原43项及22项架构师回归。
- Schema只读检查PASS；新旧真实Node→Python→SQLite→CSV演示通过，身份重开、结果总额6、提醒revision=3且cancelled；实际导航无模型/worker/tick/recover/migrate调用。
- 当前成果17项见 `reports/core-003-architect/final-artifacts.json`。相对提交版，8个应用模块和frontend-handoff由架构师改变，并新增1个测试文件；原实现文档、旧测试、演示等保持原样，其补充说明以frontend-handoff此段为准。
- 历史产物与数据库依据复核开始时的独立基线检查；原CORE-003检查器不覆盖后来新增的review目录，因此提交态检查和架构师补丁检查分别保存，绝不修改旧基线来获取PASS。
- 模型/HTTP/凭据读取、安装、新会话/子代理、Git/部署和视觉工作均为0。Python服务、host/session、Schema、依赖和原工作区保持未修改。

验收A01–E03在本地范围通过，部分最终结论包含上述补丁。仍不代表真实模型质量、自动语义理解、关闭应用后的运行、系统通知、原生隔离或产品视觉已经完成。记忆非幂等写入的跨重启不确定性、实时分页而非快照分页等原限制保留。

证据入口：`reviews/evidence/CORE-003/` 内 scope-submitted、python-submitted、node-submitted、architect-red、architect-replay-red、node-final-verified、schema-final、demo-old-final、demo-new-final及architect-scope-final。

附注：首次批量复跑驱动器在打印Node的勾号时遇到Windows GBK输出编码错误。两项测试本身均已完成且原始日志落盘，后续驱动器改为ASCII安全的JSON输出；未把驱动器打印错误记为产品测试失败，也未掩盖该次驱动器非零退出。
