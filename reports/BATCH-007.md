# BATCH-007 · 可替换 Vue 工作台小样

状态：**submitted，等待交接方独立复核**。唯一产品目录 `C:\Users\xiayu\Documents\Codex\companion-agent`。派工 `docs/handoff/BATCH-007.md`，基线 `sha256:4f0148662c13bc66c2726c11e9448dd15c909d18d0b4dde5b651d86718d79339`。累计 accepted 仍为 12；本批未写 reviews/ 或 accepted。

## 交付

M00.4.02 交付独立 Vue 3 + TypeScript 单页工作台，入口在 `tests/spikes/ui-preview.html`。它沿用此前原创暖白/绿灰/陶土配色和花朵几何 SVG，零 AIRI 代码/素材。数据入口是纯 `DemoAdapter` 固定虚构样本，不接真实 API、IPC、Hermes、模型、账号或记忆。页面展示任务、明细、来源与待确认项，可切换样例、本地修订运输单价、原值/新值和重置。

金额以整数分计算，未知价格与明确零价分开；USD/EUR 独立展示，缺失或冲突时不伪造完整总额。运行、取消请求、已退出 fixture、断连待核对、完成 fixture 和 loading/empty/error 均注明演示。取消按钮只进入 `cancelling`。完成仅限有三行确定性金额及含税输入依据的完整样本。

## 实际验证

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 局部生产 build、严格 TS 模型/入口检查 | 0 / 0 | `reports/evidence/M00.4.02/B7-ui-build.txt`、`B7-ui-typecheck.txt` |
| 生产 bundle 的 DOM 行为 | 0，6 组行为通过 | `reports/evidence/M00.4.02/B7-ui-dom.txt` |
| 原桌面 build/typecheck | 0 / 0，根依赖哈希不变 | `reports/evidence/M00.4.02/B7-root-build.txt`、`B7-root-typecheck.txt`、`B7-isolation.txt` |
| 任务卡通用自动验证入口 | 3 / `not_run`（manual 卡） | `reports/evidence/M00.4.02/B7-verify-task.txt` |
| 真实浏览器页面 | 1440×900、390×844、320px 已观察，无页面整体横向溢出 | `reports/evidence/M00.4.02/visual-observation.json`；工具内截图未落盘 |

浏览器拒绝唯一一次本地截图保存接收页访问，返回 `net::ERR_BLOCKED_BY_CLIENT`。没有更换协议、浏览器或工具重试，也没有重访先前被拒的原型页面。故桌面和窄屏的**持久截图文件缺失**，列为 unresolved；不能把 DOM 回归或浏览器内观察替代截图验收。原桌面仍只有 renderer 构建骨架，未验证 Electron 原生窗口。

本卡三个原验收项的实现方证据写于 `reports/M00.4.02.json`：隔离入口与无底座反向引用、无需 AIRI 服务可显示、本地演示状态没有第二套会话/记忆。是否 accepted 由交接方独立判断。

成果 manifest 为 `reports/evidence/M00.4.02/artifact-manifest.json`，SHA-256 `49096c1308e85e4547e212255c5bb295cf51811d478e71aaada9202a6e595524`，覆盖 14 项源文件/必要测试/依赖选型/视觉观察；报告、日志、node_modules、dist 与 manifest 自身不计入。范围检查和 taskctl 结果见同一证据目录的 `B7-final-scope.txt`、`B7-hash-check.txt`、`B7-taskctl-validate.txt`、`B7-taskctl-next.txt`。
