# BATCH-011 · submitted

独立增补实验轨道 `personal-ai-supplement`。原156卡与accepted=12保持不变；本报告不是独立验收，也没有写入reviews。

## A / PAI-S01

完成透明三文件UTF-8源码包、可独立复算的长度前缀哈希、可信装配、严格manifest、五个窄入口与JSON CLI。源码候选可基于明确base_revision修改，封存版本不可经适配器覆盖。Windows真实junction、非法字节、未知字段、容量、篡改、重名不同内容等负例通过。源码结构校验不包含执行安全结论，`execution_validation=not_run`。

## B / PAI-S02

完成独立虚构身份/会话/草稿/任务快照、候选就绪/超时/取消/过期版本/迟到拒绝、单记录切换与撤销。桥仅通过绑定frame的MessagePort接受窄方法，校验通道、revision、请求ID、大小、速率及grant。测试页明确标注“开发验证页，非产品界面”，只装固定hash的仓库手写fixture；模型候选返回`untrusted_execution_unavailable`。DOM验证了入口和草稿持久化；未做真实浏览器或原生隔离验收。

## C / PAI-S03

固定`deepseek-flash`非思考、JSON object、≤16KiB messages、2500输出tokens、≤128KiB响应、90秒超时、两次累计≤US$0.05本地估算。官方价格/接口资料已核对；默认plan和offline均不读key、不发网。离线5测通过。live在专用launcher的DPAPI解密阶段失败：ledger持久预留1次，`sent_at_utc=null`，**实际HTTP请求0次、模型响应0个、候选0版**。同一预发送attempt再次调用仍在解密阶段失败；保留锁，停止live路径。第二次增量请求not_run，不假称生成成功。

## 自检与缺口

核心Node 4测、DeepSeek离线Node 5测、宿主Vitest 8测；局部host TypeScript/构建、根桌面TypeScript/构建各通过。manifest 28项且独立复算一致，`result_ref=sha256:c345ad35cfa6994741c8d5ea02311a474e6a492be2b9a30c14bbe0624f95eb65`。本批范围检查通过：modified 0 / added 50 / missing 0 / outside 0；taskctl计划校验通过，旧任务next仍为M00.3.01 not_run、accepted 12。实际浏览器观察、敌对代码原生隔离和架构师负责的产品视觉均`not_run`；C02因凭据解密阻塞。凭据格式、API有效性、余额和用量未知，费用记null。

接入说明：`reports/evidence/BATCH-011/integration.md`。尝试记录：`reports/evidence/BATCH-011/live-attempts.json`。本批提交后停止，等待独立复核，不自行提升私有协议为公共契约。
