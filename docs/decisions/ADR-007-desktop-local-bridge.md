# ADR-007 · 桌面与本地服务的非视觉调用层

状态：BATCH-016开发边界；尚未实现/验收。

BATCH-015已能经Python CLI完成真实本地任务，但现有桌面仍是Vue/Vite空壳。下一步把它变成可由前端调用的能力，不同时设计视觉，也不宣称Electron已接通。当前没有安装Electron、AJV或JSON-Schema→TS库，不安装、不手写通用Schema编译器来绕过这一事实。

新增Node主控侧bridge，负责固定Python入口、受限动作、进程超时/退出和任务观察；新增Python桌面入口复用PersonalWorkbench/PersonalAIService及同一SQLite/worker锁。采用一次请求一个受控子进程的stdio事务，worker.run-next运行较久仍是独立子进程；取消/查询走其他短命请求，不被同一个串行stdin服务阻塞。无后台daemon、HTTP端口或额外Agent。

业务请求/结果仍由既有Pydantic权威校验。新desktop-local/1仅定义request_id/action/payload与transport结果包络，Python单源导出Schema；TS可定义少量包络/错误类型及动作映射，业务payload保持unknown/JSON数据，不复制整套业务模型或写通用validator。Python返回前再次按对应业务模型验证，Node只校验包络、关联id、大小/编码与退出码，不把“收到JSON”等同于业务成功。

所有可执行文件、入口文件、cwd、数据根来自可信开发工厂配置；页面action/payload绝不能指定命令、参数、环境、文件系统根或SQL。spawn使用固定executable+args、shell=false，不回显环境/凭据。测试可注入临时路径/合成进程，产品路径不接受RPC/env覆盖。仅在开发工程中绑定固定本批数据根；将来正式appData迁移另批，不重命名或隐式导入旧批次虚构数据库。

超时/进程退出不自动重试变更或重跑worker：写操作可能已提交但回执丢失。transport区分unavailable/protocol_error/outcome_unknown，提供明确的读回/按原command_id重放入口；没有command_id的长worker通过task快照确认，不能伪造failed/cancelled。终止由bridge启动的worker只证明进程退出，任务随后显式recover才interrupted，不能将停止进程等同于业务取消。

前端观察模块仅做headless控制器和订阅：初始快照、按seq续取事件、终态停止、dispose清理、旧响应不能盖新操作；接真实bridge，不做组件/布局/颜色/角色/按钮文案。浏览器/renderer仅拿窄接口，Node模块不得加入renderer bundle。因为本批没有Electron main/preload，最终的contextIsolation/IPC来源认证/生成页面原生隔离均not_run，不能把这个边界当成已验证的桌面沙箱。
