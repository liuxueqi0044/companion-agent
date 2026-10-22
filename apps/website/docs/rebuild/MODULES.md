# 模块实现与责任边界

更新于 2026-09-29。M01–M06 已完成设计与实现，M07 已完成本地验收与交付。用户在 M01 后授权按架构完成全站，因此早期逐模块等待许可的暂停安排已不再适用。

## 实现清单

| 模块 | 目标与主要代码 | 输出及证据 |
| --- | --- | --- |
| M01 视觉开发 | 三章构图、材质、空间与转场关键帧 | [M01 目录](artifacts/M01/) |
| M02 首屏 | HeroScene.ts、hero.css；保持写实图像质感，把两张纸卡分离为真实可交接对象 | [说明](artifacts/M02/README.md)、[素材清单](artifacts/M02/assets.json) |
| M03 社区 | CommunityScene.ts、community.css、content/community.ts；3 主作品、5 人物、远景作品与植物丝带 | [说明](artifacts/M03/README.md)、[发布素材清单](../../public/rebuild/community/manifest.json) |
| M04 画廊 | GalleryScene.ts、gallery-motion.ts、GalleryHost.ts、content/gallery.ts；四画带、近远景、连续轨迹 | [说明](artifacts/M04/README.md)、[素材检查](artifacts/M04/asset-verification.json)、[运动检查](artifacts/M04/motion-verification.json) |
| M05 转场 | TransitionLayer.ts、geometry.ts、config/chapters.ts；A/B 同一对象衔接、四角投影、折叠换面 | [几何检查](artifacts/M05/geometry-check.json)、[转场说明](TRANSITIONS.md) |
| M06 页面与交互 | RebuildPage.astro、bootstrap.ts、StoryDirector.ts、QualityPolicy.ts、Actions.ts；语义内容、滚动、详情、回退、响应式 | [运行时复核](artifacts/M06/runtime-review.md)、[调度测试](artifacts/M06/runtime-check.json) |
| M07 验收与交付 | 实际浏览器截图、转场正反向录制、失败模式、构建和资源交接 | [视口记录](artifacts/M07/viewport-checks.json)、[回退记录](artifacts/M07/fallback-checks.json)、[资源交接](artifacts/M07/ASSETS-AND-LICENSES.md)；最终验收见 [M07 交付记录](artifacts/M07/README.md) |

上表的代码路径均位于 src/rebuild/。/ 与 /rebuild/ 使用 RebuildPage；/legacy/ 保留旧页面。旧版资源和组件仍供 /legacy/ 使用，不能仅因为新版没有直接引用就全部删除。

## 输入输出和边界

- 场景工厂返回 SceneModule，接收 Viewport 与 SceneFrame；不能启动独立 RAF 或全局滚动监听。
- HeroScene 只负责视觉；导航、标题、正文和主 CTA 由页面与 StoryDirector 负责。
- GalleryHost 独占 Three.js renderer、camera 和 canvas。GalleryScene 管理画带、贴图与点击目标。
- CommunityScene 管理视觉及主作品的屏幕锚点；Actions 管理详情语义、对话框、焦点和本地下载。
- TransitionLayer 仅通过 sampleHandoff 获取对象姿态；克隆 element 时不能修改场景原节点。
- 稳定对象 ID 是纸卡与共享作品的关联键，不允许以数组下标替代。
- config/chapters.ts 管理全局转场区间；不在各场景另写一组阈值。
- appearanceId 和 occlusionGroup 是当前姿态的描述信息。当前深度关系由实际 DOM/CSS 和渲染层处理，不是通用材质或遮挡引擎。

完整字段定义以 [契约](CONTRACTS.md) 和 src/rebuild/types.ts 为准。

## 相对早期方案的落地调整

首屏采用获选写实图的分层与局部补底，保留四张固定纸卡；两张参与转场的纸卡使用原图裁片，避免 AI 重绘改动构图。画廊使用正交相机与 CSS 像素坐标，桥使用 CSS matrix3d；无需额外的转场渲染器。社区图片与画廊入场作品共用相同文件，保证视觉交接。

特定 Frame / Fieldnotes 卡片在 A 期间保持预定入口，随后进入连续闭合轨道，避免取模归零让桥突然跨屏。详情和社区动作先形成真实可用的前端流程，后端未接入的部分明确说明状态。

## 后续改动的验收

几何、场景姿态或折叠变化应运行 rebuild-geometry-test；画带轨迹变化应运行 rebuild-gallery-motion-check；总调度、暂停、资源就绪或断点变化应运行 rebuild-runtime-check。资源变化应更新 manifest 并运行 rebuild-inventory。

上述纯逻辑检查不能代替真实浏览器中的字体、边缘、层级和滚动感受。当前已有桌面与手机三章视觉核对、六尺寸 DOM 溢出检查和四份转场正反向帧记录；不将其扩大解释为全机型 60fps 或完整无障碍认证。最终验收状态由 [PROGRESS](PROGRESS.md) 记录。
