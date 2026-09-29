# M01 交付 — 英文视觉母版与转场预演

版本：2026-09-29 / m01-review-v1。状态：制作完成，待用户评审。当前交付设计与运动预演，不是正式网站实现；M02–M07 尚未开始。

## 先看这里

- [设计评审入口](http://127.0.0.1:4340/docs/rebuild/artifacts/M01/index.html)：三幕视觉稿、三种画幅切换、材质板与分层试样。
- [两段运动预演](http://127.0.0.1:4340/docs/rebuild/artifacts/M01/motion/review.html)：选择 A/B，播放、倒放、暂停、拖动进度和查看路径。
- 视频：[A 纸牌进入图流](motion/renders/A-paper-to-gallery.mp4) · [B 图流进入社区](motion/renders/B-gallery-to-community.mp4)。每段 4 秒，1920×960，30fps，无声。
- 桌面母版：[首屏](boards/hero-desktop.png) · [图廊](boards/gallery-desktop.png) · [社区](boards/community-desktop.png)。
- 手机草案：[首屏](boards/hero-mobile.png) · [图廊](boards/gallery-mobile.png) · [社区](boards/community-mobile.png)。

本地服务仅绑定 127.0.0.1。关闭后可在 morrow-english-site 项目根目录运行 `python -m http.server 4340 --bind 127.0.0.1`，再访问上述入口。静态设计板需要 HTTP 服务加载模块与字体；运动预演另有自身使用说明。

## 本轮制作结果

| 内容 | 文件与说明 |
| --- | --- |
| 三幕英文视觉母版 | `boards/*-desktop.png`，1920×960；美术底图加可编辑 HTML 英文排版 |
| 常规桌面重排 | `boards/*-wide.png`，1440×900 |
| 三张手机构图草案 | `boards/*-mobile.png`，390×844；文字与主体区重新排布，生产层仍待制作 |
| 材质与分层试样 | `assets/` 共 7 张：三幕底图、树皮/叶片/纸张材质板、两牌净底、透明双牌、五人物透明试样 |
| 十张关键帧 | `motion/keyframes/A0-000.png` 至 `B4-100.png`；每段进度 0/.22/.50/.78/1 |
| 两段可运行预演 | `motion/review.html` 与两份 MP4，源代码与本地运行依赖保留在 motion/ |
| 手机路径草图 | [A 路径](motion/mobile-A-paths.svg) · [B 路径](motion/mobile-B-paths.svg)，与手机文字安全区对应 |
| 设计规范与生产清单 | [design-spec.md](spec/design-spec.md)、英文文案/桌面/手机 JSON、75项待生产资产与7项本轮试样记录 |
| 复用审计 | [reuse-audit.md](spec/reuse-audit.md)：24个旧概念逐项筛选，8个近景重制、13个中远景复用、3个限制用途 |
| 制作可行性 | [FEASIBILITY.md](FEASIBILITY.md)：验证过的分层路线与 M02/M03 必须处理的边缘、阴影和裁切 |

## 设计与预演分别看什么

**静态母版定义最终质感目标。** 首屏的植物、纸牌和光照，以及社区三作品、五人物、曲带和远景密度都以母版为准。源图实际为1774×887，设计画板为1920×960；M02/M03按最终显示尺寸制作生产素材，不将母版截图当成整站交互界面。

**运动预演定义路径与节奏。** A 用独立纸牌和补齐的背景验证离枝、翻面和入流；B 让相同三件作品移动到社区，并显露人物。预演使用概念裁片、简化曲带与固定环境时间，尚未包含 M04 无限循环和 M05 正式滚动主控。材质、精确遮挡与最终界面渲染仍由后续模块完成。

透明纸牌与人物试样有局部白/黄色毛边；社区作品裁片也带有部分烘焙文字。这些均已明确列为生产重制项，不能直接当作最终图层。手机稿及路径图属于构图设计，未宣称完成手机动态实现。

## 复查与后续

实际检查记录见 [REVIEW.md](REVIEW.md)、[CUA预演结果](proof/cua-verification.json) 和 [资源元数据](proof/asset-audit.json)。图像由内置 image_gen 生成，完整提示词在 `source/generation-prompts.json`、`study-prompts.json`、`people-prompt.json`；未使用 API CLI 回退。字体复用项目已有 DM Serif Display 与 DM Sans。

本次到 M01 为止。后续 M02 从评审后的首屏母版制作独立生产图层和静态网页；M03、M04、M05继续使用稳定资产ID与本次分镜，不另行更换视觉方向。
