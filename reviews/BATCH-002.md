# BATCH-002 独立复核

结论：**三卡 accepted，一卡 changes_requested**。已写逐卡、逐验收 ID 裁定，未修改开发者 submitted 报告。

| 任务 | 裁定 | 范围 |
| --- | --- | --- |
| M00.1.03 修订 | accepted | 完整纠正/复用快照、来源与金额；预留输入保持原字节 |
| M00.2.01 | accepted | 26 项运行时与候选元数据，未知项如实记录 |
| M00.2.02 | accepted | 29 项许可与 7 项资产登记；不代表法律审查或再分发总授权 |
| M00.2.03 | changes_requested | 只需修正 Hermes 最终安装来源与相关证据 |

## 核对结果

- 作者 7 个检查器复跑 exit=0；136 处路径/哈希引用一致；四份 report/result_ref 与实际产物一致。
- 独立范围比对：MODIFIED 6 / ADDED 137 / MISSING 0 / OUTSIDE 0。作者的 ADDED 138 包含基线 JSON 自身；按该脚本口径复跑一致，属于计数口径差异。
- accepted 产物、原契约与预留输入未变。当前证据不能证明作者心理上“没见过”，裁定只覆盖文件隔离与已保管的期望。
- BATCH-001 范围脚本 exit=1 为已预告的代际差异，不是产品回归；不需要为了全绿改动旧脚本。
- `reports/evidence/M00.2.03/final-scope-check-batch002.txt` 未列入本卡 changed_files，属于收尾记录遗漏；本次修订一并补齐。

## 唯一阻塞：B2-R1

`selected-versions.json` 将 Hermes 的 PyPI **0.19.0** 写成安装目标，却把 source_binding 指到 `d337b736aa1e8ebecfab043842d13e4a2d2f48a3`。

独立读取该 commit 的官方 `pyproject.toml` 后，项目版本为 **0.21.4**；uvicorn、cryptography 等依赖声明与 PyPI 0.19.0 有实际差别。因此不能只称为“两套版本号，功能对应未知”并继续使用混合证据。

官方源文件：
https://raw.githubusercontent.com/NousResearch/hermes-agent/d337b736aa1e8ebecfab043842d13e4a2d2f48a3/pyproject.toml

证据已保存在 `reviews/evidence/BATCH-002/hermes-pinned-pyproject.toml` 与 `upstream-evidence.json`。其他历史候选不删除，只需从冻结组合中明确分开。

## 架构裁决

1. **E1 关闭**：Hermes 与我方服务端使用独立进程/虚拟环境。我方 pydantic 2.13.5 不注入 Hermes 环境；不在我方服务代码里直接 import Hermes。未来通过适配器接入。
2. **E2 给出唯一目标**：后续 Hermes 验证选择上面已记录并已核查许可证的不可变源码 commit（声明版本 0.21.4）。PyPI 0.19.0 只作未采用参考，不能当它的二进制/源码绑定。安装 profile 与 extras 在 M00.3.01 读取同一 commit 后决定，此次不安装、不运行、不验证账号。
3. **E3 延后**：Langfuse 尚未采用，企业目录排除；进入部署任务时再做具体功能边界检查，不阻塞目前骨架。
4. **TS 决策可保留**：6.0.3 是保守候选；生成器的 devDependency 只是选择依据，不是端到端兼容证明。真实 typecheck/构建仍须后续安装验证。
5. **新版许可证已补查**：TypeScript v6.0.3 LICENSE、npm v11.19.0 LICENSE 均 HTTP 200，且正文 SHA 与原登记的 v7.0.2 / v12.1.0 正文分别相同。无需重做许可调研；冻结卡添加对应版本的证据绑定即可。

## 接下来的最小动作

已准备 `BATCH-002-R1`，只修订 M00.2.03 及其报告、自检与证据。三张 accepted 卡只读，不再重新生成。修订后再独立复核，不启动后续开发任务。

未执行模型 API、没有新增 Agent 会话，没有修改本机 Codex/Claude Code/Hermes，也没有改动独立的 Morrow 前端预览。
