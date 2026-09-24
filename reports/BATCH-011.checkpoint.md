# BATCH-011 实现检查点

## A / PAI-S01：2026-09-24

- 已实现三文件原字节哈希序列、确定性 HTML 装配、严格 manifest、五个窄入口及 JSON CLI。候选与封存版本分目录，封存先验证完整同卷临时目录，再原子改名；执行校验始终为 `not_run`。
- Windows 本机测试：往返、换行/空格保真、增量修改、篡改、超限、非法 UTF-8、未知字段、路径 ID、真实 junction 拒绝通过。`node --test tests/spikes/personal-space/core/core.test.mjs` 3/3。
- 本包尚需批末复核更多边界、形成 manifest 与统一证据。下一步继续 B，旧源与产品视觉未动。

## B / PAI-S02：2026-09-24

- 已实现版本化宿主状态（虚构个人身份、会话、草稿、任务快照）、候选请求代次、超时/取消/过期base拒绝、原子单记录切换与撤销。损坏记录进入恢复状态，模型候选明确拒绝装载。
- 已实现仅对绑定 MessagePort 接收的窄桥，检查通道、revision、request、方法、大小、速率及独立grant；停用/撤销/恢复控件属于外壳。测试页明显标注“非产品界面”，只装载固定哈希仓库手写fixture，并用sandbox/CSP限制浏览器能力。
- 本地 `vitest` 3文件7测、局部 `tsc`、局部 `vite build` 通过。DOM仅验证朴素入口/草稿持久化，不推断视觉或原生隔离。下一步 C 离线失败回归与官方价格/接口核查。

## C / PAI-S03 离线阶段：2026-09-24

- 官方文档检查与固定价格快照写入 `reports/evidence/BATCH-011/deepseek-doc-check.json`；固定端点、`deepseek-flash`、非思考、JSON object 与峰时 cache-miss 输入/输出单价符合派工。
- 独立网络worker、预留ledger、排他launcher、固定虚构提示与两阶段候选存储已写。默认 `--plan`、`--offline` 均报告凭据读取0/网络0；离线Node测试4/4通过，包括预算、截断、非法JSON、超时、重定向配置、未知上次请求和假key脱敏。
- 尚未读取真实凭据或发起真实请求。下一步先做范围/类型/运行前检查，再仅通过专用launcher执行最多两次串行请求。

## C / PAI-S03 live与批末：2026-09-24

- 范围预检通过（修改0、新增28、缺失0、越界0）。专用launcher在请求前原子预留attempt 1；DPAPI解密失败。对同一`sent_at_utc=null`预留进行一次恢复诊断，仍在解密阶段失败。ledger标记`failed_pre_send`，锁保留，实际HTTP发送0、模型候选0，第二次请求not_run。不再重试或搜索其他凭据。
- 最终回归：A Node 4测、C Node 5测、B Vitest 8测；局部host类型/构建和根桌面类型/构建均exit 0。真实浏览器观察、原生隔离、产品视觉均not_run。
- 已生成28项manifest、提交报告草案；下一步仅做本批权威范围检查落盘复跑、成果hash复算、taskctl validate/next，然后停止等待独立复核。
- 批末完成：权威范围检查复跑PASS（modified0 / added50 / missing0 / outside0），`changed_files_this_round`与检查器结果一致；manifest 28项逐文件哈希、字节数及`result_ref`复算PASS；taskctl validate返回156卡有效，next仍为M00.3.01 not_run、accepted12。报告status=submitted，停止等待独立复核。
