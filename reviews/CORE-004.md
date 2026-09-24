# CORE-004 独立复核及架构师补丁

日期：2026-09-24。判定：**accepted_with_architect_fixes（本地前台协调器范围）**。

先独立复核提交，再按用户授权直接修正边界问题。架构师自己编写的补丁经过回归验证，不称作另一位作者的独立审查。原 `reports/core-004/` 报告和19项manifest保持 submitted 历史，原项目 accepted 数不变。

## 提交证据与修订

提交态范围检查 PASS，19项成果哈希一致；独立复跑 Python 101项、Node 88项通过。提交源码副本在 `reviews/evidence/CORE-004/submitted/`，复核开始时的全量文件基线单独封存。

额外13个反例在提交代码上全部失败，原始输出见 `architect-red.txt`。直接修复如下问题：

| 编号 | 问题和影响 | 当前行为 |
| --- | --- | --- |
| AR4-01 | idle时只读核对不受owner/idle生命周期约束，重复核对不单飞；迟到读取可覆盖新任务或新阶段 | 核对登记唯一Promise，参与slot、whenIdle、dispose和owner释放；观察代次失效时不发布旧活动 |
| AR4-02 | 增加hostPending后同步通知，回调stop/dispose仍挡不住随后才发送的begin/execute | 复用request的发送前资格检查；清理和核对分别按自己的所有权发送 |
| AR4-03 | 只把三个错误码当作未知，internal_error被当成已确定未写入；dispose后迟到错误丢失 | 只有明确业务拒绝才确定失败；已发出的写请求未知结果保留，不自动重试或允许新链 |
| AR4-04 | accept拒绝非法followup窗口后，原turn一直generating | 原ticket窄失败收尾；真实事务回归确认建议的记忆/计划/动作未部分提交 |
| AR4-05 | 最后读回只核对turn ID，非法状态也可显示settled；local worker后的读取失败未标记待核对 | 活动投影必须有效；工具推进后无法确认结果保持needsReconciliation |
| AR4-06 | stop回执任务仍未知但只写在一次返回值里，后续可再执行；dispose快照计数永久冻结 | 不确定性持续阻止新工作；实际未结算计数动态读取，取消授权不冒充worker退出 |

修订仅改 `apps/desktop/product/execution/runner.mjs` 和前端接入补充文档，新增 `tests/product/core004/architect-regressions.test.mjs`。没有修改Python生产代码、旧测试、依赖或原工作区。

## 最终验证

- Python：101通过，沿用本次独立复跑；Python源码和测试未变。
- Node：105通过，0失败/跳过/取消，含原88项和17项新回归。除最初13个反例外，还覆盖dispose后迟到未知写入、本地worker后读回失败、核对重入和真实非法followup事务。
- Schema只读检查 PASS。CORE-002/003/004三份真实本地离线演示通过；CORE-004结果为CSV总额6、稳定重开、第二turn cancelled、权限已撤销且worker_exited仍为null。
- 当前20项成果见 `reports/core-004-architect/final-artifacts.json`。原提交manifest用于历史核对，不能拿它覆盖架构师补丁。
- 独立基线范围检查见 `reviews/evidence/CORE-004/architect-scope-final.json`。旧submitted范围证据与本次补丁范围分别保存；历史文件和数据库不为通过检查而重写。

A01–A03、B01–B02、C01–C03、D01–D03、E01–E03在上述本地范围通过，部分最终结论包含架构师补丁。

## 保留的边界

真实模型、自然语言理解、Node主动联系执行链、后台常驻、系统通知、原生隔离和产品视觉未验收。此次模型/HTTP请求、凭据读取、安装、新会话/子代理、Git/部署均为0。

owner仍是同一进程内同一host对象的约束，不能宣称跨账号/跨进程互斥；unknown不通过一次只读核对自动清除。普通导航不生成、不启动worker，UI设计仍归架构师。

证据入口：`reviews/evidence/CORE-004/` 的 scope-submitted、python-submitted、node-submitted、architect-red、node-final、schema-final、demo-002/003/004-final、final-command-results、architect-scope-final。
