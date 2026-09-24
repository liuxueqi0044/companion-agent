# BATCH-013-R1 实现检查点

## A 完成（2026-09-24）

- 作者 `view.js` 和 SDK 拼接后的有效脚本统一使用已装 `@babel/parser` 的严格 `sourceType=script`、无 TS/JSX 插件/宽松顶层选项解析；TS AST 仅保留迁移提示。
- `authoring-validator/2`、`authoring-builder/2` 已更新。validator hash 绑定实际 validator、parse5、TypeScript、PostCSS、Babel 解析器入口字节；构建错误区分作者偏移与 SDK/装配内部。
- 四个独立复核负例、模块语法、坏语法与正常 async/object/comment 矩阵通过；定向 Vitest 日志见 `reports/evidence/BATCH-013-R1/a-validation-test.txt`。
- 首次运行因新证据目录尚未创建，输出重定向失败；创建授权目录后同命令通过。下一步 B：回执指针角色、归属和历史关系。

## B 完成（2026-09-24）

- `current_check` 仅接受检查记录，`current_build`/`last_good_build` 仅接受通过验证的构建记录；校验当前指针归属、作者与有效产物字节关系、来源、权限、版本及不可变 manifest。失败检查仍可保留，合法旧构建继续可读但因工具哈希变化标为过期。
- JSON 记录读取先验尺寸，再解析与核对完整性；缺失、损坏、错角色或错关联返回 `recovery_required`，不修改旧 head。新增重新封装校验和的合成逻辑损坏回归。
- 初次定向 11 测因旧测试期望“伪造 SDK 哈希仅过期”而失败，保留 `b-workspace-test.txt`；已改成真实旧回执过期和伪造关联拒绝的分离用例，定向 11 测通过，见 `b-workspace-test-final2.txt`。一次误用 Node test runner 和一次漏给局部 Vitest 配置也保留在证据目录，均不计作通过。
- 下一步 C：实际宿主恢复与 SDK 读写边界。

## C 完成（2026-09-24）

- 用实际 `MountCoordinator.recover`、`BoundBridge`、`StableHost` 和固定手写 fixture 贯通：首次写入已发生但 ACK 扣留、客户端超时冻结、SDK 单独 reconnect 等 init 超时、宿主显式恢复同版本新连接、读取已保存草稿、第二次写经真实 ACK 完成。旧频道迟到 ACK 未释放新写，写入计数无重复。
- `refresh` 新增 1–60000 整数超时校验，读超时/无效回执后冻结后续读取，直到重新连接；避免连接级 request_id 上的迟到回执充当新读。补 30/60 秒限流边界、ready 计数、重复 init、完整报文 8192 字节边界。
- 首次定向回归因测试只控制 JSDOM 时钟、未控制真实宿主时钟而失败，保留 `c-recovery-test.txt` 和定位日志；改为同时控制两端时钟后 9 测通过，见 `c-recovery-test-final.txt`。`client.d.ts` 已明确 SDK reconnect 只重置 SDK 对象，宿主须显式 recover。
- 下一步 D：整链、静态模型后代重验证、manifest、交接报告与范围检查。

## D 完成（2026-09-24）

- 作者工具链 7 文件 28 测、原核心 5 测、原宿主 16 测、完整作者 SFC/TS 类型检查及 16 个本地 JS 文件语法检查通过。新增恢复后的旧结果失效和重新 check/build 回归。
- 只读 BATCH-012 原始 hash 和 BATCH-013 当前模型后代作者源；在 R1 新工作区以相同作者 hash 重验、构建、封存，来源仍 `model_candidate`。旧工具 hash 与新 validator hash 不同，原旧回执可读但不再为 current。无模型代码执行、预览或注册。
- R1 manifest 49 项；新旧成果与历史账本哈希复核 PASS；初步权威范围检查 PASS、无越界或缺失。统一报告、最终范围复跑与 taskctl 复核收尾。

## 批末提交核对（2026-09-24）

- `result_ref=sha256:970c8182ef0e2e76e6f568c22a3c7662480e0c6229705fa52e80321a225fd208`；49 项 manifest 与 76 项冻结历史 hash 复算 PASS。
- 权威 R1 范围检查 PASS：modified 15、added 1711、missing 0、outside 0；测试临时工作区保留在本批允许的证据目录，未删除旧目录或旧成果。
- `taskctl validate` 显示 156 卡有效；`next --repo .` 显示原 accepted 仍为 12，原卡 M00.3.01 仍 `not_run`。四包统一 `submitted`，等待独立复核。
