# BATCH-011-R1 实现检查点

## R01 / frame生命周期（2026-09-24）

- `MountCoordinator`统一activate/recover/undo，操作独占frame、bridge、timer、代次；旧操作清理只处理自己的资源。候选ready及base/hash验证后才提交宿主状态并换frame；失败保留旧视图。
- `StableHost`新增在ready后提交的restorePrevious/recoverCurrent，去除先改指针的同步undo。手写工程fixture增加v2，不做产品视觉。
- `mount.test.ts`实际jsdom iframe协调器4组通过：双版本撤销、旧操作失败和新端口保留、恢复失败/stop/hash晚到、持久化失败保留旧frame。局部TypeScript通过。下一步R02。

## R02 / 出站授权（2026-09-24）

- `stateChanged`与`read_demo_state`共用ready、当前revision、当前连接、read grant、未关闭门槛。只发送demo草稿/任务/active_revision投影。`close`幂等，关闭后入站/出站均无业务效果。
- 新旧同revision连接按bridge对象与frame绑定区分。空读grant、仅写grant、撤权、候选/失活、关闭及正常授权正例均断言port实际发送内容和次数。桥/装配定向Vitest8测及局部TypeScript通过。下一步R03。

## R03 / 完整manifest封存（2026-09-24）

- 已封存同名revision时比较所有固定字段的规范化manifest，包含身份、base、来源、scopes和源码/产物哈希；对象键顺序与scopes顺序不影响语义，实际字段变化返回`revision_collision`。
- 核心Node 5测通过：分别改变package_id、base_revision、source_type、requested_scopes而保持代码不变，逐次核对旧封存所有文件字节未变；相同清单幂等。原UTF-8、大小、哈希、路径/junction回归继续通过。下一步R04。

## R04 / 凭据与启动器（2026-09-24）

- 凭据读取改为`ReadAllText`加`ConvertTo-SecureString`；launcher仅在执行前用`SecureStringToBSTR`转换，并在finally调用`ZeroFreeBSTR`。固定项目Node路径，移除`ResumeReserved`。worker预发送失败记录固定类别并核对锁token，旧ledger/lock未触碰。
- 合成PowerShell launcher层7组通过：DPAPI文本端到端解码、假worker秘密传递与最小环境、坏格式/空/篡改/缺失、留锁、两次上限、两个并发launcher竞争。默认合成credential-check通过，HTTP和真实凭据读取均为0。
- 依派工许可仅一次执行`credential-check.ps1 -CheckConfigured`，结果`decoded_nonempty=true`、`error_category=null`，零网络、未调用worker。仅证明当前用户下本地文本可解码；API有效性和余额未知。本批不运行live。接下来统一验证与submitted报告。

## 批末统一验证与提交（2026-09-24）

- 原核心4测加新反例共Node 5/5；原DeepSeek 5/5；原宿主8测加新回归共Vitest 16/16；launcher合成7组通过。局部TypeScript和Vite构建退出码均0，证据在`reports/evidence/BATCH-011-R1/`。
- 工程fixture v2的artifact SHA-256与manifest一致。源码/测试/fixture manifest共23项逐文件hash和字节数复算PASS；`result_ref=sha256:572c23bcc46ce476b4fc650e76a1fd0e3e29227827ba80c3563b155bccc0f586`。
- 报告与批摘要状态均submitted；原accepted12不变。真实模型、真实浏览器、原生隔离与产品视觉保留not_run。下一步仅做权威范围检查复跑、旧ledger/lock hash终检、taskctl validate/next，然后停止等待独立复核。
- 首次权威R1范围检查PASS：modified11 / added167 / missing0 / outside0（含合成测试tmp与日志，manifest刻意不收录tmp）。
- 复跑范围检查PASS，纳入先前落盘日志；manifest/dispatch/result_ref及旧ledger/lock哈希终检PASS。`taskctl validate`退出0：156卡有效；`next`退出0：M00.3.01仍not_run、accepted12。状态submitted，停止等待交接方独立复核。
