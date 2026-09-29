# Morrow — English marketing frontend

本目录是 `companion-agent` 的独立营销站，不替换桌面应用。使用本目录自己的 `package-lock.json`；下列命令均在 `apps/website` 内运行，仓库根目录的产品命令保持原有用途。GitHub 导入范围、验收与本地证据排除说明见 [源码发布说明](docs/GITHUB.md)。

英文营销站的三个章节依次表达：组合助手能力、自由改变助手界面、与全球创作者分享和交易作品。新首页采用写实枝叶与纸卡、流动界面画廊、立体社区构图，并实现两段跨场景转场。

**当前状态（2026-09-29）：M01–M06 已完成设计与实现，M07 已完成本地验收与交付。** 主路由 / 已切换到新版；/rebuild/ 保留为同一新版的验收入口；/legacy/ 保留旧版。未执行公开部署。

## 运行

需要 Node.js >= 22.12.0。使用项目目录执行：

~~~sh
npm ci
npm run dev
~~~

开发地址为 http://127.0.0.1:4332/。检查、构建及预览：

~~~sh
npm run check
npm run build
npm run preview
~~~

Astro 生成静态 dist/，可交给支持静态文件的服务器。当前工作环境的 node_modules 是复用依赖的目录联接；交付源码不应携带它，在新环境使用 npm ci 安装。页面图片、字体均使用本地资源，不需要图片生成 API 密钥。

## 代码入口

| 路径 | 职责 |
| --- | --- |
| src/pages/index.astro、rebuild.astro | 新版页面入口 |
| src/pages/legacy.astro | 保留的旧版 |
| src/rebuild/components/RebuildPage.astro | 语义内容、导航、三章文案、静态回退 |
| src/rebuild/bootstrap.ts | 加载场景、资源、交互与总调度 |
| src/rebuild/scenes/ | Hero、Gallery、Community 及纯画廊运动函数 |
| src/rebuild/runtime/StoryDirector.ts | GSAP 时钟、ScrollTrigger、Lenis、章节进度、暂停与验收模式 |
| src/rebuild/runtime/GalleryHost.ts | 唯一的 Three.js 渲染器与正交相机 |
| src/rebuild/runtime/TransitionLayer.ts | 使用 CSS 四角投影衔接 DOM 与画廊中的卡片 |
| src/rebuild/runtime/Actions.ts | 作品详情、对话框、键盘/焦点及本地草稿下载 |
| src/rebuild/types.ts、config/、content/ | 场景契约、时间区间、动作及作品目录 |
| public/rebuild/、source-art/rebuild/ | 发布图片与可追溯原始素材 |
| docs/rebuild/ | 当前架构、模块进度、转场、证据和素材记录 |

旧版的程序化树、旧组装界面及旧验收记录不代表本次新版实现。

## 验收入口

以下参数也可用于主路由 /。frame 是整段故事的 0–1 进度，time 是环境运动秒数：

| 入口 | 用途 |
| --- | --- |
| /rebuild/?frame=0&time=0 | 首屏固定画面 |
| /rebuild/?frame=.48&time=0 | 流动界面章节 |
| /rebuild/?frame=.94&time=0 | 社区章节 |
| /rebuild/?frame=.27&time=0 | A 转场中点 |
| /rebuild/?frame=.775&time=0 | B 转场中点 |
| /rebuild/?review=1 | A/B 选择、关键进度、拖动、播放与反向审看 |
| /rebuild/?replay=A | 素材准备完成后自动播放 4 秒 A 转场 |
| /rebuild/?replay=B&reverse=1 | 自动反放 B 转场 |
| /rebuild/?motion=reduce | 完整静态章节，禁用 WebGL 动画 |
| /rebuild/?quality=static | 强制静态质量模式 |
| /rebuild/?webgl=off&frame=.48 | WebGL 不可用的诊断回退 |
| /rebuild/?assetFail=community&frame=.94&time=0 | 社区必需图片缺失的诊断回退 |

这些参数服务于验收；普通访问者通过滚动与导航浏览，转场速度由其滚动控制。

~~~sh
node tools/rebuild-geometry-test.mjs
node tools/rebuild-gallery-motion-check.mjs
node tools/rebuild-runtime-check.mjs
node tools/rebuild-inventory.mjs
~~~

前三项验证纯几何、画廊运动及调度逻辑，不替代真实浏览器的画质与性能检查。最后一项记录实际素材和当前 dist 快照，不是网络瀑布测试。各项证据与边界见 [进度记录](docs/rebuild/PROGRESS.md)。

## 产品边界

- 这是可运行的营销前端；AI 助手执行、账户、支付、订单、市场和公开发布服务尚未接入。
- Download 显示诚实的下载状态；当前没有伪装成可用安装包的链接。
- 作品上的 Share / Discuss / Buy / Sell 进入同一作品详情，尚未形成实际交易或社交操作。
- 社区入口说明社区和市场正在建设。创作草稿及灵感可下载为本地 JSON，不会自动上传或公开发布。
- 无 JavaScript 时仍可阅读静态三章；详情对话框及 JSON 下载需要 JavaScript。

完整设计与接口见 [当前架构](docs/rebuild/README.md)、[模块](docs/rebuild/MODULES.md)、[场景契约](docs/rebuild/CONTRACTS.md)、[转场设计](docs/rebuild/TRANSITIONS.md)。素材、字体、依赖许可证和字节统计见 [资源交接记录](docs/rebuild/artifacts/M07/ASSETS-AND-LICENSES.md)。
