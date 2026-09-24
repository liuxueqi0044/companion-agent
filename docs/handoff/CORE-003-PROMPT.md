继续在 `C:\Users\xiayu\Documents\Codex\companion-agent-core` 开发 CORE-003。这是独立核心工作区，不是原 companion-agent 的批次。

先读根 AGENTS.md、docs/handoff/CURRENT-TASK.md、reviews/CORE-002-R1.md，再读 docs/handoff/CORE-003.md、docs/handoff/core-003/application-contract.md、scope.json 和 baseline.json。上一轮已由架构师复核并补丁，当前有效15项成果见 reports/core-002-r1-architect/final-artifacts.json；不要按旧 submitted manifest 回滚补丁。

本轮一次连续完成 A→B→C→D→E 五包：共享控制基础与政策CAS；记忆管理；收件箱与显式提醒；真实任务活动/结果投影；组合应用入口、真实Node→Python→SQLite演示与全量回归。每包记checkpoint后继续，全部完成后统一提交，不逐包等待确认。

目标是交付前端能直接调用的无视觉应用层，复用既有host/session/Python服务。生产新代码只放 apps/desktop/product/application/；初始视觉UI仍由架构师负责，你不写页面、CSS、主题、角色或桌面壳。不要顺手重写旧业务、host/session、数据库或依赖。精确写权限以本批scope.json为准。

重点认真实现：同一操作单飞且防同步订阅重入、选择/分页/写入的乱序屏障、CAS冲突不自动覆盖、未知回执不冒充成功、非幂等memory.add不自动重发、提醒稳定command_id显式重放、真实任务状态不由模型文本推断、主动消息默认关闭且普通界面不预告计划。

使用现有本地运行时，Python -I -B并验证导入本工作区，测试只建新根。模型/HTTP/凭据读取、额外会话/子代理、安装、Git/推送/部署、生成代码运行均为0；原 companion-agent 和历史报告/评审/数据库只读。无视觉截图、真实模型和后台常驻验收，不得虚报。

完成后写 reports/core-003/report.json(status=submitted)、summary、checkpoint、artifact-manifest与实际证据，复跑新旧定向测试、Schema、新旧演示、manifest及本批scope。所有失败/跳过/not_run如实记录，不自写accepted，不展开CORE-004。若遇到只能越界修改才能解决的具体缺陷，保留最小反例和阻塞说明，由架构师接手；普通包内问题自行修复后继续。

请直接开始检查和实现，连续完成五包。
