# 给执行模型的开发任务包

这是原架构的执行版：**12 个模块、156 张小任务卡**。原 55 项全部覆盖，并补上最小工程基础。全部任务尚未开发；当前完成的是设计、拆分和派工辅助工具。

## 最简单的用法

1. 将本 execution 目录复制为未来产品仓库的 `docs/execution/`，交接记录放仓库根目录的 reports/reviews。先看 [共用架构](common/ARCHITECTURE.md)。
2. 从 [开发顺序](ORDER.md) 选择依赖已验收的一张卡；首项是 [M00.1.01](tasks/M00.1.01.md)。
3. 把卡片、共用架构、对应模块说明和指定契约交给便宜模型。下面的工具可以自动拼接。
4. 开发模型只提交 report；由独立验收模型或架构负责人按证据复核。通过后才解锁依赖任务。
5. 中断时写 checkpoint。换模型/开新上下文后读取同一任务和 checkpoint，继续已有结果。

**每次一个小结果，不把全部任务一次性交给执行模型。** 不需要为每个实现细节征询用户。涉及架构修改由负责架构的模型处理，涉及真实账号/付费服务则按已有授权执行。

## 文件导航

- [完整开发顺序与原任务覆盖表](ORDER.md)
- [共享架构](common/ARCHITECTURE.md)：依赖方向、不可破坏条件、上下文和范围控制。
- [上游核查基线](common/UPSTREAM-BASELINE.md)：版本/许可核查的官方入口。
- `modules/`：12 份模块内部架构；`contracts/`：11 份共享接口规格。
- `tasks/`：156 张具体卡片，包含文件白名单、步骤、失败场景和验收。
- [任务数据](microtasks.json)：真实依赖、顺序、规范哈希与写入冲突串行关系。
- [开发者模板](templates/WORKER.md)、[验收者模板](templates/REVIEWER.md)、[检查点](templates/CHECKPOINT.md)。
- [报告模板](templates/report.json)、[复核模板](templates/review.json)。
- [派工工具](taskctl.py)：只读计划/报告，生成当前任务提示词；不调用模型、不启动任务、不花费 API 额度。
- [完整提示词样例](examples/WORKSPACE-LOCK.md)：展示一张“本机工作区写锁”卡如何连同架构、接口一起交付；仅供预览。

## 派工命令

在本包目录执行（`python` 需为 Python 3）：

```text
python taskctl.py validate
python taskctl.py next
python taskctl.py prompt M00.1.01 --repo <产品仓库绝对路径> --output current-task.md
python taskctl.py prompt M04.4.01 --preview --output preview-only.md
python taskctl.py next --reports-dir <产品仓库>/reports --reviews-dir <产品仓库>/reviews
```

正式 prompt 默认检查依赖和目标仓库，缺验收或目标目录会拒绝；`--preview` 只用于查看未解锁卡，明确标为不可开工。指定 `--repo` 后默认从该目录的 reports/reviews 读取交接；否则从本包对应目录读取。P2 默认不派发，需要 `--include-p2`。工具不会自动修改任务状态，也不会替代测试和独立审查。

report 的 commands 每项填写 `argv`（参数数组）、`exit_code`、`log_path` 和 `evidence_kind`（actual/mock/not_run）。acceptance_results 每项填写 `id`、`status`（passed/failed/not_run）、`evidence`。生产仓库内的记录路径见卡片。

复核记录必须绑定当前任务规范、所引用的共用/模块/接口文档、精确 report 文件哈希、result_ref 和全部验收 ID；公共架构变更会使相关旧验收失效。架构复核卡的 reviewer_role 必须为 architect。真实接入卡的 integration_evidence_kind 必须为 actual。哈希用于防止误用旧报告，不证明复核者身份；团队要落实“执行者不能批准自己”的职责分离。

## 任务尺度和实际边界

普通任务按约 30–90 分钟聚焦实现设计，45 分钟保存检查点；真实接入、用户试用和外部等待不保证在该时段完成。超出范围时继续保留成果，提交最小拆分建议，不能为了按时完成牺牲验收。

这是一份 greenfield 目录约定。将来已有仓库时，架构负责人先做路径映射、重新生成任务哈希，再派工；执行模型不得自行改名整仓。更改契约须补兼容说明、生成类型并重验相关依赖。

技术依据补充：[Pydantic Schema](https://docs.pydantic.dev/latest/concepts/json_schema/)、[json-schema-to-typescript](https://github.com/bcherny/json-schema-to-typescript)、[pytest](https://docs.pytest.org/en/stable/getting-started.html)、[Vitest](https://vitest.dev/guide/)。选择可兼容版本并锁定，不依赖未核实的最新版行为。
