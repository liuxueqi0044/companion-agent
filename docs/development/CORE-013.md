# CORE-013 · 可积累的能力与桌面首版收尾

用户授权：继续上一轮提出的私人工具、桌面体验和整体验收。整套界面的自然语言作者仍后置。下面列明最终实现与实际验证边界，报告为架构师实现并自验的 submitted。

1. 私人工具以 SQLite SELECT 源码表达文本/表格逻辑，复用 Python 标准库。提供参数、输入样例与期望输出；样例真实运行通过才保存不可变版本。用户可以改写、停用、回退；执行固定版本，输入来自本轮材料。权限检查、SQL authorizer、资源限制与独立内存数据库均由宿主管理，不提供文件/网络/进程能力。
2. 复用现有 action、shared runtime、成果 ZIP 和 SDK。自然语言选择工具；默认界面补一个轻量的“我的工具”管理入口。模型可看目录和 CSV 列名，不自动读取历史用户材料。正文和参数作为数据，不作为授权。
3. 桌面原生载体复用已选技术及现有 localhost 服务；窗口生命周期不拥有模型任务。支持托盘恢复、窗口形态和后台运行，默认界面保持原有视觉。按实际运行证据报告支持范围。
4. 验证创建→样例测试→持久保存→新材料执行→停止/版本冲突→重开复用，另做首装、数据保留、故障恢复与模型串行检查。真实模型不使用 OpenAI 账户。旧 submitted/accepted 不重写。

SQLite 依据：[authorizer](https://www.sqlite.org/c3ref/set_authorizer.html)、[progress handler](https://www.sqlite.org/c3ref/progress_handler.html)、[运行时限制](https://www.sqlite.org/limits.html)。本批工具不执行生成的操作系统命令；更广泛的代码运行需要独立适配与隔离，不用 SQL 能力冒充。

## 接口与所有权

- `services/product/tool_library.py` 管理独立 tools.sqlite3，保存工具元数据、不可变 definition 版本、样例验证回执和幂等 command。产品动作与工具库跨库提交用稳定 action ID 重放，重试不增加版本。旧三库 Schema 不变。
- `tool.save` 只有全部样例真实输出与 expected 相等才提交；修改需 expected_revision。`tool.run` 固定当前 version、校验 enabled 和参数，输出用原 artifact 回执落入持久动作。失败没有成功成果卡。
- `tool.list/read/manage` 经可信宿主与 `tasks` SDK scope；管理使用 command_id 和 revision CAS。上下文提供目录、CSV 列名以及最多两个被用户明确命名工具的源码，不把历史材料自动喂给模型。目录变化会使旧模型上下文失效。
- SQLite 每次新建内存 data 表，只有本次提供的文本/CSV，限制函数、语句、步数、时长、输入/输出大小。无法 ATTACH 产品数据库、读文件、扩展函数或执行写 SQL。样例不是普遍正确性证明；SQLite 常规数值语义不能冒充原金额核对器的十进制精度。
- 库上限 40 工具、每工具 30 版本；输入 256 KiB / 2000 行 / 40 列；参数最多 12 项，结果 1000 行 / 48 KiB。SQL 执行限约 100 万虚拟机指令及 1 秒进度检查；不能保证在任意单个 SQLite 函数内部即时取消。

## 原生窗口与 SDK

复用原先选型的 Electron **44.4.4**，来自 [官方 release](https://github.com/electron/electron/releases/tag/v44.4.4)。Windows x64 ZIP SHA-256 为 `47a3097f1e14030c99937a5ff9534446f44cf0c0032b88f2466360bab4ca9cdc`。构建核对分发 ZIP 与解包文件，发行包保留许可证及 Chromium 第三方声明；没有向 donor 或全局环境安装依赖。

`apps/desktop/native/main.cjs` 启动或附着同一本机服务。preload 只暴露窄窗口操作给可信顶层 shell，作者 iframe 没有 Node、process 或原生桥。每次调用都经持有 native token 的主进程，让服务器检查仍然活动、非预览且具有 window scope 的 mount。Token 不出现在页面。窗口尺寸限定 240–2560 DIP，透明度 0.35–1，不提供隐藏所有窗口、任意路径、网络或进程句柄。

```js
// 先通过 SDK 保存待发送草稿；只有在桌面载体且已获 window scope 时可用。
const result = await api.host.configureWindow({
  width: 420, height: 520, frame: false,
  transparent: true, alwaysOnTop: true, opacity: 1
});
```

支持无边框、透明和置顶的原生载体，不等于已制作一个固定桌宠模板。作者 CSS 可使用 Chromium 的拖动区域；要保留可点击控件区域。改变 frame/transparent 会重新挂载视图，服务/任务不重启；恢复由托盘或可信快捷键进入，完全独立于作者按钮。Windows 的 DIP 换算在本机返回 1 像素取整差异，验收使用 2 DIP 容差；置顶使用 pop-up-menu 等级。默认仍是普通非置顶窗口。

遵循 [Electron 安全建议](https://www.electronjs.org/docs/latest/tutorial/security)：sandbox、contextIsolation、nodeIntegration=false，校验 IPC sender/mainFrame，限制跳转、弹窗与网络请求，拒绝额外权限。真实测试中外部 HTTPS 请求被拒绝。没有据此宣称已覆盖所有网络侧通道、CPU/内存攻击或敌对代码逃逸。社区代码当前仍必须由用户信任。

## 已运行的检查

- Python 153 项；整套 Node 263 项，最后服务路径与原生授权调整另跑 5 项定向，均通过。SDK 严格类型、Schema、PowerShell 语法与原 142 个 donor 文件完整性通过。
- 两次真实串行 DeepSeek：创建名单去重工具→真实样例通过→保存；换新 CSV 调用保存版本→实际输出 3 行。无重试、OpenAI 请求或额外 assistant 会话。
- 实际 Electron 检查 10 项：服务、renderer 设置、未知 mount 拒绝、preload→主进程→服务授权、作者 frame 无桥、关闭隐藏且服务存活、窗口形态变化、恢复入口、外网请求拒绝、主页面无 Node。源程序与安装包两次冷启动均通过。
- 已通过 computer-use 观察默认首页、恢复页及工具面板。系统托盘通知实际送达、长期睡眠唤醒、另一台机器安装不由这些截图或 smoke 代替。
- 原浏览器试用服务 51794 在升级时已经停止，因此本批做受控冷启动和死进程锁归档，不声称完成在途任务的无缝热升级。原三份业务数据库升级前后 SHA-256 一致。

## 交付与继续开发

本地便携包 `.test-data/releases/Morrow-CORE013.zip` 约 219 MB，含原生运行时。首版 Windows 本地 Alpha 未签名，PowerShell 7 仍是凭据和安装依赖；不注册启动项、不自动更新。使用步骤见 [LOCAL-ALPHA](../product/LOCAL-ALPHA.md)。

此阶段已达到“可试用的本地个人 AI”收尾线，不是整个商业愿景完工。最后的整套 UI 自然语言作者按用户要求未接入；官方编码 CLI 实连、通用 Computer Use、云端常驻、社区 Fork/TTS 留在后续，不混入本批完成率。
