# BATCH-013 实现提交

状态：`submitted`，等待独立复核；原 156 卡 `accepted=12` 不变。本批模型/HTTP 请求 0、真实凭据读取 0。仅做离线创作底座和朴素可信工程 fixture，未设计初始产品 UI。

## 五包结果

| 包 | 已实现和实测 |
| --- | --- |
| A | `space-client/1` 经典脚本封装实际 `demo/1` 桥：验证 init、等待 active、复制快照、订阅、回执后保存、超时/关闭/撤权和不确定写冻结。实际 `BoundBridge` 定向测试通过。 |
| B | parse5/TypeScript/PostCSS 给作者原文件定位诊断；固定 SDK 与作者 JS 确定性装配，生成作者、工具、有效源码、产物和报告 hash。原 model-v1 文档/旧桥被拒。 |
| C | 作者源和有效包分开 stage/seal；不可变修订、完整操作链、CAS 编辑和恢复、严格读取与失效回执，固定根 JSON CLI。 |
| D | 有界本地修复包、过期/错误版本拒绝；旧 model-v1 只读诊断，开发者人工静态修订后保持 `model_candidate` 并封存。未执行、预览或注册。 |
| E | 手写 fixture 实走创建、编辑、检查、构建、核心封存、真实宿主模块、保存 ACK、界面切换和 undo；注入旧结果、写失败、SDK 变化和损坏回执故障。架构师接线说明已交付。 |

源码说明在 [authoring/README.md](../tests/spikes/personal-space/authoring/README.md)，接线说明在 [ui-integration.md](evidence/BATCH-013/ui-integration.md)。作者 `view.js` 始终与装配后的有效 `view.js` 分开；修复工具只修改作者源。模型后代的原始来源、旧候选 hash 与新版本回执在 [model-derivation.json](evidence/BATCH-013/model-derivation.json)。

## 验证与边界

- 本批 7 个测试文件、20 个测试通过；原核心 5 测、宿主 16 测通过。新 TS 类型检查及本地 JS 语法检查通过；CLI 子进程和实际核心 stage/seal 构建已运行。命令、退出码和逐项证据在 [结构化报告](BATCH-013.json)。
- 测试宿主只执行固定仓库手写 fixture 和可信 SDK。模型源码与其人工修订后代只解析、构建、保存；静态通过不等于功能、安全或视觉验收。
- 真实浏览器、原生隔离、正式产品 UI 视觉与真实业务服务仍为 `not_run`。初始 UI 的视觉及实现由交接方架构师负责，正式开始前须先通知用户等待其调整推理档位。
- 本地构建调试发现 SDK/作者 IIFE 拼接缺分号并已修复；jsdom 不解析 `srcdoc` 的测试接线已改为明确载入已验证 fixture。旧 BATCH-011/012 证据、账本、锁和模型候选均未修改。

收尾加固循环引用入站消息校验后，SDK 字节变化触发模型后代的重新静态构建，仍未运行。最终 88 项 manifest 复算通过，`result_ref=sha256:33aa5057b3f60fba3c5f8d6515767ccd6df1c1b63aae92bfe25cf3c6e62c16b3`。权威范围检查 PASS（modified 0 / added 2328 / missing 0 / outside 0）；旧账本/锁/model-v1 与 BATCH-013 基线哈希一致。`taskctl validate` 有效 156 卡，`next` accepted 仍为 12。

manifest、范围、历史 hash 及 taskctl 结果见 [证据目录](evidence/BATCH-013/)；开发者未写 `accepted`，批末停止。
