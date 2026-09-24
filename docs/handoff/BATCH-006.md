# BATCH-006 · 离线运行观测器 + AIRI 组件复用分析

## 1. 接手与批次规模

唯一产品目录 C:\Users\xiayu\Documents\Codex\companion-agent。执行者：单一 Codex GPT-6 Sol 对话，实现者不写 reviews/ 或 accepted，不另建产品仓库，不启动子智能体/额外模型会话。
用户希望下一批连续工作更多一些。本批限定两个目标、五个顺序小步骤，按约 2–3 小时的聚焦工作量组织，不要求凑时长，也不无限延长。每一步留简短检查点后直接做下一步；批末统一交接，不因一个普通小步骤完成就停下来等确认。

M00.3.01：BATCH-005-R1 的离线预检修订已通过，但整卡 live 验收仍 not_run。继续开发后续真实试验可复用的最小离线观测器。
M00.4.01：唯一前置 M00.2.03 已 accepted，可独立开展，不依赖 M00.3.01。两者在同一对话顺序执行；不豁免任何依赖验收。M00.4.02 仍未授权。
taskctl next 返回最早未完成的 M00.3.01，不表示已具备前置的独立 M00.4.01 被全局锁住。本批以明确派工和真实前置状态为准。

先读 AGENTS.md、本派工、reviews/BATCH-005-R1.md；然后 docs/execution/common/ARCHITECTURE.md、docs/execution/modules/M00.md、docs/execution/contracts/C03.md，原卡 docs/execution/tasks/M00.3.01.md / M00.4.01.md。按需读其他原卡指定契约。
复用已验证的 tests/spikes/hermes_lifecycle.py 预检、docs/evidence/hermes-lifecycle.json 与固定源码，不重新选型，不重新修改已通过的路径校验。

## 2. 目标一：M00.3.01 离线观测器（步骤 1–4）

这不是生产 SupervisorRuntime，也不是 Hermes 替代实现；仅为真实接入试验准备小型进程观测与证据记录部件。复用 subprocess、json、uuid、threading、pathlib 等标准库，不加框架/数据库/队列/依赖。
将存储/JSONL 解析放 tests/spikes/hermes_eventlog.py，固定 fixture 的进程观测放 tests/spikes/hermes_observer.py。测试子进程和回归放本卡 evidence/offline/。保持模块间接口小而明确，不挤成一个超大脚本。建议总手写实现不超过约 500 行，若明显超出，应缩减非必要功能而非隐藏代码。

### 步骤 1：定义并实现离线记录与解析

输入为固定源码所示 JSONL 格式的模拟字节流、唯一的本地 observation_id、实验自有输出目录；输出为有界原始 stdout/stderr、按序观测事件和可读取快照。接口可自行命名，先在本卡 checkpoint 记清输入/输出再实现。
- observation_id 是本实验标识；native_session_id 只有在确实解析到 init/result 后才填写。二者不等同于原生 durable run_id，后者保持 null，除非有新的真实来源证据。
- 每条记录标 evidence_kind=offline_fixture，标识实际启动的是本地测试子进程；真实 Hermes 验证仍 not_run。
- 增量解析能处理拆分写入、多条同批写入、中文 UTF-8、空白文本、无换行的结束残片、未知类型和损坏 JSON。保持观测顺序；本地 seq 只表示本进程看到的顺序，不冒充上游 replay cursor。
- 分开记录 process_state、native_result_observed、cancel_request 与 observed_exit。不能把收到 result/exit_code=0 等同产品 completed，不能把发送取消等同 cancelled。无结果退出、损坏/矛盾记录、观测器中断都保留 unknown/错误事实，实际 product_task_state 保持 null，不填杜撰的终态。
- 设有界输出（例如单行 64 KiB、stdout/stderr 各 1 MiB，超限记录事实并停止该 fixture），防止死循环或无限日志；数值可在测试固定配置内调整，不开放任意配置执行。
- 快照用同目录临时文件+原子替换；已有非空运行目录不能静默覆盖。读快照不能启动/重跑任何进程。中断写入或缺关键证据后不能凭最后一条文字推断成功。

### 步骤 2：固定本地 fixture 的进程所有权

本轮首次授权启动你编写的、不会联网的测试 fixture Python 子进程，仅用于离线进程行为测试；这不授权启动 Hermes 或任何 Agent。
- 使用项目显式 Python 路径与固定 fixture_child.py，shell=False/参数数组。只接受枚举 scenario；不得提供 --command、任意可执行路径、任意 Python 代码、模型/网络 URL、凭据参数或 live/Hermes 开关。
- cwd 与输出仅本卡 reports/evidence/M00.3.01/tmp/ 下的自有普通目录，复用已有路径检查思路，拒绝链接与逃逸。保留 preflight.py 的只读行为，不在其 run/preflight/plan 内加入启动逻辑。
- 子进程环境只传必要系统变量，不把用户 .env、API key、账号缓存或整个 os.environ 原样继承给 fixture；fixture 禁止自行启动其他进程。
- 所有权来自当前观测器实际创建的 Popen 对象；取消仅操作该对象，绝不按进程名、外部传入 PID 或磁盘里的旧 PID 杀进程。记录请求时间/返回结果与 wait 得到退出码/时间，不伪造“上游确认收到了取消”。
- 测试总超时与取消宽限必须有上界；任何失败路径都回收自己创建的 fixture。不要实现 POSIX 信号在真实 Windows Hermes 上的未经验证语义。

### 步骤 3：观察者断连与只读恢复

进程所有者持续收集输出；“观察者”只消费已记录事件/快照。断开一个观察者不能关闭所有者 stdout 或启动替代进程。
- 重新读取相同 observation_id 能看到已保存记录；重新导入模块/另起只读查看器不能重跑 fixture。
- 明确区分观察者断开与进程所有者崩溃。后者只读取落盘事实，标记状态待核对；不根据持久 PID 自行认领或终止进程，不自动恢复执行。
- 本轮不实现 WebSocket/HTTP/数据库持久服务；最小函数/命令接口加文件证据即可。禁止为了“断连演示”额外启动产品 API 或前端。

### 步骤 4：真实本地子进程回归与交接

用自己编写的固定 fixture 生成以下场景，实际启动标准 Python 子进程并记录退出事实（不是仅 mock Popen）：
1. 正常 init/text/result 与进程退出；分块中文 JSONL 能正确重组。
2. 有 init 但缺 result 就退出，保持未知结果。
3. 损坏/截断/矛盾事件，不当成功；超长输出触发预设上限。
4. fixture 等待期间发取消，请求记录与实际 exit 分开；没有残留 fixture。
5. 观察者断开再接回，同 observation_id/同一次进程执行，不重跑。
6. 重读快照/模拟缺失尾部日志只读，不启动新进程，不把未知标成功。

补模块级必要负例：路径逃逸/链接、非法 scenario、已有运行目录、原子快照读写一致性。只测试这些关键行为，不为每一行实现写镜像测试。继续跑原 preflight 的 23 项回归；不重跑无关产品全量测试。
更新 docs/evidence/hermes-lifecycle.json，把“源码分析”“离线 fixture 实测”“真实 Hermes not_run”分栏表达；保留原始来源绑定及未知能力。将下一步真实接入还缺的安装、只读工具策略、账号类别/模型与预算写明，不偷偷执行。

## 3. 目标二：M00.4.01 AIRI 抽取范围（步骤 5）

固定 moeru-ai/airi commit 308ee2b3aa8587262aa7a458d5d68407cb5f2342，来源与许可先读 docs/dependencies/selected-versions.json、license-register.json、asset-register.json 中 AIRI 条目。
选择一个首版真正需要的桌面伙伴容器/状态呈现组件作为主候选，最多比较一个更轻的候选，不能扩大为全仓调研。
先复用本地证据；不足时允许只读获取该 commit 官方公共源码/目录信息作为数据，保存到 reports/evidence/M00.4.01/upstream/，记录准确 URL、commit、hash、bytes。不能运行下载代码、安装 AIRI 或读取用户云服务。
交付 docs/evidence/airi-extraction.md：具体源文件清单；直接及递归 workspace 依赖；别名/动态导入未知项；样式/字体/图标/素材来源及许可；是否需要 AIRI 后端、会话/记忆、WebGL/TTS/模型；最小接入面、替换/删除方式与维护成本。跟踪到 package 边界并注明外部包，不要求把整个 node_modules 展开。
结论必须明确“可选取哪些文件”或“依赖成本过高，放弃该组件并沿用现有 Vue/原创视觉”，有事实依据。放弃是原 A02 允许的结果，不为了复用而复制一整套框架。
可以只读参考已有视觉交接：C:\Users\xiayu\Documents\Codex\2026-09-23\html-svg-2d-2\outputs\companion-ui\HANDOFF.md（温暖、克制、有陪伴感）；本批不复制/修改此原型、不实现 UI 小样，不引入 AIRI 的角色模型、音频或未经确认的美术素材。
本卡是分析卡，不为文档写复述性测试。A01/A02 用逐项源代码/依赖证据支撑，不把网络抓取成功当组件运行成功。依赖或许可证无法核实时标 unknown，不假装已查清。

## 4. 文件边界（本派工显式补充授权）

M00.3.01 可写：
- tests/spikes/hermes_eventlog.py、tests/spikes/hermes_observer.py（本段新增试验模块，仅本批额外授权）
- docs/evidence/hermes-lifecycle.json（保留已通过预检与来源，只增离线观测证据/下一步）
- reports/M00.3.01.json、同名 checkpoint
- reports/evidence/M00.3.01/offline/（固定 fixture、回归脚本、小型测试数据/说明）
- reports/evidence/M00.3.01/logs/B6-*、reports/evidence/M00.3.01/tmp/
- reports/evidence/M00.3.01/artifact-manifest.json
只读：tests/spikes/hermes_lifecycle.py、原 test_preflight.py、upstream/ 与 source-index、旧日志、所有已通过报告快照。

M00.4.01 可写：docs/evidence/airi-extraction.md、reports/M00.4.01.json、同名 checkpoint、reports/evidence/M00.4.01/。
批级可写：reports/BATCH-006.md。
其他全部只读：reviews/、根规则/依赖/锁、docs/execution/任务/契约/helper、docs/handoff/派工/基线、服务/验证器、前端、已 accepted 产物。不读 holdout，仅核哈希。不改 CURRENT-TASK.md（历史绑定）。
不得安装依赖/上游、改 PATH/profile/注册表、启动实际 Hermes/Codex/Claude Agent、访问模型/账号/订阅/云服务器、部署/推送/发消息。除 AIRI 固定公共源码读取外无联网用途。
不得从旧 live 操作单推导本批执行权限，live 验证仍待条件具备。只用 .local-tools/python-3.13.15/python.exe 或 .venv/Scripts/python.exe；若本批不需要 Node 就不要运行它。

## 5. 批内节奏与统一验收

每约 45 分钟及完成一个步骤时更新本卡 checkpoint：已完成、当前文件、实际检查、下一步。普通实现选择自行决定，不逐小步等用户确认。同一原因两次失败、需扩写集或超出该目标合理规模时只暂停受影响目标并记录原因；另一个没有依赖关系的目标可继续。上限约 3 小时为拆分提示，不允许为了赶时长跳过检查。

本批统一用 docs/handoff/BATCH-006-BASELINE.json 和只读检查：
`.local-tools/python-3.13.15/python.exe docs/handoff/check_batch006_scope.py`

两个报告都 status=submitted、batch_id=BATCH-006、dispatch_ref=docs/handoff/BATCH-006.md、base_ref=本批 snapshot_id；原任务 spec hash 不变。
M00.3.01 保留 partial、integration_evidence_kind=not_run、A01–A03 not_run。离线实测放 preparation_checks 和 offline_fixture_execution，不计作 Hermes 真实证据；unresolved 保留账号/真实接入等未决项。新增两 spike 文件属于本派工 extra write set，放 dispatch_changed_files，不能假装在原卡 write_allowlist 中；manifest 必须覆盖这两个模块和必要 fixture/测试，以及现有原成果（未改文件保留正确 hash）。
M00.4.01 按原 A01/A02 提供文档与来源证据；本卡不要求运行组件，不虚构运行数据。各卡报告各管自己的成果，不混写范围。
收尾：实际检查与日志→两个 manifest/report/checkpoint→批次摘要（两个目标的状态与所有成果 hash/未知项）→范围日志落盘后含自身复跑→manifest/result_ref 重算→taskctl validate/next --repo .。范围日志放 reports/evidence/M00.3.01/logs/B6-final-scope.txt；批摘要单列 batch_level_changed_files。
单卡报告不包含日志/报告/manifest 自身在成果 manifest 中，result_ref 使用真实 manifest-sha256。累计 accepted 应仍 11，M00.3.01 的旧 review 与新 report 不一致是等待复核的正常状态；不得改 review/helper 凑数量。
两个目标完成或各自有明确阻塞后，批末统一提交并停止。不得开展 M00.3.02/.03、M00.4.02 或其他批外任务。
