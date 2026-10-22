# M04 — curved interface gallery

Implemented source: `src/rebuild/scenes/GalleryScene.ts`, `scenes/gallery-motion.ts`, `runtime/GalleryHost.ts`, `content/gallery.ts`, `styles/gallery.css`.

The scene contains 59 image instances on four arcs in three depths: 36 distant, 12 middle, eight authored near interfaces, and three designated community works. They use shared image textures. The two far arcs and the middle/near ribbons have different speeds and directions. Quadratic bows raise the edges, tangent roll follows each arc, and card yaw reaches approximately 35 degrees at the outside. Cream edges and soft shadows separate overlapping images. All positions derive directly from the director's `ambientTime`, viewport, progress and pointer. No local RAF, timer, mutable phase or independent camera exists. Scene opacity belongs solely to the root element. The incoming flow translates from 30% viewport width and scales from .9 to 1 during A, within the same pure pose function used to sample the bridge.

## Assets

Eight independent 1800×1200 original interface masters are stored as SVG plus PNG in `source-art/rebuild/gallery/`. They are not resized legacy atlas crops. Frame, Fieldnotes, Studio Moss, Terminal / One and Atelier contain authored English interface text, working visual hierarchy, and original vector details. Milo, Orbit and Luna use three newly generated character environments. A fourth new coastal photograph supplies scenic content for Frame, Fieldnotes and Studio Moss. All four new image-generation originals are 1536×1024; their prompts are preserved beside them in `generation-prompts.json`. Built-in imagegen was used, not the API/CLI fallback.

Each interface exports 1200×800 and 900×600 WebP. The sixteen exports together occupy approximately 945 KB; runtime near images use the 1200 variants. `asset-manifest.json` records source/master/variant paths and bytes; `asset-verification.json` records verified dimensions and SHA-256 hashes. `near-assets-contact-sheet.jpg` shows all eight. Rebuild with `node tools/rebuild-gallery-assets.mjs`; verify with `node tools/rebuild-gallery-verify.mjs`.

The existing 13 approved middle/far concepts retain their exact source row crops. Three restricted images (Koi, Good Company and Commonplace) occur only in far bands at no more than 120 CSS px. Atlas UVs use a one-texel inset to prevent neighboring tile leakage. The old source atlases remain unchanged.

The community source images are the same `/rebuild/community/travel.webp`, `companion.webp` and `writer.webp` used by M03. Their content is imported directly from `communityWorks`, including the shared asset version. They are independently produced 3:2 works, with full UV coordinates and no alternative recrop in this module. A soft lower-left foliage crop from the M01 gallery art retains botanical continuity; its mask hides the baked UI/tag regions rather than adding false departed-tag copies.

## Renderer / handoff contract

`new GalleryHost(container)` creates one transparent Three.js renderer with sRGB output and `NoToneMapping`. Its orthographic camera uses CSS-pixel world units; `toWorld`, `projectMatrix`, `projectQuad` and `raycast` expose the shared coordinate system. `resize` and `render` are called by the root director. The scene does not call either internally.

`createGalleryScene(root, host, onOpen)` implements the shared `SceneModule`. All five designated instance IDs have deterministic projected TL/TR/BR/BL corners even when hidden:

- `gallery-frame` → Frame / hero Video Editing target.
- `gallery-fieldnotes` → Fieldnotes / hero Research target.
- `community-travel`, `community-companion`, `community-writer` → identical M03 work assets.

Handoff `width` and `height` are evaluated unprojected CSS dimensions, so the bridge's six-pixel radius agrees with the shader. They are not bitmap dimensions. The source images remain 1200×800. The director owns hiding via `handoffHiddenIds`. Community instances smoothly become visible from gallery progress .46 to .61, and settle into their source positions from .56 to .71, before transition B begins around .74. They do not recycle during B. Frame and Fieldnotes use reserved authored anchors through A, then smoothly join continuous, closed 78.54-second elliptical paths between gallery progress .329 and .50. Neither designated A instance uses modulo recycling. Their geometry remains continuously sampleable even if a user pauses A for minutes; no position is captured from an earlier frame.

Loops wrap beyond the entire viewport plus a full card margin. For the smallest possible period (`viewport width + 3 × card width`), either endpoint of a wrap is at least one complete card outside the visible viewport. No visible instance is moved from one side to the other. Reduced motion samples ambient time zero; static quality and unavailable WebGL use the approved gallery art fallback.

During B, the four ordinary ribbons also retreat spatially: a smooth +30% viewport-width translation, scale from 1 to .84 around the viewport center and a small upward shift. This is inside the shared pose evaluator, and is exactly the identity transform at exit zero. The three designated B source works are excluded, so their bridge anchors remain stable. The regression checker covers exit-start continuity, final scale and reserved-source invariance.

## Interaction / lifecycle

Raycast pointer release opens a stable catalog ID; movements over eight pixels are treated as scrolling. Restricted far images are not interactive. A keyboard-accessible list of the eight authored concepts and the three community works appears on focus. Inactive state disables that list. Root handles the actual dialog, focus return and scroll policy.

Background asset failures omit only those failed cards. A missing designated handoff image latches the gallery fallback and reports `ready: fallback`, allowing the root to disable the bridge. Context loss also latches fallback rather than switching halfway through a transition. `dispose()` releases every scene-owned texture/material/geometry and listener; the root separately disposes the host.

## Verification scope

TypeScript compilation passed after module implementation. All eight masters and sixteen variants pass dimensions/bytes/hash checks. All four newly generated environment images and eight UI masters were inspected through a contact sheet.

`node tools/rebuild-gallery-motion-check.mjs` executes the actual TypeScript pose evaluator, not a mirrored test implementation. It passed 31,860 finite/deterministic samples across desktop 1920×960, desktop 1440×900, tablet 900×900 and mobile 390×844; 216 complete horizontal cycles; and 216 real wrap boundaries checked on both sides. Eight hundred additional incoming-identity checks cover the discovered 68.137931-second wrap regression, clocks up to one million seconds, A entrance progress .1/.5/.9/1, and the smooth post-A release boundary. It also verifies reduced motion is independent of clock changes, and the three B source positions settle before progress .74. `motion-verification.json` records the results. Desktop loop durations are approximately 216/188/173/103 seconds for the four ribbons, with mobile 230/211/175/115 seconds; the two designated identities use 78.54-second closed orbits. Different ambient breathing frequencies intentionally do not share one complete visual period.

Actual integrated CUA screenshots, input checks and performance/transition observations are recorded by the root under M07. The first browser smoke check reported no WebGL shader errors, then a screenshot review prompted stronger arc curvature and less bottom clipping. This document does not substitute pure geometry checks for browser review. `?webgl=off` is an explicit failure-testing entry point that prevents context creation entirely.
