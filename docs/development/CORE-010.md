# CORE-010：AI 为你编写首页

本阶段实现自由代码首页的产品闭环，状态为 `submitted / architect_implemented_and_self_verified`，没有冒充独立 accepted。初始视觉与本次交互由架构负责人实现，没有另开 Agent 或调用 OpenAI。

## 用户体验

首页右上角叶子「改变这里」，或「我的 AI → 改变这里」进入同一面板。

1. 用户用自然语言描述想要的空间。首次生成无需选模板，之后可以在当前预览版本上继续提修改意见。
2. DeepSeek 接收本次描述及选中版本的三份源文件，生成 HTML body fragment、CSS、classic JavaScript。不附带聊天、记忆、身份或任务数据。
3. 完整输出通过格式检查并封存后，出现独立预览。可点击本地交互、切换窄屏，也可导出三份源代码及 manifest。
4. 只有预览正常打开且用户点「就用这个」才更新启用指针。生成、刷新或模型文字不能自行启用。
5. 新首页替换欢迎画布。聊天输入、导航、记忆、任务记录和恢复按钮仍归可信宿主管理；进入对话后使用原有对话界面。
6. 版本列表可重新预览旧代码。「回到上一版」恢复上次使用的版本，「恢复初始空间」恢复原首页；不回滚记忆、任务或外部操作。

范围是**自由代码首页画布**，不是整个可信聊天壳的任意重写，也不是社区插件运行时。三文件没有模板/组件目录限制，运行环境不开放网络或产品操作桥。

## 模块与复用

| 模块 | 职责 | 边界 |
| --- | --- | --- |
| `product/space/package.mjs` | 作者契约、格式检查、文档组装、脚本哈希 CSP | `node:vm.Script` 只编译语法，不运行代码；静态规则不是沙箱 |
| `product/space/service.mjs` | 候选封存、指针、CAS、取消、恢复 | 独立 canvas 数据根；不接收 product host 或个人数据 |
| `product/providers/deepseek.mjs` | 现有私有凭据/传输/串行锁新增 space 模式 | 完整 JSON 才可校验，不流式执行代码，不重试 |
| `product/web/server.mjs` | 白名单命令、随机预览票据、文档响应策略 | API 要求精确 Origin 和会话 token；子页无 token |
| `personal-space/canvas.mjs` | 观察子 frame ready/error | 校验 source、opaque origin、mount ID、消息形状；无数据/动作桥 |
| `personal-space/app.mjs` | 描述、预览、版本、启用、恢复 | 固定可信恢复入口；预览代次隔离旧回执 |

直接复用 `tests/spikes/personal-space/core/package.mjs` 与 `store.mjs` 原文件：三文件限额、哈希、不可覆盖候选、逐段路径检查、同卷 rename 封存。它们来自既有 BATCH-011/013，不重做包存储。

旧 demo/1 格式仅保留封存兼容，requested_scopes=[]，不授予旧 demo draft/read scope，不装载旧写桥。旧宿主 state/mount/bridge 的绑定与恢复思路沿用，未将旧演示组件冒充产品。无新增依赖或安装。

## 协议与持久化

- `space.generate {prompt,expectedVersion,baseRevision?}` 返回 jobId，随后 SSE 观察。描述最多 6000 字符，基线须已封存；候选上限 100，达到后明确停止，不删除历史。单文件 32 KiB，总源代码 64 KiB。
- 作业 `generating → validating → ready`，另有 failed/cancelled/interrupted。刷新不重发模型请求。服务重启将未完成作业标记中断；账本 reserved 仍需按原规则核对，不自动清账。
- `space.preview {revision}` 验证封存内容，签发随机 192-bit URL ticket 与独立 mount ID，15 分钟有效，最多 30 张内存票据。票据仅提供对应文档，不给 API 权限。
- `space.ready {mountId,revision}` 只是页面初始化回执，**不是代码安全认证**。`space.activate {mountId,revision,expectedVersion}` 还校验预览未过期、对应哈希未变、CAS 和用户显式操作。模型自报 ready 无法自行调用该 API。
- `space.rollback {expectedVersion,original?}` 更新指针。普通回退验证目标；恢复初始界面不读取损坏代码。最多 30 个历史启用指针。
- `space.source {revision}` 导出源码与 manifest。导出内容不包含记忆、对话或凭据。

canvas/state.json 通过独占随机临时文件、sync、同目录 rename 发布；旧包不覆盖。损坏指针保留原文件，改版停用，初始界面、聊天和记忆继续启动，不假装自动修复历史。

改版同步占用自身 busy 后才 await；产品 send/work 也先占 reservation。服务器在改版时拒绝 send/work/reconcile，改版前检查 runtime；所有 DeepSeek 类别再共享 provider busy 和磁盘 request ledger。无自动重试、额外 Agent 或 OpenAI 请求。

## 浏览器隔离

独立 HTTP 文档响应，iframe 和 CSP 都设置 sandbox allow-scripts，不加 allow-same-origin。唯一可执行脚本由内容 SHA-256 指定；禁用 eval、外部脚本、fetch、worker、嵌套 frame、表单、插件和外部资源。Permissions Policy 禁用摄像头、麦克风、位置和剪贴板。宿主不传私人状态，不开放子 frame 到模型/工具/记忆的命令桥。

依据：[MDN iframe sandbox](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe#sandbox)、[CSP sandbox](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/sandbox)。实际浏览器验证父 DOM、localStorage、fetch 被阻止；伪造 send 消息后 turns=0。

这不是 OS/Electron 原生隔离，不能声称 CSP 禁止任意自导航、所有网络旁路或无限循环/资源耗尽。格式扫描不是恶意代码分析。当前只承载无私人投影的本地模型生成画布；开放陌生社区代码或个人数据前，需要更强执行隔离和资源约束。

## 验收

- 最终 Node 235 passed；Python 121 passed；来源/Schema 检查 142 个已复制文件无漂移。
- 实际 HTTP 测试覆盖生成/聊天互斥、票据、opaque Origin 拒绝、预览启用、CAS、回退，三个产品数据库字节未变。
- 单测覆盖不可变源、损坏包、迟到取消、失败保留旧版、重启中断、过期/跨版本票据、共享串行账本、frame 错来源/代次/二次导航及损坏存储降级。
- 两次真实串行 DeepSeek 请求均 HTTP 200。首次生成雨天书房；第二次带前版源码收紧高度、修正按钮标签。无自动重试，无用户业务上下文。
- 浏览器验证生成中刷新、真实点灯交互、374px 预览无横纵溢出、390×844 手机截图、启用、页面刷新、服务重启、旧版切换、回退、初始界面恢复。真实三个业务库测试前后哈希一致。
- 故障脚本不能启用，可信恢复入口可用。隔离探针父 DOM / localStorage / fetch 全部 BLOCKED，假命令未创建 turn。
- 手机尺寸调整后的宿主 body DOM 查询超时，不记作通过；手机视觉以保存截图验证，独立窄屏 iframe 尺寸读取成功。

报告 `reports/core-010/report.json`。测试后恢复初始首页，两份生成代码保留供用户预览。截图、真实候选、凭据、账本、数据库和私有证据不上传 GitHub。

## 后续优先级

1. 普通对话中的“改这里”形成界面提议卡，复用此服务，不做关键词自动改版。
2. 后台联系调度和通知，维持默认关闭、模型决定时机、授权可撤回。
3. 原生隔离、资源限额、安装包及依赖可移植化，再评估私人投影进入生成界面。
4. 代码包导入/社区 Fork、可替换工具、官方 Coding Agent 接入。TTS 后排。
