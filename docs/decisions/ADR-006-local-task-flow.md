# ADR-006 · 单用户本地任务与确定性CSV核对

状态：BATCH-015开发边界已裁定，未实现/验收。衔接ADR-005身份服务与first-flow业务来源原则；本批只实现首条业务链中的确定性数据处理基础，不能把它标成完整S0–S5 AI流程通过。

## 目的

把已有零散输入/偏好能力接到一条持久任务链：本地用户提交需求文本+CSV→queued→单个本地worker运行→有来源的核对结果→查询/取消/故障恢复。自由需求文本原样保存，语义理解明确not_run；不以正则猜测用户意图，不把确定性CSV计算称为模型理解。

## 复用与边界

Python服务、Pydantic单源、标准库sqlite3/csv/decimal；已有TypeScript输入小样的来源/数值规则和公开fixtures作只读对齐依据。不另造CSV解析器/浮点金额算法，不在Python链中嵌一个Node/浏览器运行时只为复用TS几行校验。该工具使用独立且更小的输入限额，明确标内部csv_audit/1，不偷偷替换原前端/first-flow验收。

新增services/local_tasks/内的窄模型/repository/工具/runner/service模块；任务SQLite与偏好SQLite分开，个人AI身份经已有服务读取并固定到任务。任务输入不可变；实际工作状态、结果与事件在任务库内事务化。不存在跨两库原子变更的声称，偏好变化不会修改旧任务的identity/revision快照。

只支持一个固定执行器local_csv_audit和一个版本化固定工具csv_audit/1，不建立可插任意命令的通用Agent/DAG、shell网关或第二套主控。现有Hermes主控/正式Agent接口方向不变，本地执行器用来做真实有用的功能和未来接入验证基座。

## 状态

内部任务类型local-task/1的状态queued/running/cancelling/completed/failed/cancelled/interrupted，不宣称与未冻结公共C01/C03完全相同。completed只指本次确定性工具执行结束且结果结构/来源校验通过，不代表需求语义、用户核对或整条报价业务完成。

提交有幂等键和不可变输入hash；重试/恢复新attempt，旧attempt/result不覆盖。任务快照和事件序号事务一致。cancel queued可直接cancelled；running先cancelling，worker确认停止后cancelled。结果发布和取消争用由同一事务序列化，不能已取消后迟到completed。真实进程退出未确认不伪称cancelled。

每个固定本地数据根只运行一个worker，复用OS进程锁（Windows msvcrt；其他平台可条件支持fcntl），不只靠PID或永不释放的文件存在判断。worker持锁执行，退出/崩溃由OS释放；显式recover仅在成功独占同一锁后将遗留running/cancelling标interrupted，不自动重复执行。随后显式retry创建新attempt。无后台daemon、网络服务或系统定时器。

## 接入

tools/personal_workbench.py提供固定本地根JSON CLI及服务层composition facade，供后续前端替换而非固化视觉。查询read/status/history/events/result必须无副作用。task提交不隐式创建新的AI身份；bootstrap显式建立本地profile和task store。事务结果与审计日志不包含凭据，日志不打印原始文本/偏好。

本批零模型/HTTP/凭据，无网络监听。只运行仓库手写的固定CSV工具；模型生成代码仍禁止执行。初始产品UI留给架构师，开始前按用户要求通知并等待调档。
