# BATCH-012 · submitted

本批沿用原两次额度中的剩余一次；原156卡与accepted=12不变。这是实现者提交，等待独立复核。

## A · 独立一次链路

新增固定路径`batch012-session`、worker和launcher。预留前校验旧BATCH-011 ledger/lock固定哈希、唯一历史失败记录与旧费用估算；新账本记录本地第1次、全局第2次并标记额度耗尽。Node新6测、旧核心5测及旧DeepSeek离线5测通过；合成DPAPI与假transport贯通真实launcher-core、worker、session及三文件封存。默认plan和offline均不读凭据、不发模型请求。Windows文件sync加同目录rename不等于目录级断电事务。

## B · 唯一真实请求

执行日官方文档确认`deepseek-flash`、Chat Completion端点、非思考/JSON模式及峰时输入cache-miss US$0.30/百万tokens、输出US$1.20/百万tokens。旧1次加新1次的保守上限合计US$0.0080748，低于US$0.05。仅调用新launcher一次：HTTP 200、`finish_reason=stop`，返回并封存`model-v1`三文件`model_candidate`，后续没有重试或第二阶段请求。新账本全局attempt=2、`exhausted=true`；成功后新锁移除，旧ledger/lock未变。

供应商usage为输入275、输出2075、合计2350 tokens；按文档峰时价估算本次US$0.0025725，**不是实际扣费回执**。模型源码结构和封存hash复核通过，`execution_validation=not_run`。人工只读审查`instruction_fit=false`：`view.html`是完整文档而非body片段，JS桥消息形状与当前宿主不匹配，且保存提示先于回执。源码原样留作候选，未执行、预览或注册。详见[候选审查](evidence/BATCH-012/candidate-review.json)。

## C · 架构师交接及未验证项

[宿主接入说明](evidence/BATCH-012/ui-host-handoff.md)按当前代码记录三文件格式、稳定状态、ready/active、草稿读写和撤销/恢复/停止边界。初始产品UI仍由交接方架构师负责，正式开始前按用户要求先通知并等待其调整推理档位。本批没有设计首页、角色或视觉。

真实浏览器、敌对代码原生隔离和产品视觉均`not_run`。总额度已用满，后续任何模型请求须另有明确派工；当前候选在协议修正和隔离验收前不能装载。命令、退出码、manifest、范围和旧账本哈希证据见[结构化报告](BATCH-012.json)与`reports/evidence/BATCH-012/`。
