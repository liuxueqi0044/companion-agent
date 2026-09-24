请在 `C:\Users\xiayu\Documents\Codex\companion-agent-core` 开发CORE-004。

先读AGENTS.md、docs/handoff/CURRENT-TASK.md、reviews/CORE-003.md，然后读docs/handoff/CORE-004.md、docs/handoff/core-004/runner-contract.md和同目录scope.json/baseline.json。CORE-003已由架构师复核并补丁；当前17项成果见reports/core-003-architect/final-artifacts.json，不能用旧submitted manifest回滚。

连续完成A→B→C→D→E五包：可信模型端口与执行槽；带ticket的窄生成失败接口；turn到真实本地工具的执行链；停止/只读核对和可选应用接线；真实组合演示及回归。每包记录checkpoint后继续，全部结束统一submitted。

复用现有host/session/kernel/worker/应用控制器。重点处理同步重入、timeout不等于provider结束、旧ticket失效、accept协议成功但业务context_changed、未知写入不能自动重放、停止不等于worker退出。

只用测试/演示显式注入的合成provider。真实模型/HTTP/凭据读取、额外会话/子代理、安装、Git/推送/部署、生成代码执行均为0。初始视觉UI由架构师负责，不写页面/CSS/主题。原companion-agent、旧报告/评审/数据只读，写权限以本批scope为准。

使用现有运行时与全新测试根，Python -I -B并验证源码根。包内问题自行修复；真实范围外阻塞保留最小反例交架构师。最后写reports/core-004/的submitted报告、manifest、checkpoint和实际证据，复跑新旧回归/Schema/演示/范围检查，不自写accepted、不进入CORE-005。

请直接开始检查与实现，连续完成五包。
