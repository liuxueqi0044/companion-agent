# ADR-004 · 可编程界面的离线创作工具链

状态：BATCH-013架构边界冻结，尚未实现/验收。承接ADR-002/003与BATCH-012真实候选的失败证据。

## 目标

AI应直接编写界面布局、样式和交互代码；宿主通信、版本记录和验证应由稳定工具提供。提供SDK和可调用工具不等于提供模板选择器。用户仍通过描述让AI改代码，不需要理解协议或组件目录。

本批保持既有宿主demo/1、三文件personal-space-spike/1及核心封存实现只读。引入私有authoring-kit/1和space-client/1，不升为公共产品Schema；正式化依然迁移到Python契约单源及生成TS，不能形成竞争公共契约。

## 源码与产物

作者工作区保存可编辑view.html/body片段、view.css、view.js/经典脚本。view.js只写页面逻辑，通过window.PersonalSpace客户端访问授权状态，不重复写原始MessagePort桥。SDK处理顶层binding、nullable base_revision、激活时序、回执、超时与关闭。

构建输入=完整作者源码+固定SDK字节+工具/契约版本。可信装配器将SDK经典脚本置于作者JS之前，生成旧三文件格式的有效view.js，再交给既有core stage/seal。SDK不是让模型逐次重写的源码。作者原始三文件独立封存；构建回执同时绑定author_source_hash、sdk_hash、effective_source_hash、artifact_hash、validator_hash和base/head，保证增量编辑仍读作者源码，不编辑已拼接产物。

无需改旧manifest格式或偷偷为其添加字段；扩展归属/构建信息在私有authoring receipt中关联。旧核心hash绑定的是有效三文件，作者hash另行明确命名，不能混为一个source hash。源码、SDK、验证器变化均使相关旧结果失效。

## 能力与信任

SDK仅限demo投影读取/订阅和demo草稿写入，不提供shell、文件、任意HTTP、真实任务状态写入或权限扩展。demo/1的request_id是连接绑定，不是每次写入ID，因此SDK一次最多一个未完成写操作；超时后的迟到ACK不得认作新写成功，需停止该连接的后续写入直至显式重新连接。收到host_state_changed或合法读取回执后才能宣布连接可用，ready发送不代表active。

静态解析和格式验证只证明支持的源码结构，不构成安全沙箱、功能评审或视觉评审。所有模型原产物及其人工修订后代继续保留model来源，不因修了协议而改成可信手写。本批只有固定注册的仓库测试fixture和SDK可在本地jsdom中执行；真实BATCH-012候选及其派生版本只能解析/构建/保存，不执行、预览或装载。

## 复用

复用现有core不可变包、host状态机/窄桥、Node/Vue/Vite/jsdom、parse5 8.0.1（HTML）、TypeScript 6.0.3（JS语法解析）、PostCSS 8.5.28（CSS）。这些版本已在本机依赖树核实，不新增安装/锁文件，不从零写HTML/CSS/JS解析器。私有工作区锁、版本头和receipt只承担本地编辑事务，不新建通用Agent调度器。

下一里程碑是一条离线可复用创作链，含确定性诊断和给未来Coding Agent的修复材料。禁止伪称已完成自主生成/修复、敌对代码隔离或产品视觉。初始UI仍由架构师设计，并遵守用户先调整推理档位的要求。
