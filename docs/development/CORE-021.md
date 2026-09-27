# CORE-021：可组合能力的首个可执行闭环

工作区：`companion-agent-core`。原 donor、历史证据、旧安装包与 Git 发布副本保持不变。
本轮实现 CAP-01 至 CAP-04 的限定范围：导入、版本目录、标准工具调用、模型发现、可信管理页、搭配与引用分享。
CAP-05 专属宿主适配、公共市场、自动依赖安装和广泛社区插件认证未实现。

## 模块与边界

| 模块 | 输入 / 输出 | 权限与验收 |
| --- | --- | --- |
| `capabilities/importer.mjs` | 文本文件清单 → 标准化组件、缺项、不可变版本摘要 | 数据解析不执行插件；拒绝路径穿越、重复大小写路径、YAML 别名、明文凭据；标记脚本及专属宿主依赖 |
| `services/product/capabilities.py` | 私有宿主命令 → SQLite 目录、版本、工具授权、搭配、调用账本 | 默认停用；CAS 修订；更新暂存；切换版本停用；原子启用搭配；模型没有管理权限 |
| `capabilities/mcp.mjs` | 明确信任的连接 + 已授权工具描述 + 参数 → 实际回执 | 官方 SDK，stdio / Streamable HTTP；逐次比对工具定义、JSON Schema 校验、有限输出、取消和进程关闭；无自动请求重试 |
| `capabilities/service.mjs` | 管理命令 / ready action → 持久记录与 transport | 外部调用前 claim，实际关闭后 finish；失败与未知分开；停用可中止本进程拥有的调用 |
| kernel / runner / provider | 能力元数据 → 模型按需描述/调用 → 后续判断 | 使用原串行执行槽；公开回执、artifact、目标工作者可复用；不继承全局 Coding Agent 插件 |
| `/capabilities` | 用户导入、连接、授权、版本、搭配操作 | 可信顶层页面；iframe SDK 只有打开入口；无 install/connect/grant 指令下放给作者代码 |

## 持久语义

新增五个私有表：`cap_packages`、`cap_versions`、`cap_connections`、`cap_calls`、`cap_sets`。
沿用既有 product store、事务和目录校验。版本摘要覆盖源文件摘要和适配后的有效定义；适配器语义变化生成新版本，不继承旧权限。

调用顺序：

1. Python 验证 turn/action 归属、最新会话、当前包版本、启用状态及工具允许列表。
2. 在同一事务写入调用 token 与 `outcome_unknown`，然后才允许 Node 离开事务联系服务。
3. 官方 MCP 客户端重新连接、发现工具，比较定义并校验参数。发送后无响应属于 unknown。
4. 关闭连接并确认拥有的 stdio 进程退出后写入回执；token、turn、action 必须完全一致。
5. 既有 kernel 汇总动作状态，workflow 给下一步模型提供真实结果。停止、停用或版本变更获胜时，迟到结果标为 blocked。
6. 崩溃恢复把 running 调用保留为 unknown；没有自动补发路径。该 turn 可停止，不能把未确认执行当成功。

模型动作：`capability.describe(package_id,version,component,tool?,resource?)` 与
`capability.call(package_id,version,component,tool,arguments)`。元数据按需注入，不把所有 Skill 全文塞进每次上下文。
描述 Skill 返回正文及参考文件名；读取参考文件须再次指明。MCP 首次描述返回工具索引，指明工具才返回输入 Schema。

限制：导入源文本 192 KiB / 100 文件；组件 32；存储目录 100 包；启用模型元数据 16 KiB；
单 Skill 正文 16 KiB、参考材料合计 24 KiB；工具最多 64、目录 64 KiB；参数与单次回执各 24 KiB；
MCP 传输消息 256 KiB、默认连接/调用总时限 20 秒。超过限制会显式失败，不静默伪造完整结果。

## 复用与协议范围

- [`@modelcontextprotocol/client` / `server` 2.1.0](https://github.com/modelcontextprotocol/typescript-sdk)，MIT。client 为运行依赖，server 仅作本地协议夹具。
- [`yaml` 2.9.1](https://eemeli.org/yaml/)，ISC；严格解析 frontmatter，禁用别名展开。
- [`ajv` 8.17.1](https://ajv.js.org/)，MIT；同步校验已发现工具的输入，不解析外部 `$ref`，不替用户补参数。
- [Agent Skills](https://agentskills.io/specification)、[Claude 插件规范](https://code.claude.com/docs/en/plugins-reference)、[Codex 插件构建](https://developers.openai.com/plugins/build/plugins) 对应适配器。

SDK v2 使用显式 legacy 模式，保持 2025 MCP initialize/list/call 兼容路径；不启用 auto 探测的额外 stdio 进程。
不声明 sampling、roots 或 elicitation，不提供账户登录，不运行接收到的任意代码。
HTTP 拒绝重定向，避免凭据被带到另一地址。凭据只解析 `MORROW_PLUGIN_` 引用。
stdio 覆盖 SDK 继承的 home/config 环境路径，使用独立工作目录；这不阻止可信本地程序主动读取本机其他文件，不是 OS 沙箱。

## 验证

`tests/product/core021` 覆盖标准包与不兼容项、真实 SDK stdio/HTTP、输入校验、工具定义漂移、错误/超大输出、
取消和真实进程关闭、重定向、运行时执行槽、Node→Python→SQLite→MCP→artifact 完整链、iframe 无法授权、版本与原子搭配。
打包测试调用真实生产依赖复制函数，核对完整依赖闭包与运行 import。
生产打包器现从本源码安装目录带入新依赖及许可文件；此轮没有重建/发布旧邀请包。

真实 DeepSeek 检查使用虚构样本：模型自主描述工具索引、加载参数定义、调用 read_note，得到 42，保存 Markdown 后作结。
结果与请求数见 `reports/core-021/README.md`。单个成功例不代表所有社区插件或任意任务都已验证。
