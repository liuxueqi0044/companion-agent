# BATCH-008 · Codex 官方执行器离线协议准备

状态：**submitted，等待交接方独立复核**。派工 `docs/handoff/BATCH-008.md`；基线 `sha256:a0ad4c458a35ae950121e84d0a87c0f6d498ba664685d89a861499948204d689`。累计 accepted 仍为 12；本批不写 reviews/ 或 accepted。

## 五步结果

1. 官方当前 App Server 文档与固定 `0.156.0` / `rust-v0.156.0` / `fe74a774532af67b5a4a3dec03ce9469e17f89af` 的公开生成类型和 RPC 源码核对。`source-index.json` 列 33 份 URL、抓取时间、哈希、能力；当前文档不作为固定版字段证据。
2. `tests/spikes/codex_connection.ts` 只接受 `--plan` 和两份固定 synthetic fixture 的 `--replay`。导入无副作用；`--live` 返回使用错误码 2。
3. `tests/spikes/codex_protocol.ts` 对已解码消息做纯投影。RPC ID、thread ID、turn ID 分开校验；原生完成不升格产品完成；取消 RPC 确认不算退出；审批不自动同意；账号/额度仅白名单字段，未知金额为 null，已知 0 保持 0。
4. 精确 Vitest 文件 8 测通过，严格 TypeScript 退出 0。计划、正常/损坏 fixture 回放、非法参数与导入守卫均实际运行。合成回执明确标为 synthetic。
5. `docs/evidence/codex-live-runbook.md` 给出将来获独立授权后的一次串行试验和停止条件。**本批未执行真实接入。**

## 验收边界与证据

准备检查 B8-P01..P05 由实现方提交通过证据；原任务 `M00.5.01-A01`、`A02`、`A03` 均为 **not_run**。没有启动官方 Agent、登录、读取凭据/账号/额度或调用模型。账号、付费路径、真实取消/断连/审批和成果均待真实试验；不能用离线消息替代。

成果 manifest 为 `reports/evidence/M00.5.01/artifact-manifest.json`，SHA-256 `ccbfb0cd5486827aacd0a234946b0d5884d056ade73dca5fb24967a5a371df0b`，绑定 44 项代码、资料、fixture 与来源原件；报告、日志、生成依赖及 manifest 自身不计。运行日志、范围检查、哈希复算和 taskctl 结果见同一证据目录。原任务报告为 `reports/M00.5.01.json`。
