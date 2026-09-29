# 场景与运行时契约

更新于 2026-09-29。本文对齐 src/rebuild/types.ts 和现有实现；M02–M06 已落地，M07 本地验收完成。

## 入口与模块

/ 和 /rebuild/ 通过 RebuildPage.astro 输出同一新版页面；/legacy/ 使用旧页面。bootstrap.ts 创建场景、GalleryHost、Actions 和 StoryDirector。

~~~ts
type SceneId = 'hero' | 'gallery' | 'community';
type Quality = 'full' | 'balanced' | 'static';
type Viewport = {
  width: number;
  height: number;
  dpr: number;
  layout: 'desktop' | 'tablet' | 'mobile';
};
type Point = Readonly<{ x: number; y: number }>;
type Quad = readonly [Point, Point, Point, Point];
type Crop = { x: number; y: number; w: number; h: number };

type SceneFrame = {
  progress: number;
  enter: number;
  exit: number;
  opacity: number;
  active: boolean;
  ambientTime: number;
  ambientDeltaSeconds: number;
  reducedMotion: boolean;
  quality: Quality;
  pointer: { x: number; y: number };
  handoffHiddenIds: readonly string[];
};

type HandoffAnchor = {
  instanceId: string;
  assetId: string;
  assetVersion: string;
  quad: Quad;
  uv: Crop;
  appearanceId: string;
  occlusionGroup: string;
  src: string;
  width: number;
  height: number;
  borderRadius?: number;
  element?: HTMLElement;
};

interface SceneModule {
  ready: Promise<'ready' | 'fallback'>;
  resize(viewport: Viewport): void;
  update(frame: SceneFrame): void;
  sampleHandoff?(
    instanceId: string,
    frame: SceneFrame
  ): HandoffAnchor | undefined;
  dispose(): void;
}
~~~

工厂为 createHeroScene(root)、createGalleryScene(root, host, onOpen)、createCommunityScene(root)。ready 表示资源已解码且场景可绘制，或明确进入 fallback；它不表示后端服务可用。dispose 释放该模块持有的资源。

## 坐标与时间

Quad 顺序固定为左上、右上、右下、左下，使用屏幕 CSS 像素。width / height 是投影内容的本地尺寸，必须正数且有限；quadMatrix 对无效尺寸抛出 RangeError。uv 描述归一化裁切区域，源图与目标图需要使用相应裁切。

GalleryHost 使用正交相机，将画廊单位映射到 CSS 像素。DPR 只改变画布像素密度，不改变锚点坐标。TransitionLayer 将内容的四角映射到目标四边形，不再另设一台透视相机。

StoryDirector 统一驱动 GSAP ticker、Lenis、滚动进度和环境时间。各场景不得自行启动 RAF。渲染与 sampleHandoff 必须使用同一个 SceneFrame 推导同一个姿态，包含环境摆动、指针和场景位移；不能隐藏对象后返回旧的 DOM 测量值。

固定 progress 与 ambientTime 应产生相同构图。指定交接卡片使用连续轨道；不得在交接中以取模归零造成跨屏跳动。帧间时长用于环境更新，不替代进度函数。

## 对象归属

| 交接 | 源 | 目标 |
| --- | --- | --- |
| A1 | hero-tag-video | gallery-frame |
| A2 | hero-tag-research | gallery-fieldnotes |
| B1 | community-travel（画廊中的共享作品） | community-travel（社区） |
| B2 | community-companion（画廊中的共享作品） | community-companion（社区） |
| B3 | community-writer（画廊中的共享作品） | community-writer（社区） |

handoffHiddenIds 指定当前由桥绘制的对象；场景隐藏可见对象但仍必须能取样其锚点。桥读取 element 并克隆，不能修改场景原节点。克隆社区卡片时携带移动端上下文和当前比例变量，resize 后必须重新应用。

appearanceId、occlusionGroup 记录外观与遮挡分组。当前实现按 DOM/CSS 和 WebGL 层级处理深度，不提供任意网格的通用遮挡求解。纸卡换面、阴影和透明度由具体转场实现，不能把这些描述字段视作已经接入的材质引擎。

## 就绪、暂停与失败

普通滚动中，全部模块 ready 后先成为交接候选，再在稳定章节启用桥，避免资源晚到改变转场中间画面。固定帧和 review/replay 验收入口可在解码完成后直接启用。WebGL 上下文丢失撤销交接；社区必需资源失败显示完整回退海报和可操作区域，不暴露失真的锚点。

对话框打开时停止 Lenis，并冻结环境运动、指针变化及自动审看播放；页面隐藏时也暂停环境/审看时间。关闭对话框恢复页面控制。用户暂停按钮控制环境运动。

无 JavaScript 时使用 HTML 静态章节。系统减少动态效果或 quality=static 直接采用静态布局，不初始化 Canvas 动画。WebGL 不可用时画廊有图像回退；这些模式不依赖后端。

## 响应式

QualityPolicy 唯一决定 layout：<=680px 为 mobile，681–1023px 为 tablet，>=1024px 为 desktop。场景应相信 Viewport.layout，不增加冲突的私有断点。当前 DPR 上限为宽度 <768px 时 1.5，否则 2；这是采样密度策略，不是布局断点。

## 动作契约与服务边界

作品事件为 morrow:open-artwork，detail 含 id 和可选 opener。作品通过稳定 id 查找，关闭后把焦点还给具体 opener。场景只发出意图，Actions 管理对话框内容和焦点。

Share / Discuss / Buy / Sell 当前共同打开作品详情，尚未接入真实发布、讨论、购买或出售服务。Download 显示尚未开放的下载状态；本地创作草稿与灵感下载为 JSON。账户、订单、支付、公开社区和助手执行属于后续后端集成。

资源位于 public/rebuild/，原始来源保留在 source-art/rebuild/ 与各模块 manifest。几何、运动和调度回归脚本验证上述关键逻辑；实际视觉和浏览器交互证据见 [进度记录](PROGRESS.md)。
