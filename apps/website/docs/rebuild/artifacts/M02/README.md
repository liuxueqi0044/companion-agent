# M02 — production hero

Implemented in `src/rebuild/scenes/HeroScene.ts` and `src/rebuild/styles/hero.css`.

## Composition and asset decision

The approved photographic tree remains the reference. The original 1774 × 887 master is preserved and serves as the loading/failure image. Four stationary labels remain photographically integrated. Video Editing and Research use crops from this exact master, preserving the original paper, typesetting, icon and ring instead of replacing them with approximate generated tags.

The net plate is shown only through two local feathered masks. This avoids relying on perfect registration across the whole generated net plate. Each source tether is restored in place while its tag is locally owned. When the director transfers a tag, the corresponding face and tether hide in the same update, revealing the net plate. The handoff receives the exact same face, image, rounded silhouette and geometry as the hero instance.

A second transparent extraction attempt was made with built-in imagegen. It still contained pale edge contamination and was rejected. The source and exact prompt remain in `source-art/rebuild/hero/`; that image does not ship to the webpage.

## Runtime interface

- `createHeroScene(root): SceneModule`; no private ticker, global listener, opacity ownership or navigation action.
- Stable instances: `hero-tag-video`, `hero-tag-research`.
- `sampleHandoff` returns CSS-pixel quad coordinates evaluated from the same current art position as `update`, even after the local tag is hidden.
- The `element` field is a cloneable face wrapper without the absolute layout transform. `src` is the corresponding face WebP. The bridge should not replace the face with new text or an approximated paper color.
- Whole composition retreat is evaluated from `exit`; tiny ambient drift is evaluated from the shared time/pointer. Reduced motion and static quality suppress ambient drift.
- `ready` decodes all images plus the SVG net plate. Failure keeps the original photographic master and disables separate layers. `dispose` is idempotent.

## Responsive geometry

All tag/tether positions use the original 1774 × 887 coordinate space. At desktop size the art is viewport-width, aspect 2:1, vertically centered; this yields the approved 1920 × 960 composition and the 1440 × 900 letterbox/reflow. Phone art is independently placed beneath the text at 650/390 × viewport width. At 390 × 844 its size is 650 × 325 and its top is approximately 407 px.

Actual page copy and navigation belong to the root integration. The art is decorative and does not create fake skill buttons.

## Production files and verification

[assets.json](assets.json) records actual dimensions, byte sizes and SHA-256 hashes for all 6 published images. Total: **467,556 bytes**. Assets are local WebP derivatives; original PNG files remain in `source-art/rebuild/hero/`.

Rebuild with `node tools/rebuild-hero-assets.mjs`. This script performs reproducible cropping/compression only; it does not synthesize art, erase pixels or upscale the source.

Type checking of the scene and shared types passed with TypeScript strict checking and Astro CSS module declarations. Browser verification, copy alignment, transition continuity and responsive screenshots belong to the root integration pass; this document does not claim they have already passed.

## Remaining visual limits

The source is 1774 px wide; the asset pipeline does not claim retina/4K source detail. The six tag faces remain English photographic lettering. The two bridge crops match their original image exactly, but browser screenshots should still check the feathered patch boundaries at departure and the tether release. Whole-tree and foreground motion are deliberately restrained to preserve the material and composition.
