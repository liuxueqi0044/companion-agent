# BATCH-009 · 三包连续交付

状态：**submitted，等待独立复核**。派工 `docs/handoff/BATCH-009.md`；基线 `sha256:023bd23dc65eb51eb6298a7ec65cae29f880e175c1b79b146ce5813e2741e341`；累计 accepted 仍为 12。本批未写 reviews/、accepted 或任何正式公共契约。

## A · Codex 协议修订

`account/read` 缺字段/错类型现在返回 unknown 与 issue；仅显式合法 null 表示 unavailable。已知方法按请求/通知类别和方向校验，响应须与对向 pending request 关联；审批响应未实现则标 unsupported。原 8 测+新增 6 测共 14 测、严格 TS 均通过。未来操作单已将成功、取消、观察者恢复拆开，并区分官方 stdio 与我方观察者。原 M00.5.01 A01–A03 全部 **not_run**；没有官方 Agent/账号/模型试验。

## B · 本地输入核对工作台

原固定成果演示继续可用。新增独立 S0 模式：用户主动提供文本+CSV，Papa Parse 保留原字符串/额外列/重复数据行，结构错误阻止替换；缺列和空值可人工核对。单元格来源、修改/取消/撤销/清空、草稿 JSON 的 SHA-256 和修改链往返均在页面本地完成，不联网也不生成 AI 成果。局部版本与 integrity 见依赖证据；根依赖哈希不变。原 6 组 DOM、新 6 组 DOM、6 组纯逻辑测试、局部 build/完整 vue-tsc、原桌面 build/typecheck 均通过。先前被拒绝的截图保存路径未重试；**持久视觉图像仍缺**，M00.4.02 A02 与整卡继续待独立视觉验收。

## C · DeepSeek 窄适配

固定 `deepseek-flash` 的非思考、非流式 JSON 请求和虚构双行验证器；5 组离线测试、严格 TS、只读 plan/offline/import 守卫通过。官方价格当日来源与估计写在 `docs/evidence/deepseek-smoke.md`。用户尚未配置 `DEEPSEEK_API_KEY`，故 live 为 **not_run**；没有读取密钥或发 HTTP 模型请求。此 sidecar 不替代官方 Agent 验收。

## 证据与限制

两卡报告在 `reports/M00.5.01.json`、`reports/M00.4.02.json`，DeepSeek sidecar 在 `reports/BATCH-009-DEEPSEEK.json`。对应 manifest SHA-256：A `02da6c7d44a3fddb149ac0524ce687ebdaf04e29fd10a94dcc5f3e174b2b7d08`；B `2421eb3ecfcb599bbc5366d4b3464934af8cc6876b522ea9dc0fe6ff160d9152`；C `63f06a3b8cc46ac97b413297aae3a9c40f8c02a18c80ace43e028af6fb31cb74`。源文件、必要测试/fixture 和来源依据纳入 manifest；报告、日志、manifest 自身、生成依赖不纳入。范围、复算与 taskctl 日志在 `reports/evidence/BATCH-009-DEEPSEEK/`。真实认证/生命周期、视觉截图及 DeepSeek live 均未用离线结果冒充通过。
