# CORE-007：Morrow 个人空间（本机试用版）

Morrow 是这一版视觉的暂用名称。它把 CORE-006 可信运行时接到实际可操作的个人空间：日常以对话为主，做事时展示过程，记忆和联系偏好放在侧边面板。默认首页由架构师编写，不建立多模板系统。未来 AI 改写页面仍须经过独立预览、权限审查和激活；本批没有装载生成代码。

## 启动

在本目录运行 `pwsh -File tools/start_personal_space.ps1 -DeepSeek`，输出本地地址。脚本隐藏启动服务；再次运行复用现有进程。不带 -DeepSeek 启动离线版本，已有离线实例不会被擅自切换模式。

调试也可在终端前台运行 `node tools/personal_space.mjs --deepseek`，用 Ctrl+C 关闭；运行时先停止并等待所属执行，再关闭 host。后台启动的实例没有系统自启动或常驻调度。本批不提供安装包。

复用原工作区已有的 Node 24.21.0、Python 虚拟环境、Vue 3 浏览器运行时，以及 PATH 中已有 PowerShell 7。默认位置见启动器；Python、Vue 可由可信启动环境 PERSONAL_AI_PYTHON、PERSONAL_AI_VUE 指定。这是开发入口，不是脱离开发依赖的发行包。原 companion-agent 目录只读。

数据在 `.product-data/personal-space`，不用历史实验 SQLite。DPAPI 凭据仍在既有 Windows 凭据文件中；PowerShell 7 子进程仅通过私有 stdout 管道交给 Node 内存。页面、地址、参数和报告不含密钥。不要直接执行凭据辅助脚本，因为它的 stdout 专供私有管道。

## 分层

- providers/deepseek.mjs：固定官方端点和 deepseek-flash，JSON 模式、禁重定向、限长、超时、取消、净化错误。仅返回公开 decision，不取用 reasoning_content。Python ModelDecision/FollowUpDecision 是最终契约。
- web/server.mjs：仅监听 127.0.0.1；固定静态文件、精确 Host/Origin、令牌、JSON 白名单，无通用 host.request、任意命令/文件或 renderer 密钥。复合 select/write 串行，work/result 绑定 turn ID。它服务人工编写的可信 UI，不是敌对代码沙箱。
- web/instance.mjs：独占启动记录。异常退出的记录不自动删除，防止重复执行。正常退出只释放自己的记录；异常回收前必须确认进程与任务状态。
- personal-space/client.mjs：快照修订单调，旧响应不覆盖新状态，写入不自动重试。轮询只读运行时内存，不发模型请求。
- personal-space/app.mjs、styles.css：Vue 渲染函数、原创 SVG/CSS；数据按文本渲染，面板有焦点圈定、Escape 和焦点恢复。取消、未知、失败按实际状态展示，不从模型文字推断完成。

白名单包括 send/cancel/reconcile、open/refresh、conversation list/turns、memory add/edit/forget、policy memory/contact、inbox read/explain、reminder create/cancel、result open/rows。服务端映射表是权威；模型不能临时新增操作。

## 模型预算与实际结果

`.product-data/core-007-deepseek-budget.json` 是本轮六次尝试账本，包含验证和页面试用。启动、刷新、管理记忆不消耗。请求前原子预留，失败占次数，不自动重试；未结算的 reserved 会阻止另一 provider 实例请求。异常 reserved 不自动解除，不得删除账本绕过额度。

账本只记 HTTP 状态、时间和 token 用量，不记 prompt、回复或密钥。received 只代表公开 JSON 收到，不代表内核接受、任务完成。

四次真实请求均 HTTP 200：第一次 decision 被内核以 invalid_request 拒绝。原始响应未保留，具体错误字段未定位，不能声称结构问题彻底修复。随后在独立虚构上下文中成功写入记忆；补充明确数组/枚举示例后，页面 CSV 工作和页面记忆各成功一次。三个成功样本不是泛化质量评测。交付时剩两次试用额度。

初次启动误用系统 Windows PowerShell，因脚本策略及解码方式失败，没有 HTTP；最终复用此前凭据流程的已安装 PowerShell 7，未改变系统执行策略。

## 能力与限制

已实际验证：首页、模型对话、手工记忆新增/编辑/开关、模型记忆写入、CSV 上传和确定性计算、可读来源、重启后重开结果、主动联系偏好保存。记忆默认开，主动联系默认关；保存偏好不会启动后台发送，明确提醒只保存，不承诺到期自动投递。

CSV 固定使用 item/unit/qty/unit_price/currency 列，只核对数量、单价和按币种汇总；额外业务要求未语义执行。模型提议后，本地结果独立展示，不追加模型润色调用。

历史面板目前显示最近 20 段、每段最近 10 条摘要；记忆/消息是已有控制器首批视图，完整浏览翻页待接入。成果可加载更多行，导出标记是否部分加载。临时对话承诺不读写长期记忆，不宣称 SQLite 完全不留输入。

未验收：原生 Electron 隔离、生成页面预览/执行/激活、后台主动联系及唤醒、系统推送、TTS、社区分享、其他 Agent 真实接入、大规模语义质量、手机实机。390×844 DOM 无横向溢出；IAB 窄屏截图有缩放失真，不能代替手机实机视觉验收。

## 验证与下一步

Python 121；Node 原 172 + 本批 14 = 186。日志、真实浏览器截图/DOM 在 reports/core-007/evidence。旧 CORE-006 十项成果及 142 项来源复制完整性另行核对；本批未建立完整工作区写集基线，不以此声称全工作区范围 PASS。

下一步优先完成可替换视图的隔离预览、激活、回退，再接入可撤销后台联系调度。不要用模板代替自由代码定制，不把未运行调度包装成已上线。初始视觉继续由架构师负责。
