# BATCH-005-R1 · 修复 Windows 路径联接漏检

## 接手

唯一产品目录：C:\Users\xiayu\Documents\Codex\companion-agent。执行者为单一 Codex GPT-6 Sol 对话，实现后由交接方独立复核。不新建仓库，不自写 accepted。
先读 AGENTS.md、本派工、reviews/BATCH-005.md、reviews/M00.3.01.json，再读 tests/spikes/hermes_lifecycle.py 与 reports/evidence/M00.3.01/test_preflight.py。
架构：docs/execution/common/ARCHITECTURE.md、docs/execution/modules/M00.md；契约 docs/execution/contracts/C03.md；原卡 docs/execution/tasks/M00.3.01.md。
当前 11 卡 accepted；M00.3.01 是部分离线准备、changes_requested，A01–A03 仍 not_run。

## 唯一修订 B5-R1

Windows Path.is_symlink() 不识别 junction。独立证据 reviews/evidence/BATCH-005/junction-probe.json：真实 junction 的 is_symlink=False/is_junction=True；upstream 指向合成仓库外的自有源码仍被读取并通过；两个 home 指向同一外部目录仍被判为隔离。

1. 先用本机真实目录联接重现，目标只能是本卡 evidence/tmp/ 内自有临时夹具。通过合成 repo 与它之外的兄弟夹具目录模拟越界，不能连到用户 home、密钥或真实工作目录。原检查器和测试可复用，不复制整个产品。
2. 修复源码根、source-index 文件及源码路径各级父目录、home/temp_root 各级路径的链接检查。在受信任 repo 根以下逐段检查路径元数据，拒绝会重定向位置的 symlink/junction。Python 3.13 提供的 pathlib/os 元数据能力足够，不新增依赖。不能只比较未解析的字符串，不能先读外部内容再决定拒绝；不依赖把 junction 错当 symlink。
3. 保留不存在的正常计划 home 路径可通过、同名/嵌套 home 拒绝、固定 commit/hash 校验、structured error、默认 preflight/plan 和所有 live not_run 字段。链接检查失败或元数据无法读取时给结构化非零结果，不默默跳过。无需把离线预检做成运行时安全沙箱；说明它是检查时刻的路径检查，不能替代未来运行时隔离。
4. 补真实 Windows 回归：upstream 或源码父目录的 junction；home 的父目录/最终目录 junction；两条路径指向同一目录；源码内容读取前已拒绝；普通隔离 home、相同与嵌套路径、缺文件/篡改源、未知模式和无网络/无进程副作用继续正确。preflight/plan 都覆盖。不得仅 mock is_symlink 后宣称测试 junction；若本机创建联接失败须如实记录，不能写 passed。
5. 临时链接由本测试创建并拥有；清理时先移除链接本身，再处理普通夹具目录。任何递归删除前核定目标绝对路径位于本卡临时夹具；禁止沿 junction/symlink 递归删除目标。不要改旧权威范围脚本来忽略失败；最终范围检查前清理自己创建的联接，以免范围扫描沿链接遍历。

## 精确写集

- tests/spikes/hermes_lifecycle.py
- reports/evidence/M00.3.01/test_preflight.py
- docs/evidence/hermes-lifecycle.json（只更正预检实现/测试/限制的说明；能力映射与来源绑定不动）
- reports/M00.3.01.json、reports/M00.3.01.checkpoint.md
- reports/evidence/M00.3.01/artifact-manifest.json
- reports/evidence/M00.3.01/logs/R1-*（新增本轮日志）
- reports/evidence/M00.3.01/tmp/（仅本轮自有测试夹具，收尾清理联接）
- reports/BATCH-005-R1.md

上游源码及 source-index.json、所有旧日志、reports/BATCH-005.md、旧基线/派工、reviews/、原任务清单/helper、契约、根依赖/锁、已 accepted 代码与报告全部只读。本轮无需获取更多源码，不联网、不安装、不运行上游、不启动 Hermes、不读凭据、不调用模型/账户/已有 Agent。不启动子智能体或额外模型会话，不改 PATH/profile/注册表，不推送/部署/发消息。
解释器用 .local-tools/python-3.13.15/python.exe 或 .venv/Scripts/python.exe，不使用裸 python。

## 验收与提交

实跑整个本卡离线测试及新的真实 junction 反例；检查正常 preflight/plan 及错误分支。测试数量不是固定 13，不删除已有负例冒充通过。无需重复产品全量测试。
用 docs/handoff/BATCH-005-R1-BASELINE.json 和只读命令 `.local-tools/python-3.13.15/python.exe docs/handoff/check_batch005_r1_scope.py`。
报告 status=submitted、batch_id=BATCH-005-R1、dispatch_ref=docs/handoff/BATCH-005-R1.md、base_ref=新基线 snapshot_id；原 spec hash 不变。保留 phase=preflight_only/task_completion=partial、integration_evidence_kind=not_run、A01–A03 not_run 以及真实运行未决项；preparation_checks 单独记录 B5-R1 修订。
三个成果文件的 manifest 精确重算，result_ref 更新；changed_files_this_round 只列本轮变化，批级摘要单列。旧来源哈希必须未变。
收尾顺序：实际检查与日志→报告/manifest/checkpoint/批次摘要→scope 日志落盘后含自身复跑→所有哈希核对→taskctl validate 与 next --repo .。独立复核前 M00.3.01 仍 changes_requested、accepted=11；不得为此修改 review/helper。
45 分钟写检查点，同因两次失败或需扩大边界时记录最小阻塞。本次是短修订，submitted 后停止，不开展真实安装/调用或下一卡。
