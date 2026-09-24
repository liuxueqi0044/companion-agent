# CORE-011 · 整套界面可替换的第一条完整链路

状态：架构负责人实现并自验，submitted；没有独立 accepted。本轮不增加 Agent 或模型会话，不发送外部模型请求，不安装依赖。原工作区只读。

## 产品行为

默认 Morrow 界面现在是一个普通源码包。它的 Vue、样式、聊天入口、导航和任务展示全部运行在与自定义包相同的 SDK 与 frame 契约下。可信父页面只有装载、授权、连接和恢复职责；没有永久顶栏或输入框。代码作者可以完全移除或重排默认控件。

当前流程：默认界面「改变这里」→ 独立 `/recover` → 导出当前多文件源码 JSON → 由代码作者修改 → 导入、构建 → 演示数据预览 → 用户信任源码并启用 → 整个根界面替换。版本回退和恢复默认均在独立页面。即使自定义 UI 没有恢复按钮，地址栏打开 `/recover` 仍可恢复。

测试工作台仅在 tests 与隔离数据根中，不作为产品模板。普通聊天尚不能自动把一句改版要求转交 Coding Agent。旧三文件首页生成器与历史版本保留在原数据根，未删除或伪装成完整 UI 包；新默认 UI 不再把它作为首页换装入口。

## 模块与边界

| 模块 | 责任 | 关键约束 |
|---|---|---|
| runtime/resources.mjs | 按会话、turn、task、attempt 读取与操作 | 不修改页面选择；校验 turn→task 归属与 attempt；过滤票据和原始工具输入 |
| runtime/index.mjs | 共享执行槽与资源型开始/停止 | 停止匹配 turnId + runId；拥有权保留到真实清理完成 |
| interface/session.mjs | 每个装载实例自己的视图适配 | 导航、列表和管理选择不跨界面共享；销毁视图不销毁 runtime |
| interface/builder.mjs | 多文件源码构建 | 复用 Vite 底层 Rolldown 1.2.9 和 Vue；内存文件白名单；不加载作者配置、插件、依赖或 Node 模块 |
| interface/service.mjs | 哈希封存、预览、授权、启用/回退、草稿 | SHA256；版本 CAS；旧 mount 撤销；接受的草稿写入先落盘再切换 |
| interface-sdk.mjs / .d.ts | morrow.ui/1 浏览器接口 | MessagePort；无 API 密钥、服务 token、原始 host 或任意 IPC |
| interface-host.mjs / shell.mjs | 可信父页与空根容器 | source + null origin + mount ID 绑定；重新导航使桥失效；撤销 UI 不取消任务 |
| recovery.* | 独立管理和恢复 | 自定义包无法通过 SDK 启用自己、改授权、安装包或更换根界面 |

Python/SQLite、turn/contact runner、执行 lease、计算器和 DeepSeek provider 不重做。沿用旧 store 的不可变版本、同卷原子更新、逐段 reparse-point 检查原则；新通用包使用单个封存 JSON，避免把三文件限制硬塞进多模块源码。历史 store 未改。

## 公共 SDK

源码中 `import {createClient} from '@morrow/sdk'`；Vue 使用 `import {...} from 'vue'`。支持 JS/TS 模块和独立 CSS，允许相对子目录，禁止磁盘路径、网络模块和未知依赖。最多 100 文件、单文件 256 KiB、总源码 2 MiB。这是当前资源上限，不是布局限制。暂不支持 `.vue` SFC、作者插件、npm 安装或外部资源。

`createClient({onSnapshot,onConnection})` 后 `await client.start()`：

| 接口 | 输入/返回要点 |
|---|---|
| conversation.list | `{before?,limit?}`；有 cursor 的页面 |
| conversation.turns | `{conversationId,before?,limit?}`；读取不会清空界面选择 |
| conversation.get | `{turnId}`；经过投影的完整 turn |
| conversation.send | `{command_id,conversation_id,text,csv_text?,temporary?}`；复用提交去重和串行执行 |
| tasks.get / tasks.result | `{turnId,taskId,attemptId}`；校验归属/代次；result 当前为首批最多 50 行和 50 问题 |
| tasks.stop | `{turnId,runId}`；停止明确指定且仍属于 runtime 的运行 |
| subscribe | epoch/revision 快照；view.execution 独立于页面，view.runtime 是共享状态 |
| draft.read / write | `{revision,value}` / `{expectedRevision,value}`；跨包共享对话草稿，需 conversation scope |
| state.read / write | 同样的 CAS 形式；按包 id 分开的 UI 状态 |
| host.openRecovery | 独立恢复页；预览不能跳出或开启真实操作 |

`client.call()` 保留窄白名单供默认 UI 兼容：open/refresh、conversation.list/turns、send.cancel/reconcile、work.start/local/stop/reconcile、result.open/rows、policy.memory/contact、memory.refresh/add/edit/forget/clear、inbox.read/explain、reminders.create/cancel。不是通用 RPC，未列出的 host/运行时/界面管理命令拒绝。固定 panel 仅在每个实例的默认视图适配层，新资源接口不要求 panel/selection。

包申请 conversation/tasks/memory/preferences/inbox/reminders scopes；可信恢复页一次性确认包和能力，日常按钮不增加逐次授权。conversation 包含对话内容和发送，tasks 包含任务读取/操作；对话中已有的任务摘要仍属于对话投影。当前为单人本地产品，不是多租户授权系统。

## 生命周期与持久化

- runtime.createView 仅创建视图控制器，不创建第二套 runner；异步 host 操作仍计入 runtime 清理等待。
- 导航、读取两个任务和选择记忆不改变其他视图。默认 UI 管理动作在本实例串行保护。
- 激活/恢复只改界面指针。旧桥撤销后，晚到命令返回 interface_revoked；已经发出的任务继续由共享 runtime 持有。
- 接受的草稿写入通过同一队列落盘，激活在队列设置撤销屏障。CAS 冲突不覆盖其他更新。网络中断时不承诺未确认的输入已保存；默认 UI 保留当前文本并提示冲突。
- mount 按浏览器 client id 重装回收；并发装载核对版本/代次，旧装载不能跨过新激活恢复权限。
- 版本/草稿 JSON 损坏保留原字节，默认 UI 可打开；记录只读降级，不静默重置覆盖。离线修复未实现。
- `.product-data/personal-space/interfaces/` 保存 revisions、原子 state.json 与 ui-state.json。界面状态不进入长期记忆；测试使用新的 `.test-data` 根。

## 验证与限制

真实本地 Node→Python→SQLite→CSV 覆盖：两个界面独立选择；读取两个任务结果；拒绝错误 task/attempt/run；另一视图停止正确运行；卸载发起者后任务完成；重复重装；跨包和进程重开保留草稿；撤销旧 mount；损坏包恢复与记录保留。

浏览器使用虚构数据与离线 responder，验证默认聊天/思考、记忆写入、完整工作台替换、多行草稿、工作台发送与收到回应、恢复默认后对话/记忆仍在。不重复发起付费模型请求。

iframe 为 opaque origin，CSP 限制脚本、fetch、资源与嵌入，私有数据通过授权窄桥。**不等于原生级敌对代码沙箱**：不能承诺阻止所有自身导航泄露或无限循环/资源消耗。因此当前只启用用户信任的源码，不定位为任意社区代码市场。SDK 握手证明存活，不证明所有交互正确或源码安全。

下一阶段：完整 UI 作者工具（源码/SDK、修改、错误反馈、预览交接）→ Windows 原生窗口/托盘/恢复及资源隔离 → 更细资源订阅、独立结果分页、社区与分发。原生小精灵、后台常驻、TTS、官方 Coding Agent 接入仍未完成。
