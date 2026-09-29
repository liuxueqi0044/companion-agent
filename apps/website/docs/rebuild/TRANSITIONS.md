# A / B 转场实现与验收

motion-runtime-v2，更新于 2026-09-29。两段转场已在 M05/M06 实现；M07 已完成浏览器验收与本地交付。M01 的动效研究保留为历史设计依据，以下以当前可运行代码为准。

## 时间区间

config/chapters.ts 是唯一的全局区间来源。整段故事进度为 0–1：

| 区间 | 进度 | 行为 |
| --- | --- | --- |
| 首屏停留 | 0–.15 | 技能枝叶与文案 |
| A | .15–.39 | 两张技能纸卡脱离枝叶，成为流动界面 |
| 画廊完整展示 | .39–.67 | 多层界面画带；从 .58 开始为 B 准备 |
| B | .67–.88 | 三张作品从画廊进入社区固定构图 |
| 社区完整展示 | .88–1 | 全球创作者、主作品、远景作品和 CTA |

导航目标为 Hero 0、Gallery .48、Community .94。普通浏览由滚动驱动，验收 replay 的 4 秒时长不限定用户实际滚动速度。

## A：纸卡成为界面

Video Editing 对应 Frame，Research 对应 Fieldnotes。HeroScene 输出真实纸卡四角，包含纸卡环境摆动和整层画面位移。转场开始后源卡由场景隐藏，原位置用局部补底恢复，桥保留精确裁片。

两张纸卡以错开的进度沿弧线脱离，经过收窄的边缘姿态切换为作品内容，再展开并衔接画廊中的对应卡片。换面时两种内容使用相同折叠轮廓和中线，避免尺寸突然改变。绳索属于首屏层，不随作品进入画廊。

| 源对象 | 目标对象 | 素材关系 |
| --- | --- | --- |
| hero-tag-video | gallery-frame | 原始纸卡裁片 → Frame 界面 |
| hero-tag-research | gallery-fieldnotes | 原始纸卡裁片 → Fieldnotes 界面 |

Frame / Fieldnotes 在 A 期间使用专门的入口姿态，之后在画廊局部进度 .329–.50 平滑释放到连续闭合轨道。两者不复用普通画带的取模循环，以免在桥仍跟踪时瞬间回到画带另一端。

## B：作品与创作者相遇

三张共享作品为 community-travel、community-companion、community-writer。GalleryScene 和 CommunityScene 引用相同源图，按统一 ID 提供四角位置。画廊先让共享作品进入准备姿态，随后桥接管并移动到社区预定构图；人物、植物、丝带、作品文字和操作随章节进入。

桥在源和目标之间投影相同内容，避免用两张相似截图交叉淡化掩盖位置关系。社区卡片克隆带有当前移动端上下文与比例，确保窄屏目标与桥的文字/边框一致。桥释放后由社区原对象负责后续呈现。

## 运行规则

StoryDirector 是唯一时间与进度入口。场景每帧从给定进度、环境秒数、指针和 viewport 计算姿态，sampleHandoff 使用相同计算结果。拖动、反向、跳到固定进度或快速跳章不依赖之前播放过多少帧。

转场期间原场景隐藏被接管 ID，桥绘制可见副本；到达端点后释放。所有坐标为 CSS 像素，几何函数将内容矩形映射到四角，包含折叠后高度。一个 GalleryHost 管理 WebGL，不为桥建立额外渲染器。

资源晚到只在普通稳定章节启用交接；验收入口在解码后可以直接定位。资源失败或 WebGL 丢失撤销桥，场景回退。模态对话框与隐藏页面冻结审看播放，减少动态效果模式展示完整静态章节。

## 浏览器验收入口

启动 npm run dev 后：

| 地址 | 用途 |
| --- | --- |
| /rebuild/?review=1 | 显示 Story/A/B 切换、滑块、关键点、播放/反向/暂停和时间冻结 |
| /rebuild/?frame=.27&time=0 | A 的 50% 固定画面 |
| /rebuild/?frame=.775&time=0 | B 的 50% 固定画面 |
| /rebuild/?replay=A | 资源就绪后按 4 秒审看 A |
| /rebuild/?replay=A&reverse=1 | 反向审看 A |
| /rebuild/?replay=B | 审看 B |
| /rebuild/?replay=B&reverse=1 | 反向审看 B |
| /rebuild/?motion=reduce | 静态阅读路径 |
| /rebuild/?webgl=off&frame=.48 | 画廊 WebGL 不可用 |
| /rebuild/?assetFail=community&frame=.94&time=0 | 社区必需图片缺失 |

frame 为全局进度，不是单段转场进度。time 的单位为秒；不传 time 时环境运动持续变化。主路由 / 也支持相同参数。

## 证据与验收边界

[几何检查](artifacts/M05/geometry-check.json) 验证投影、纸卡接管/释放连续性、折叠换面和 B 边界；入口/出口的 2 CSS px 阈值是几何连续性标准，不等于所有浏览器像素完全相同。[画廊运动检查](artifacts/M04/motion-verification.json) 验证循环和指定卡片；[运行时检查](artifacts/M06/runtime-check.json) 验证资源就绪、暂停、固定时间和快速跳章。

M07 已保留真实浏览器的 replay-A、replay-A-reverse、replay-B、replay-B-reverse 四组逐帧记录，以及桌面 A/B 中点截图。最终结论见 [M07 交付记录](artifacts/M07/README.md)。上述证据不构成全机型帧率保证，也不将静帧截图当成完整动态验收。
