# BATCH-013 实现检查点

## A 完成（2026-09-24）

- `space-client/1` 经典脚本和私有类型接口已落盘；与实际 `BoundBridge` 的定向测试 3/3 通过。
- 覆盖真实 ready 包络、等待 active、状态副本、ACK 后保存、双写 busy、超时后冻结、重连、无读授权与字节限制。
- 下一步 B：parse5/TS/PostCSS 作者校验、结构化诊断、固定 SDK 装配及回执。之后继续 C/D/E，不在包间停留。

## B 完成（2026-09-24）

- parse5、TypeScript、PostCSS 驱动的片段/语法/外部资源/旧桥检查和定位诊断已落盘；定向测试 4/4 通过。
- 构建函数保留作者源，确定性拼接固定 SDK，分别计算作者/SDK/验证器/构建器/有效源码/产物/验证报告哈希；调用原 core 的格式与限额。
- 下一步 C：工作区不可变版本、CAS head、回执失效和 JSON CLI。

## C 完成（2026-09-24）

- 作者源和有效产物分别调用旧 core 的 stage/seal/read；head 使用完整性哈希作为 CAS token，保留不可变版本、操作链、恢复和上次成功构建引用。
- 同目录临时文件 sync+rename 更新 head；逐段 realpath/lstat 检查路径，损坏返回 `recovery_required`。窄 JSON CLI 固定生产根，测试支持注入根。
- 工作区定向测试 4/4 通过，包括并发冲突、构建失败保留旧成果、回退、损坏恢复与非法命令。
- 下一步 D：修复材料、严格应用修订、只读 model-v1 负例闭环。

## D 完成（2026-09-24）

- 修复包固定包含当前三文件、CAS head/source hash、有限诊断与 SDK 用法；过期包被拒绝，应用后旧校验失效。定向测试 2/2 通过。
- 只读读取 BATCH-012 model-v1：原文档包装/外链脚本/旧桥共 14 条静态诊断。开发者静态修订已形成新作者版本并构建封存，来源仍是 `model_candidate`；未执行、预览或注册。
- 第一次派生入口因修复包在 `check` 后更新的 head token 与旧 token 不同而拒绝；修正传参后第二次成功。保留首次遗留的修复包作为孤儿记录，不改旧证据。
- 下一步 E：可信手写 fixture 走完整链路、故障注入和架构师接口说明，最后批末统一验证。

## E 完成（2026-09-24）

- 固定仓库手写 fixture 实走 create→edit→check→build→核心封存读取→实际 `MountCoordinator`/`BoundBridge`→ACK 保存→版本切换和 undo；模型来源在装载前被拒。集成测试 2/2 通过。
- 故障注入覆盖并发期间旧 check/build 的 `stale_head`、head 发布失败保留旧指针、SDK 身份变化令旧回执失效；3/3 通过。生产固定根 JSON CLI 的真实子进程测试 1/1 通过。
- 初次集成暴露 SDK 与作者 IIFE 之间缺分号，已修正构建分隔符并增加有效 JS 解析；随后发现 jsdom 不解析 `srcdoc`，测试宿主明确写入已验证的仓库 fixture 后通过。模型后代在工具字节变化后重新静态构建，来源仍 `model_candidate`，未执行。
- README 与架构师接口交接已落盘。下一步批末统一回归、类型检查、manifest/范围与历史哈希核对并提交报告。

## 批末提交（2026-09-24）

- 本批 20/20 测试、原核心 5/5、原宿主 16/16、新 TypeScript 类型检查与 JS 语法检查均通过；CLI 真实固定根、可信 fixture 构建及静态模型后代封存已验证。
- 收尾时加固了循环引用入站消息的字节检查并补回归；SDK 字节变化后，模型后代仅重新静态构建，未执行。artifact manifest 最终 88 项；result_ref `sha256:33aa5057b3f60fba3c5f8d6515767ccd6df1c1b63aae92bfe25cf3c6e62c16b3`。历史 BATCH-011/012 账本、锁与 model-v1 字节和本批基线一致。
- 权威 BATCH-013 范围检查 PASS：modified 0 / added 2328 / missing 0 / outside 0。`taskctl validate` 有效 156 卡，`next` 仍 accepted 12。
- 报告状态 `submitted`，等待独立复核；真实模型、真实浏览器、原生隔离和产品视觉保持 `not_run`。不开展下一批。
