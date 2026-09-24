# 当前状态：CORE-011 完整界面替换基础已实现

首先阅读 docs/decisions/ADR-009-replaceable-interface-shell.md 和 docs/development/CORE-011.md。用户需要 AI 深度改写全部 UI；默认 UI 是初始源码包。不要回到模板目录或仅首页换装方向。

工作区：C:\Users\xiayu\Documents\Codex\companion-agent-core。原 companion-agent 只读。发布副本 companion-agent-github。无额外 Agent、模型会话或 OpenAI 调用。

本轮：资源接口和页面选择解耦；每个界面独立 view session；共享一个执行 runtime；默认 UI 和完整替换包均走 morrow.ui/1；复用 Rolldown 构建多文件源码；窄桥、虚构数据预览、可信启用、版本回退、跨包草稿、独立恢复页。旧包不能通过 SDK 扩权或启用自己。旧画布版本保留，未自动转成完整包。

本地 http://127.0.0.1:51794/，独立恢复入口 /recover，默认“改变这里”也进入此页。从恢复页导出源码/导入修改；尚未把一句自然语言改版交给作者 Agent。原生小精灵、社区敌对代码隔离、后台常驻仍待做。

报告 reports/core-011/report.json：submitted / architect_implemented_and_self_verified，不修改历史 accepted。旧 runtime/application 冻结文件的本次改动由用户的 ADR-009 实施授权覆盖；不要伪造其仍符合旧哈希，不改写旧报告。

验证使用新的 .test-data 根；原业务数据库与模型请求日志在升级前后核对。启动：pwsh -File tools/start_personal_space.ps1 -DeepSeek。串行调用、无自动重试；本轮无外部模型 HTTP 请求。凭据只在服务端私有管道使用，不交给界面。

下一阶段优先接完整 UI 作者工具链及 SDK 文档反馈，不再投入首页装饰生成器。当前包支持 ESM JS/TS、Vue runtime、CSS，不加载作者构建配置、不安装依赖、不在 Node 执行作者代码。敌对代码网络/资源隔离须完成原生载体，不能把 iframe 测试当原生验收。
