# BATCH-003 交接摘要

派工来源：`docs/handoff/BATCH-003.md`（batch_id=BATCH-003）；基线快照 `sha256:fc8d6ecd7273e78ff16d6a93639f2b58b6ab55202a524a70138e82cdbb0fe632`（`docs/handoff/BATCH-003-BASELINE.json`，533 文件）。本批按 §1 串行授权一次交付三张工程骨架卡：M00.0.01（Python 最小开发环境）→ M00.0.02（TypeScript 工作区与测试入口）→ M00.0.03（Vue renderer 空壳构建），前卡实际自检通过、无阻塞后继续下一卡，三卡完成后集中提交。三张卡报告均为 `submitted`，**均未 accepted**——只有独立复核能给 accepted，submitted ≠ accepted。本批无 Git 提交（工作区不是 Git 仓库），任何哈希均为文件内容哈希。外部前置 M00.2.x 等已 accepted 产物本批只读、未动；`CURRENT-TASK.md` 为历史证据，未改。

按要求：本批三卡全部为**真实安装、真实锁文件、真实运行/构建**，不以配置文件或报告充数；未做任何系统/用户级安装升级，未改系统 PATH、用户 profile 或既有 `~/.npmrc`。

## 1. 三卡状态

| 卡 | 状态 | 产物 | 报告 / 证据 |
| --- | --- | --- | --- |
| M00.0.01 Python 最小开发环境 | submitted | `pyproject.toml`、`requirements-dev.txt`、`uv.lock`、`.python-version`、`services/__init__.py`、`services/control/__init__.py`、`tools/__init__.py`、`.gitignore`（追加） | `reports/M00.0.01.json`（`manifest-sha256:c7a57666…`）；自检 `reports/evidence/M00.0.01/` |
| M00.0.02 TypeScript 工作区与测试入口 | submitted | 根 `package.json`、`package-lock.json`、`tsconfig.base.json`、`vitest.config.ts` | `reports/M00.0.02.json`（`manifest-sha256:a4dbd5ec…`）；自检 `reports/evidence/M00.0.02/` |
| M00.0.03 Vue renderer 空壳构建 | submitted | `apps/desktop/package.json`、`tsconfig.json`、`index.html`、`vite.config.ts`、`renderer/main.ts` | `reports/M00.0.03.json`（`manifest-sha256:0a02aa6a…`）；自检 `reports/evidence/M00.0.03/` |

三卡各自 `reports/M00.0.0N.checkpoint.md` 已随卡保存，含下一步精确动作与禁止重复动作。规范哈希：M00.0.01 `316be6f33226061e772ad7189f7566b5dea58a4147fd686b81e1fccc0aa9cb9a`、M00.0.02 `b6b3f9bc4620b02c67f09ea947e570756ec1308c15624ec1c420fb6186d1f317`、M00.0.03 `f1da4479e0dd1797f37e69faf136a09986e70dfc06cc411a12c1d792e7c2876c`（同 `docs/execution/microtasks.json` 对应条目）。`.local-tools/`（冻结 Python/Node/uv 工具链）、`.venv/`、`.venv-repro/`、`node_modules/`、`apps/desktop/dist/` 为生成物，按派工 §4.4 与 PRUNE 规则不入写集、不入清单、不随交付哈希。

## 2. 产物与哈希（sha256，收尾实测）

| # | 文件 | sha256 |
| --- | --- | --- |
| 1 | `pyproject.toml` | `3a882095ccf928373def4310bc4af5a4294e592dcd3f90c849e86f037a7463cc` |
| 2 | `requirements-dev.txt` | `2e7ba7e4e9cfd0c1d1892196099a307432d760d0eaee01f641b9a20ae9bbac72` |
| 3 | `uv.lock` | `d252b1d25276d6c714172b1a731302db76bdf68e76681abd5203efb3f5782185` |
| 4 | `.python-version` | `861b3dd8083d28f336ef70f6755bc399538ddad627b1d095820ca34cb953cf14` |
| 5 | `services/__init__.py` | `93dd3c68d89cece721cfd55e95775e90725b7ae411f5923cb5b117afb1da7727` |
| 6 | `services/control/__init__.py` | `6cb1a5402ac1383f41bc6104c80ad21f041070925f50eb5e0e26055c3eb2bbfd` |
| 7 | `tools/__init__.py` | `b502bc38d1eef976755cb27d94adb6b54d36593eeb02234e455ec505a50b381e` |
| 8 | `.gitignore`（追加本批生成/缓存目录） | `67dd9f3598a3e553c2033a428802977ff18bf419deb59c0fe1400b0cd0b22e15` |
| 9 | `package.json` | `c28bb49f18a11632172807abede3915ed6e973a5affbcfd5ae566034f34cae35` |
| 10 | `package-lock.json` | `bfa5d6a6b4e83633b61768c44c528986d8ae1d114bae093fe12bbf225f336b2c` |
| 11 | `tsconfig.base.json` | `c75aa3a57db243d7c85d0ee87270d2c0933718962816220502f38ef89365bd8e` |
| 12 | `vitest.config.ts` | `55dd980c569bbb8d947c848e9a0cf44608faa3741fcb1a943698e258d07bf5b8` |
| 13 | `apps/desktop/package.json` | `a1ce6e31e59a56e73cdd7fcc5d56a784ca823cd04d2b7e91a8d7cddb45d30ff7` |
| 14 | `apps/desktop/tsconfig.json` | `76b17e65058ea91f7d9ba51ace0078479e1df544a158fe830e4cf5c0a30683d9` |
| 15 | `apps/desktop/index.html` | `ba019529154e58ad1800c5b0468f7e236bc85fdd9ae459a75bcd525d7b46638e` |
| 16 | `apps/desktop/vite.config.ts` | `24ae9f344fbebad7c9c854d345e92f12b3271d043a3578980c48914b56281d10` |
| 17 | `apps/desktop/renderer/main.ts` | `9a18d8bdd8eb36c4524c5cfb089e15812c00ce6d814a295262cdbfdbfceae3fe` |

清单归属：#1–8 见 `reports/evidence/M00.0.01/artifact-manifest.json`（`c7a57666e56de6499dc2bc941eb58d261805910b237968a8059b684cfe34dac4`）；#9–12 见 `reports/evidence/M00.0.02/artifact-manifest.json`（`a4dbd5ec…`）；#13–17 见 `reports/evidence/M00.0.03/artifact-manifest.json`（`0a02aa6a…`）。三份 manifest 哈希在收尾时逐份复算并与各报告 `result_ref` 一致。跨卡根 `package.json`/`package-lock.json` 的最终字节（含 M00.0.03 引入的 `vue@3.5.43` 及其传递依赖，锁 `3aab7919…` → `bfa5d6a6…`）按派工 §4.4 归 M00.0.02 所有，.02 的 manifest 与 `result_ref` 已在三卡最终态重建。

`holdout.json` 未改：`cfde4a5ddcaeb6b6c814ee6e9bc61a5ea9358528e9aa632e307ca81e272a93d6`（只核对哈希，未读内容，未用于生成测试或推导答案）。

## 3. 各卡做了什么

- **M00.0.01（Python 最小开发环境）**：先把冻结工具链**真实装到项目局部目录** `.local-tools/`（python.org 官方安装器 `python-3.13.15-amd64.exe`，静默安装 `InstallAllUsers=0`/`TargetDir=项目内`/`PrependPath=0`，exit 0；PyPI 官方 `uv` 0.12.18 wheel 解出 `uv.exe`；nodejs.org 官方 `node-v24.21.0-win-x64.zip` 解出 Node 24.21.0 + 自带 npm 11.19.0，供后两卡使用），来源 URL/字节数/哈希留档 `tool-sources.json`，**未做任何系统/用户级安装**。产物：`pyproject.toml` 为唯一版本声明源（`pydantic==2.13.5`、dev 组 `pytest==9.1.1`、backend `hatchling==1.32.4`，`requires-python='>=3.13,<3.14'`，wheel packages 覆盖 `services`/`tools` 整目录以备 adapter/integration 子包）；三个 `__init__.py` 只有一行中文 docstring、无业务实现；`requirements-dev.txt` 由 `uv export --locked` 真实导出（含哈希）；`.python-version`=3.13.15。真实执行链：`uv lock`（12 包）→ `uv sync`（`.venv`，12 包 + 本项目 editable）→ **项目外、去 PYTHONPATH、`-I` 隔离**下 `import services.control` 且 `__file__` 指回项目源码（排除伪安装）→ `pytest` 2 passed（负例：不存在路径 exit=4）→ `UV_PROJECT_ENVIRONMENT=.venv-repro uv sync --frozen` 第二干净环境重建，两环境包集合与解释器逐项一致、锁哈希不变。只读自检器 `check_m00_0_01.py` **20/20**（含 4 条内存负例：错误钉版/错误 `.python-version`/缺 dev 组/篡改锁均被拒）。
- **M00.0.02（TypeScript 工作区与测试入口）**：根 `package.json` 声明 `workspaces: [apps/desktop, packages/*]`，devDependencies 精确钉 `@types/node 24.13.6`/`typescript 6.0.3`/`vite 8.3.0`/`vitest 5.0.1`（无 `^`/`~`/latest），脚本 `test:unit=vitest run`、`typecheck=tsc -p apps/desktop/tsconfig.json --noEmit`、`build` 委托 workspace；`tsconfig.base.json` 只含 compilerOptions、不带 include/files，供各 workspace 最小扩展；`vitest.config.ts` include 覆盖 `apps/`、`packages/`、`reports/evidence/**/*.test.ts` 且 `passWithNoTests:false`（不掩盖零测试）。真实执行：`npm install`（进程内 `npm_config_registry=https://registry.npmjs.org/` 覆盖用户级 `~/.npmrc` 的 npmmirror 镜像——镜像为既有用户配置，未改未删；原因与两次安装事实记 `logs/01a-registry-note.txt`）→ 锁文件真实生成（lockfileVersion 3）→ 隔离夹具 `npm ci` 重建（锁哈希前后一致）→ 测试入口三态实测（定向只跑目标文件 1 文件 5 用例、不存在路径 exit=1 不掩盖、全量通过）→ typecheck 真实性用独立临时 fixture 三态证明（正确 TS exit 0 / 类型错误 exit 2 error TS / 空输入 exit 2 `No inputs were found`）。自检器 `check_m00_0_02.py` 卡末 **26 项 failed=0 / 1 项 PEND（D-5 等 .03）**，批末最终态 **27/27 failed=0 pending=0**。如实记录两个真实问题：npm 脚本默认从 PATH 解析 node（首次误跑在系统 node 22.23.2，日志 `03-first-attempt-wrong-node.txt`，此后统一进程内前置冻结 Node）；把测试文件复制进夹具会被根 include 重复收集（改为夹具只含配置，B-5 断言）。
- **M00.0.03（Vue renderer 空壳构建）**：`apps/desktop` 五个源文件——`package.json`（`@companion/desktop`，private，dependencies 精确钉 `vue 3.5.43`，脚本只有 `vite build` 与 `vite --host 127.0.0.1`）；`tsconfig.json`（extends 根 base，include `renderer/**/*.ts` 与 `vite.config.ts`）；`index.html`（挂载点 `#app`、入口 `/renderer/main.ts`、内联 `<style>` 用本地系统字体栈、无远程字体/脚本）；`vite.config.ts`（root 指向配置目录、`base: "./"`、`outDir dist`、`server.host 127.0.0.1`、无 plugins）；`renderer/main.ts`（只用 `.ts` + `createApp`/`h`/`render`，无 `.vue` SFC、无 `vue-tsc`、无 `@vitejs/plugin-vue`，渲染产品名 + 写死的「暂无数据」占位 + 本地开发说明，无取数/账户/托盘/认证代码）。真实执行：`npm install`（锁 `3aab7919…` → `bfa5d6a6…`，84 条 resolved 官方注册表 + 1 条工作区软链）→ `npm run typecheck` exit 0，`tsc --listFiles` 证明实际纳入 `renderer/main.ts` 与 `vite.config.ts`（217 文件，非空集合）→ `npm run build` exit 0（vite v8.3.0，10 modules，240ms，`dist/index.html` 481B + `dist/assets/index-C0avCZ8n.js` 63832B，入口只引用该本地 JS）→ `vite preview` 只绑 127.0.0.1（netstat 无 0.0.0.0），`/` 与 JS 均 200，应用内浏览器真实渲染出标题与占位文案、console 无日志、网络仅两条本地请求无第三方，验证后已停进程。只读自检器 `check_m00_0_03.py` **37/37**。明确声明：以上是 Vite 预览渲染，**不是 Electron 窗口**；本卡不含 Electron main/preload、未安装、未运行 Electron。

## 4. 关键自检结果与命令（原始输出：各卡 `reports/evidence/<ID>/verification.txt` 与 `logs/`）

| 命令（argv） | 退出码 | 结果 |
| --- | --- | --- |
| `.local-tools/uv-0.12.18/uv.exe lock` / `sync` / `export --locked` / `sync --frozen`（M00.0.01） | 0 | 锁 12 包；`.venv` 与 `.venv-repro` 包集合一致；`requirements-dev.txt` 为真实导出（含哈希） |
| `.venv/Scripts/python.exe -I -c "import services.control …"`（M00.0.01） | 0 | 项目外、去 PYTHONPATH 隔离下导入来源在项目内（排除伪安装） |
| `.venv/Scripts/python.exe -m pytest reports/evidence/M00.0.01/test_initial_env.py -q` | 0 | `2 passed`；不存在路径负例 exit=4（日志 05） |
| `.venv/Scripts/python.exe reports/evidence/M00.0.01/check_m00_0_01.py` | 0 | `total=20 failed=0`（A–F 六组，含 4 条内存负例；日志 08） |
| `.local-tools/node-v24.21.0-win-x64/npm.cmd install`（M00.0.02/.03） | 0 | `.02` 生成锁 `3aab7919…`；`.03` 引入 vue 后锁 `bfa5d6a6…`（84 官方注册表 + 1 工作区软链） |
| `npm.cmd ci`（`.02` 重建夹具，卡内 + 批末各一次） | 0 | 锁哈希前后一致且等于根锁 `bfa5d6a6…`（日志 07、11） |
| `npm.cmd run test:unit -- reports/evidence/M00.0.02/test_workspace.test.ts` | 0 | 只跑目标文件（verbose 仅目标用例；decoy 用例不出现） |
| `npm.cmd run test:unit -- reports/evidence/M00.0.02/nonexistent.test.ts` | **1** | 不存在路径如实非零（`No test files found`，不掩盖） |
| `npm.cmd run test:unit`（全量） | 0 | 从 include 收集 2 文件 6 用例全过（含 decoy） |
| `.local-tools/python-3.13.15/python.exe reports/evidence/M00.0.02/check_m00_0_02.py` | 0 | 卡末 `total=26 failed=0 pending=1`；批末最终态 `total=27 failed=0 pending=0`（D-5 转 PASS；日志 08、10） |
| `npm run typecheck` + `tsc -p apps/desktop/tsconfig.json --noEmit --listFiles`（M00.0.03） | 0 | 真实类型检查；217 文件实际纳入 `renderer/main.ts` 与 `vite.config.ts`（日志 03） |
| `npm run build`（M00.0.03，委托 workspace → `vite build`） | 0 | vite v8.3.0，10 modules，`dist/` 非空、入口只引用本地 JS（日志 04、05） |
| `vite preview --host 127.0.0.1 --port 4173` + `curl /`、`curl /assets/index-C0avCZ8n.js` | 0 | 200/200，仅回环监听、无 0.0.0.0；浏览器面板真实渲染、无第三方请求；用后已停（日志 06） |
| `.local-tools/python-3.13.15/python.exe reports/evidence/M00.0.03/check_m00_0_03.py` | 0 | `total=37 failed=0 pending=0`（A–H 八组，含 4 条内存负例；日志 07） |
| `.local-tools/python-3.13.15/python.exe docs/execution/taskctl.py validate` | 0 | `{"valid": true, "tasks": 156, "first": "M00.1.01"}`（plan-only） |
| `.local-tools/python-3.13.15/python.exe docs/execution/taskctl.py next --reports-dir reports --reviews-dir reviews` | 0 | `{"task_id": "M00.0.01", "state": "submitted", "accepted": 6, "action": "review_or_resume_existing_work"}`——未伪造 accepted |
| `sha256sum` 第 2 节 17 个产物与三份 manifest | 0 | 与上表逐一相符；三份 manifest 哈希 = 各报告 `result_ref` |
| `sha256sum tests/fixtures/first-flow/holdout.json` | 0 | `cfde4a5d…` 与基线一致 |

## 5. 来源证据与网络使用

- **M00.0.01**：三个官方来源的只读下载（python.org 安装器、`files.pythonhosted.org` 的 uv wheel、nodejs.org 的 Node zip），来源 URL、字节数、sha256 记入 `reports/evidence/M00.0.01/tool-sources.json`；PyPI 元数据原文留档 `uv-0.12.18-pypi.json`、`hatchling-pypi.json`。
- **M00.0.02/M00.0.03**：只访问 `registry.npmjs.org`（进程内覆盖用户级镜像配置，未改该配置）；`npm ls` 与实际安装版本作为依赖来源证据（`logs/01`、`02`、`09`）。
- 全程未登录任何账户、无令牌、未调用任何模型推理 API、未测试订阅额度、未访问付费服务；未安装/升级本机 Codex、Claude Code、Hermes；未把任何凭据复制或外传。

## 6. 每卡验收入口（供独立复核按 ID 逐条核对）

- **M00.0.01-A01**（干净环境可安装可导入）：`reports/M00.0.01.json` 的 `acceptance_results`；`.venv` 由 `uv sync` 真实创建，解释器为冻结 3.13.15，项目 editable 装入；`-I` 隔离导入来源在项目内。
- **M00.0.01-A02**（测试真实可跑）：`pytest` 真实发现并运行 2 项 smoke（导入来源 + `importlib.metadata` 版本断言）。
- **M00.0.01-A03**（无付费/凭据/越界安装）：来源与哈希台账 `tool-sources.json`；无账户登录与模型 API。
- **M00.0.02-A01**（锁文件为真实安装产物）：`reports/M00.0.02.json`；`lockfileVersion 3`、直接依赖版本=冻结值、resolved 全部官方注册表（除 1 条工作区软链），夹具 `npm ci` 重建锁哈希不变。
- **M00.0.02-A02**（测试入口定向与全量都可覆盖、缺失不掩盖）：定向 verbose 只含目标用例且 decoy 不出现；不存在路径 exit=1；全量 2 文件 6 用例通过。
- **M00.0.02-A03**（typecheck 不是空壳）：脚本为真实 tsc 命令行；fixture 三态（通过/类型错误/空输入）各自可复现。
- **M00.0.03-A01**（真实构建、产物非空）：`npm run build` exit 0、`dist/` 两项产物存在且入口只引用本地 JS。
- **M00.0.03-A02**（不加载真实用户数据、无远程内容）：`main.ts` 无 fetch/XHR/WebSocket/storage、无远程地址；`index.html` 无远程脚本/样式/字体；bundle 内 URL 仅为 XML 命名空间与 Vue 错误文档常量（惰性，不发起请求）。
- **M00.0.03-A03**（不越阶段实现托盘/认证/任务流程）：源文件集恰为卡内五文件、全仓无 `.vue` SFC、依赖仅 `vue`、依赖键与脚本值不含 electron/vue-tsc/plugin-vue/0.0.0.0。

## 7. 收尾写集检查（权威范围检查，同刻复跑）

`python docs/handoff/check_batch003_scope.py` → **PASS**（撰写本摘要前的预跑：`modified=1 / added=76 / missing=0 / outside=[]`，`snapshot_id` 与各报告 `base_ref` 一致）。随后按派工要求把两次运行的原始 JSON 按序存进 `reports/evidence/M00.0.03/final-scope.txt`：run 1 的输出先落盘，run 2 在该日志已在盘上的状态下复跑——两次运行的计数均为 `modified=1 / added=78 / missing=0 / outside=[]`（78 = 预跑 76 + 本摘要 + 该日志本身），`result` 均为 `PASS`。该检查只输出路径清单、不记录文件哈希，故本日志对自身的提及仅在路径层面；两次运行之间与 run 2 之后，除该日志自身的输出追加外未再写入任何文件。

变化列表的构成：`modified` 仅 `.gitignore`（M00.0.01 追加生成/缓存目录，属卡内写集）；`added` 全部为本批三卡的业务/配置/锁文件、三份报告与三份检查点、`reports/BATCH-003.md` 本身，以及 `reports/evidence/M00.0.0{1,2,3}/` 前缀下的自检器、日志、台账与夹具配置。变化列表**不含** `reviews/`、`AGENTS.md`、`CLAUDE.md`、`docs/` 任何既有文件与 helper、任何已 accepted 产物；`holdout.json` 字节未变。

## 8. 仍需独立复核/后续处理的未知项

1. **Electron 仍未落地**：`electron 44.4.4` 按冻结表 deferred，本批未安装、未运行；M00.0.03 交付的是 renderer 空壳的 Vite 构建与预览，**不能**表述为 Electron 窗口已运行——Electron main/preload、打包与窗口验证留后续卡。
2. **npm 版本形态**：本机 npm 提示 12.1.0 可升级，按冻结形态（Node 自带 11.19.0）未升级；是否采纳属依赖裁决。
3. **本机环境事实**：PATH 上的裸 `python` 解析到已安装 Hermes agent 的 venv（3.12.10，`C:\Users\xiayu\AppData\Local\hermes\hermes-agent\venv`）；本批自 .03 起全部 Python 侧命令改用冻结解释器 `.local-tools/python-3.13.15/python.exe`，未向该 venv 安装任何东西、未改 PATH/profile。
4. **用户级 npm 配置**：`~/.npmrc` 指向 npmmirror（既有配置）；本批安装均在进程内覆盖为官方 registry，未修改该文件。若复核要求仓库内固定 registry，请指定落点文件。
5. **BATCH-002 §8 遗留未动**：E1 pydantic 环境划分（env-server 2.13.5 vs Hermes 自带 2.13.4）、E2 Hermes 版本号体系、E3 Langfuse ee 边界、GitHub 匿名 API 限流对 tag→commit 绑定的影响等，本批未触碰，仍待架构裁决。
6. **夹具简化**：`.02` 的 `npm ci` 重建夹具不含 `apps/desktop` 目录，npm 因此不创建工作区软链——锁文件字节与仓库根完全一致，但"软链存在性"这一点未在夹具内复现（已在夹具 README 与报告中标注）。
7. **产物哈希的可复现性**：`dist/` 文件名含内容哈希，重建会产生不同文件名/入口哈希；第 2 节不含生成目录哈希，`.03` 报告记录的是本次真实构建结果。`.03` 无独立 CSS 产物（样式内联于 `index.html` 与运行时 style 对象）。
8. **范围检查的口径**：检查按 PRUNE 排除生成目录，只比对路径集合与基线哈希，不校验被排除目录的内容与归属。

## 9. 停止

BATCH-003 到此停止：三卡报告 `submitted`（未 accepted），不执行 M00.0、M00.3 及其他批外任务，不自行标记 accepted，等待架构负责人对三张卡（M00.0.01/M00.0.02/M00.0.03）的统一独立复核。
