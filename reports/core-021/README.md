# CORE-021：能力接入与搭配

日期：2026-09-27。状态：**submitted（架构师实现与自验，非独立 accepted）**。

## 完成内容

- 标准 Skill、Codex/Claude 插件中可移植组件和 MCP 配置的文本导入；识别不兼容的宿主依赖。
- 持久目录、不可变版本、默认停用、逐工具授权、版本恢复、原子启用搭配和不含私人配置的引用分享。
- 官方 MCP SDK 的真实 stdio / Streamable HTTP 链路、Schema 校验、工具定义复核、错误/取消/崩溃账本。
- 模型元数据发现 → 按需读取 Skill/工具参数 → 工具调用 → 真实回执 → 后续处理/保存文件。
- 默认界面的轻量“添加能力”入口与可信管理页；可替换界面通过公共 SDK 打开相同入口，不能自行授权。
- 使用三个原创 Skill 起步；生产依赖复制器覆盖新运行依赖及许可证。

## 验证结果

| 验证 | 实际结果 |
| --- | --- |
| `node tools/product.mjs test` | Python 全量 **232 passed**；Node 全量 **321 passed** |
| 收尾定向 Node 回归 | `capabilities.test.mjs` 7 通过、`packaging.test.mjs` 1 通过、`web.test.mjs` 1 通过；与全量有重叠，不相加 |
| 收尾 Python 回归 | `tests/product/core021` **9 passed**，包含最后追加的“停用后迟到成功不得复活”；与全量有重叠，不相加 |
| 最终 `node tools/product.mjs check` | JS 语法、47 个 Python 文件语法、Schema 一致、现有严格类型检查范围、三个真实前端构建均通过 |
| 脚本模型组合 demo | 真正启动 MCP 子进程，Node→Python→SQLite→MCP→反馈→Markdown，4 步完成，模型请求 0 |
| 真实 DeepSeek | **5 次串行模型请求、1 次实际工具调用、0 自动重试**；索引→参数定义→读取→保存→总结，全部成功 |
| 浏览器 | Skill 添加/启用、文件导入 MCP、明确连接、只读工具选择/启用、搭配保存、重开持久化、主界面 SDK 导航通过 |
| 窄屏 | 390 CSS px 视口下无横向溢出；实际截图观察，未导出独立截图文件 |
| 打包依赖 | 用真实生产复制函数复制并核对依赖闭包，在暂存目录成功 import；未重建完整邀请 ZIP |

真实工具返回虚构样本 `sample-notes`、`total=42`。已读回生成的 `sample-notes-report.md`：
正文和结构化表格均为 42，并明确说明是一次虚构样本读取、未做额外外部核对。
成果内容摘要：`23bb11e33ddc379f840242a3989c17d688e6d20fbe070c39891d8f2830f36344`。
私有运行证据、账本及数据库留在开发工作区，不随源码发布。

## 修正记录

首次定向 Node 检查发现两个接线问题：Windows 环境变量大小写覆盖导致测试子进程启动失败，
以及旧 session 的固定能力白名单漏了新动作。均修正后回归通过。
打包检查首次因为 Python 中存在同名 tools 导入路径而失败，改为按本工作区绝对文件执行生产复制函数后通过。
浏览器的鼠标自动化操作未改变焦点，检查可见状态后改用正常键盘交互完成验证；没有把无效点击算作通过。
真实 DeepSeek 没有失败、重试或第二次 live 运行。

## 范围与未完成项

- 首版实际支持 **Skill 与 MCP 的只读工具**；不是所有 Codex/Claude 插件无差别兼容。
- 自动依赖安装、OAuth、MCP Apps、写入型工具、hooks/subagents 等专属运行时、公共市场与远程自动下载未实现。
- 只读声明及独立 home 不是 OS 沙箱。当前接入假设用户明确信任所连接的本地/远程服务。
- 真实模型只验证了上述样本链；没有验证所有社区插件、所有模型或全部复杂任务。
- CORE-019 旧安装包未重建、未公开发布；Git 镜像和仓库未推送。本次功能在源码运行版中可用。
- 没有使用 OpenAI/Codex/Claude Code 账户、额外助手会话或真实用户任务数据；既有 DeepSeek 加密凭据只在明确 live 检查中读取。

架构与复用依据：`docs/development/CORE-021.md`。操作指南：`docs/product/CAPABILITIES.md`。


## Source publication update (2026-09-28)

The above is the historical implementation report. This source mirror now
includes CORE-021; publication.json records this separate synchronization and
offline revalidation. Original local manifest hashes cover a broader development
profile and are not a claim that every local file is present in this mirror.
Published-file digests are in artifacts.json. The default build remains the
existing invitation profile, with only the CORE-021 dependency-copy changes
ported into the packager. No live provider verification is repeated.
