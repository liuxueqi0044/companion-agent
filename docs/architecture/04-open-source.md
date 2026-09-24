# 开源复用清单与采用边界

核查日期：2026-09-23。仓库许可证与供应商服务条款是两回事；下表的许可指核查到的主仓库或指定部分，不自动覆盖模型权重、素材、插件、间接依赖及托管服务。版本在 M00 接入验证后固定，不能直接把当前 main 用于生产。

“直接依赖”不代表无需集成；“适配”指只补产品接口，不重写上游核心循环。链接均指向项目或官方文档。具体查询记录见 [source-audit.json](source-audit.json)。

## 首版采用

| 项目 / 许可范围 | 复用内容 | 我们仍要完成的工作 | 模块 |
| --- | --- | --- | --- |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) · MIT | 主控运行、会话、记忆、Skills、委派、目标、定时任务 | API 适配、用户隔离、状态投影、产品权限；先做嵌入验证 | M03 / M06 / M07 / M08 |
| [Codex](https://github.com/openai/codex) · Apache-2.0 | 工程执行循环、App Server、SDK、工具与会话 | 任务简报、成果回收、取消映射、费用归属与隔离 | M04 / M07 |
| [Electron](https://github.com/electron/electron) · MIT | 桌面窗口、托盘、通知、系统桥接 | 桌面体验、权限桥、签名与更新；按[安全文档](https://www.electronjs.org/docs/latest/tutorial/security)配置 | M01 / M04 / M11 |
| [Vue](https://github.com/vuejs/core) · MIT | UI 响应式与组件系统 | 品牌界面、任务与成果交互 | M01 |
| [AIRI](https://github.com/moeru-ai/airi) · MIT 主代码 | 选取角色、音频或桌面交互的合适实现 | 先验证组件抽取；保留来源，按依赖范围移植；不整套叠加其后端 | M00 / M01 / M09 |
| [shadcn-vue](https://github.com/unovue/shadcn-vue) · MIT | 常见界面控件 | 设计变量、状态样式、无障碍与交互一致性 | M01 |
| [VueUse](https://github.com/vueuse/vueuse) · MIT | 常见 Vue 交互与状态辅助 | 仅选择实际需要的组合函数 | M01 |
| [JSON Forms](https://github.com/eclipsesource/jsonforms) · MIT | 根据 JSON Schema 渲染功能输入表单 | 注册可信业务控件、文件选择、校验和结果卡；不执行模型生成的任意 JS | M01 / M07 |
| [FastAPI](https://github.com/fastapi/fastapi) · MIT | HTTP 服务与接口文档 | 身份映射、任务服务、事件流、配额 | M02 |
| [Pydantic](https://github.com/pydantic/pydantic) · MIT | 数据验证与 Schema | 产品数据契约和版本兼容 | M00 / M02 |
| [json-schema-to-typescript](https://github.com/bcherny/json-schema-to-typescript) · MIT | 从导出的 JSON Schema 生成 TypeScript 声明 | 锁定与 Node 兼容的版本；单一来源生成，避免前后端手写两套类型 | M00 |
| [Supabase](https://github.com/supabase/supabase) · 主仓库 Apache-2.0，组件分别核查 | Auth、PostgreSQL、Storage | 表结构、RLS、备份、配额；托管服务另行付费 | M02 / M10 / M11 |
| [PGMQ](https://github.com/pgmq/pgmq) · PostgreSQL License | PostgreSQL 持久消息队列；可经 [Supabase Queues](https://supabase.com/docs/guides/queues)使用 | 幂等消费者、重试/死信、设备任务到期和通知投递 | M02 / M04 / M08 |
| [E2B](https://github.com/e2b-dev/E2B) · Apache-2.0 | 沙箱 SDK、隔离执行与文件交接；先托管 | Hermes 工具适配、生命周期、预算、成果导出；不是已验证的原生直连 | M05 |
| [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk) · MIT | 标准工具/资源协议 | 本产品工具的身份、权限、错误及成果包装 | M05 |
| [Langfuse](https://github.com/langfuse/langfuse) · 社区部分 MIT，ee 另有条款 | Trace、模型调用观测、评价与费用展示 | 脱敏、版本关联、采样和成本校对；只采用已核实的社区功能 | M10 / M11 |

根许可重点核查入口：[JSON Forms LICENSE](https://github.com/eclipsesource/jsonforms/blob/master/LICENSE)、[PGMQ LICENSE](https://github.com/pgmq/pgmq/blob/main/LICENSE)、[Langfuse LICENSE](https://github.com/langfuse/langfuse/blob/main/LICENSE)。Langfuse 的 `ee`、`web/src/ee`、`worker/src/ee` 等企业范围不应被误列为统一 MIT。

Hermes 本轮查看提交：`7ce190446e548e2e1c0ae6ba0225be0490d12fc2`。AIRI 本轮查看提交：`308ee2b3aa8587262aa7a458d5d68407cb5f2342`。这是调研定位，不是推荐永久锁死的部署版本。AIRI 桌面包存在多个仓库内依赖，抽取成本以 M00.4 的实际构建结果决定。

## 按需采用，避免一次全装

| 项目 | 用途与进入条件 | 许可 / 限制 |
| --- | --- | --- |
| [Playwright MCP](https://github.com/microsoft/playwright-mcp) | Hermes 已有浏览器驱动不能满足测试需求时采用；每个任务只使用一个浏览器驱动 | Apache-2.0 |
| [agent-browser](https://github.com/vercel-labs/agent-browser) | Hermes 可复用的浏览器执行选项之一，先检查底座已有接入 | Apache-2.0；真实账号状态另外隔离 |
| [Docling](https://github.com/docling-project/docling) | 用户样本需要复杂 PDF/文档结构提取时加入；首个 CSV 样例不必依赖重解析栈 | 代码 MIT；模型和附属资产分别核查 |
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper) | 按住说话的识别候选，以目标语言和硬件测试决定 | MIT；模型分发与依赖另查 |
| [Kokoro](https://github.com/hexgrad/kokoro) | 短 TTS 候选，先验证市场所需语言和音色 | 仓库 Apache-2.0；声音资产与 G2P 等依赖逐项核查 |
| [Pipecat](https://github.com/pipecat-ai/pipecat) | 持续语音、多模态实时管线需要时，与 LiveKit Agents 二选一 | BSD-2-Clause |
| [LiveKit Agents](https://github.com/livekit/agents) | 需要实时音视频会话、打断与房间能力时评估 | Apache-2.0；托管服务收费独立 |
| [ACP](https://github.com/agentclientprotocol/agent-client-protocol) | 接第三种 Agent 时减少重复适配；先做原生两种验证 | Apache-2.0 协议仓库；每个适配器单独核查 |
| [Codex ACP](https://github.com/agentclientprotocol/codex-acp) | 将 Codex 接到 ACP 客户端的现成候选，避免自制同类桥 | 本轮核对了功能说明；采用前读取所选版本的完整许可与依赖 |
| [E2B runtime](https://github.com/e2b-dev/runtime) | 用量及运维能力证明自托管有价值后再评估 | Apache-2.0；公开 runtime 不等于生产平台一键免维护 |
| [gVisor](https://github.com/google/gvisor) | 后续自托管执行边界的备选组件 | Apache-2.0；不能与 Firecracker 的隔离性质混为一谈 |

### 官方集成，但不能统一算作我们的开源底座

[Claude Code](https://code.claude.com/docs/en/agent-sdk/overview) 是可连接的官方执行器。其产品许可与认证规则见[联动方案](06-agent-connections.md)，不能因为有 SDK、公开仓库或可安装程序便把整个 Claude Code 称为 MIT 开源引擎。无需 fork 它，连接未修改的官方程序即可验证产品价值。

## 备选与暂缓

| 选项 | 决策理由 |
| --- | --- |
| [DeepAgents](https://github.com/langchain-ai/deepagents) · MIT | 如果 Hermes 的嵌入/隔离成本超过收益，作为 SDK 路线候选；不在 Hermes 之下再加一个主控循环 |
| [DeerFlow](https://github.com/bytedance/deer-flow) · MIT | 参考完整工作台、沙箱和技能体验；不同时部署为第二套主平台 |
| [Daytona](https://github.com/daytonaio/daytona) | 当前仓库说明核心已在 2026 年 6 月转为私有开发，公开版本不再持续更新；不选作本方案长期自托管开源核心。其托管产品另当别论 |
| 额外长期记忆框架 / 独立向量数据库 | 先测 Hermes 记忆及历史检索的实际不足，再决定替换或扩展；避免多份用户事实互相矛盾 |
| 通用拖拽工作流编辑器 | 首版用户无需理解编排；由模型提出功能、用户选择输入并使用。以后有明确编辑需求再集成 |
| 完整技能市场 / 多 Agent 广场 | 在自用技能复用价值成立后再做；早期先确保一个技能真的重复成功 |
| Kubernetes / 多区域平台 | 小规模先用有限运行单元和托管基础服务，测到瓶颈后再扩展 |

## 我们应该自己写的部分

1. 统一的伙伴界面：聊天、任务、记忆、功能、成果与连接设置。
2. 薄适配层：身份映射、运行事件转换、外部 Agent 连接和沙箱交接。
3. 工作改进体验：把用户纠正转成可理解的建议、验证样例和可重复功能。
4. 产品状态与控制：技能版本、权限记录、费用归属、通知偏好、离线与恢复。

不自行开发通用模型工具循环、浏览器引擎、语音识别模型、数据库、队列、容器隔离层或表单引擎。也不因为有开源代码就把用户体验强行迁就其演示 UI。

## 版本和发布要求

每个采用的组件登记：准确来源、版本/提交、许可文件、NOTICE、间接依赖、构建产物及本地补丁。角色模型、字体、图片和声音单独登记；AIRI 主仓库的 MIT 不自动授权任意 Live2D/VRM 素材或 SDK。

上游更新先进入兼容性环境，跑任务创建、权限、事件转换、成果、取消和恢复测试，再推广到内测。模型生成的新依赖也进入相同记录。开源复用减少实现工作，但仍需承担版本适配和运行质量责任。
