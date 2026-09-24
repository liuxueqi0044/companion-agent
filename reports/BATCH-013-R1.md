# BATCH-013-R1 实现提交

状态：`submitted`，等待独立复核。原 accepted 仍为 12；本批模型/HTTP 请求 0，真实凭据读取 0，未安装依赖、启动 Agent 或设计产品首页。

## 四包结果

| 包 | 本地结果 |
| --- | --- |
| A · R1-A01 | 作者及 SDK 拼接后的经典 JS 经严格 Babel script 解析；类型标注、`interface`、顶层 `return`/`await`、模块语法及坏语法被拒；作者定位与内部装配错误区分，工具 hash 绑定实际解析器入口字节。 |
| B · R1-B01 | head 指针角色、当前源码归属、build 通过状态、来源/权限/有效产物关系严格校验；损坏返回 `recovery_required`，不重置历史。失败 check 与旧合法 build 保持可读且角色明确。 |
| C · R1-C01 | 真实 `MountCoordinator.recover` + `BoundBridge` + `StableHost` 贯通 ACK 未知后的重挂、读回和再次保存；旧 ACK 不释放新写。SDK 读超时冻结，并验证限流、重复 init 与完整报文大小。 |
| D · R1-D01 | 完整可信手写 fixture 链及恢复后重新 check/build 通过；旧 BATCH-013 模型后代只读，新 R1 工作区静态重验并保留 `model_candidate`。新 manifest 和历史哈希复核通过。 |

## 验证与边界

作者工具链 7 文件 28 测、原核心 5 测、原宿主 16 测通过；完整作者 TS 类型检查和 16 个 JS 文件语法检查通过。第一次失败及最终通过日志均保留在 [证据目录](evidence/BATCH-013-R1/)。49 项成果 manifest 的 `result_ref` 为 `sha256:970c8182ef0e2e76e6f568c22a3c7662480e0c6229705fa52e80321a225fd208`；76 项旧模型、账本、锁及 BATCH-013 成果字节与本轮基线相符。权威 R1 范围检查 PASS（modified 15、added 1711、missing 0、outside 0）；`taskctl validate` 为 156 卡有效，原 accepted 仍为 12。

静态解析和构建不代表模型后代可执行、安全或产品功能已通过。只有固定仓库手写 fixture 在 jsdom 中运行；真实浏览器、原生隔离、产品视觉和真实业务服务仍为 `not_run`。初始产品 UI 由交接方架构师负责，正式设计前应按用户要求通知并等待其调整推理档位。接口细节见 [R1 接线说明](evidence/BATCH-013-R1/ui-integration.md)。

本轮提交为实现者的 `submitted`，不作独立验收结论，也不开展下一批。
