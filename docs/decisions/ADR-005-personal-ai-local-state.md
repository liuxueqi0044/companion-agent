# ADR-005 · 个人AI稳定身份与显式偏好的本地应用层

状态：BATCH-014开发边界已裁定，尚未实现/验收。承接ADR-002稳定身份原则及BATCH-013-R1已通过的离线创作链。

## 决策

先实现一个可供未来桌面入口调用的无视觉应用服务：稳定personal_ai_id、AI名称、对用户的称呼、用户明确给出的表达偏好、偏好修订与撤销。身份由产品保存，不随provider、session、界面包重新生成。示例用户指令是“以后叫你Mira”“称呼我Alex”“回答直接一点”；本批消费明确的结构化修改，不假装已经有自然语言理解或模型。

明确配置不同于语义记忆。Hermes/唯一MemoryPort方向不变，本批不建立聊天记忆库、不推测用户事实、不监听屏幕或应用。communication_instructions只是用户偏好数据，不得覆写权限、预算、工具策略或变成无限授权的system prompt。

## 技术和归属

实现放services/personal_ai/，使用现有Python3.13/Pydantic2.13.5，SQLite采用标准库sqlite3（本机3.50.4）。不新建通用存储框架，不安装ORM/解析器。SQLite只承接单用户本地开发状态，生产架构中的PostgreSQL/Supabase选择不被偷偷替换；将来通过repository接口做显式数据迁移，不维持两套同时写入的权威源。

Pydantic模型为这组内部数据契约唯一源，schema_version为personal-ai-local/1。从模型确定性导出JSON Schema到packages/contracts/personal-ai-local/；该命名空间内部试用，不升格为现有C01–C11公共契约。当前无前端类型消费，不另写一份手工TS契约。正式前端接入时从同一Schema生成。

SQLite承担原子事务、唯一约束及持久化，不自行用JSON文件和锁实现第二套数据库。有限职责：本地身份记录、偏好不可变修订、当前revision指针、幂等命令回执。事务内完成CAS、修订和head/回执提交。undo创建新的修订，复制已有偏好，不删除历史；它不回退任务、UI代码、记忆、账户或权限。

## 接入边界

服务只在进程内和固定本地JSON CLI试用，不注册网络路由、不启动服务/端口、不修改services/control的原健康入口。当前没有认证/多用户保障，不能把该CLI或对象直接当公网API；未来由已验证会话提供owner上下文，正文自报owner不得授信。本批单用户本地身份不是OpenAI/DeepSeek账号。

CLI固定开发数据根reports/evidence/BATCH-014/local-state/；只有测试内部可注入tmp数据库。应用导入不创建数据库，bootstrap显式创建，read不能隐式重置或建立新身份。路径/损坏处理复用已有安全经验，但不声称本地文件路径检查是系统沙箱。

UI代码包的demo/1接口、核心封存和模型派生候选本批全部冻结。用合成的界面版本/执行器切换事件证明配置不依附它们，不扩大demo桥的权限，也不把未运行的Hermes/Codex说成已接通。初始UI仍由架构师负责，开始前先通知用户调整推理档位。

## 第一条可验证使用链

首次bootstrap生成一个身份→读取默认偏好→明确修改名称/称呼/表达偏好→关闭进程重开→同一id/偏好仍在→两个相同旧revision提交仅一个成功→显式撤销成新revision→历史和幂等结果保留。所有输入使用虚构数据，不读真实聊天、工作目录或凭据。
