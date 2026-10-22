# M03 — Layered community scene

Version: `m03-production-v1`, produced 2026-09-29. Browser integration and cross-scene motion are owned by M05/M07; this record covers the community assets, scene module and authored composition.

## Delivered

- `src/rebuild/scenes/CommunityScene.ts`: one deterministic `SceneModule`; no RAF, ScrollTrigger, window listeners, shared-clock mutation or global body state.
- `src/rebuild/styles/community.css`: scoped visual styling and live HTML work labels/actions.
- `src/rebuild/content/community.ts`: three stable work IDs, artwork sources, descriptions, skills and five concept illustrations.
- `public/rebuild/community/`: 30 optimized assets, 1,457,062 bytes total in first export. Exact measured dimensions/bytes/hash recorded in `manifest.json`.
- `source-art/rebuild/community/`: six full original PNG masters, preservation of generation provenance and prompts.
- `tools/rebuild-community-assets.mjs`: reproducible conversion and sprite/atlas extraction. It preserves the generated alpha; no re-painting of the masters.

The source imagery was made with the built-in image generation tool. The three featured 1200 × 800 artworks are genuinely independent full-image sources, without burned-in UI or text. They depict a coastal travel scene, a sunlit room with a dog, and a window-side writing desk. All three are shared with GalleryScene and TransitionLayer by the same URL and full UV rectangle.

## Composition

Desktop reference coordinates are 1920 × 960. Travel occupies upper middle, companion the right middle, and writer lower middle. Five full half-body illustrations surround them. Twenty subdued, independently positioned distant works form depth. The generated clean studio set supplies physical satin curves, plants and ground shadows; two separately generated foreground silk ribbons provide actual occlusion layers. The clean set is not the original flattened community screenshot: all works, people, text and bubbles were removed before production composition.

Mobile has separately authored 390-unit coordinates below the text/button safe zone. It keeps three main works, five people, twenty distant elements and two ribbons. Art anchors are derived from viewport size; cards retain 3:2 aspect. It is not the desktop screen reduced to phone width.

`communityLayout(viewport)` is exported for inspection. Local cards have analytic rotated four-corner anchors; there is no per-frame DOM geometry read. `sampleHandoff` returns the same artwork and cloneable live HTML card content, even when the card is hidden for bridge ownership. Card appearance uses container-relative type so clones scale with the animated work. Ambient movement affects only people. The source/destination works remain anchored deterministically.

## Behavior and accessibility

Root owns title, chapter text and principal CTAs. Each work action emits `data-action="open-work"` and `data-work="community-*"`; `data-intent` records Share/Discuss/Buy/Sell. These are concept entry points; this module claims no executed trade, real author, live product or publishing success. Decorative people, ribbons and distant works are hidden from accessibility APIs. Work descriptions and images have real English text, buttons have descriptive labels. Hidden/inactive cards are inert.

`frame.enter` reveals scenery, ribbons and five people in staggered depth. Reduced motion resolves decorations to their complete visible composition. Root controls scene opacity and handoff visibility. Image decode failure returns `fallback` for root's error policy.

### Asset failure protocol

CommunityScene listens to error events and decodes its actual DOM image nodes. If any layered image fails, it persistently hides and makes the entire layered scene inert, shows `/rebuild/fallback/community.webp` in an independent sibling layer, sets `#community-scene[data-community-state="fallback"]`, and resolves `ready` to `fallback` after decoding that poster. It does not leave partly broken people or empty work cards visible, and it does not switch back into a transition when an image later becomes available. `sampleHandoff` returns `undefined` in this state.

The fallback poster uses a centered 2:1 desktop composition and the M01 mobile lower crop (570 × 285 at x−180, y411 on the 390 reference width, with short-height accommodation). Three accessible, correctly mapped `open-work` hit regions preserve creation details; root title and principal CTAs stay available. If even the poster is unavailable, its broken image is hidden and root text/actions remain. Dispose removes both visual layers and aborts local error listeners.

Actual failure diagnostic: open `/rebuild?frame=0.94&time=0&assetFail=community`. Only this exact parameter deliberately substitutes the required clean-set source with a nonexistent file; valid normal-mode sources remain unchanged. Expected checks: one intentional missing-resource request; `data-community-state="fallback"`; layered `.community-art[hidden]` and inert; visible complete `.community-fallback`; stable `assetsReady="fallback"` from root; work regions and principal CTA still open details; no moving handoff anchors. Repeat at desktop and 390 × 844, then reload without the parameter and confirm `data-community-state="ready"` and the normal layered composition. Root performs browser evidence capture; this protocol does not itself claim a completed browser run.

## Checks and remaining integration checks

- Three handoff artworks are exactly 1200 × 800 with full UVs and stable IDs.
- All generated originals are preserved; asset export dimensions, byte sizes and hashes recorded.
- Five people are separate transparent assets, not circular avatars.
- Original generated alpha contains small colored fringe pixels. A browser SVG alpha edge filter applies a 0.7 CSS-pixel erosion and 0.18-pixel softening to people and foreground ribbons; source images remain unchanged. Final cream-background screenshots determine whether further refinement is needed.
- Local type checking showed no scene logic errors; direct standalone TypeScript checking requires Astro/CSS declarations for the side-effect stylesheet import. Full project check is part of root integration.
- Root must inspect actual desktop/mobile screenshots, reverse B handoff and button hit areas. This document does not claim those checks happened before integration.

### Integrated 1440 review correction

The saved `M07/community-1440.png` was visually inspected after integration. All five people, the silk installation and plant were visible, so the suspected missing layers did not justify arbitrary opacity changes. Actual defects were geometric: the companion card extended past the right viewport, a tiny distant work crowded the headline, and one foreground silk band crossed the silver-haired person's face. The companion was moved inward and resized from 430 to 385 reference units (still the identical full 3:2 artwork); the distant thumbnail moved right; the silver-haired illustration now sits in front of the intermediate ribbon and behind main works. These corrections preserve the scene's layered structure.

### Integrated mobile correction and verification

The first `M07/community-390.png` exposed excessive lower scene height and companion clipping. Mobile positions were compacted into approximately y390–735 at 390 × 844, keeping all five people and the travel/companion/writer triangle. The principal widths are now 185/150/180 units, with companion's rotated right bound near x361. Source images were not changed.

That first capture also showed a temporarily blank companion artwork and missing glasses-person body. Root inspected the actual DOM: both images were complete with correct natural dimensions (1200 × 800 and 442 × 620), correct geometry, visible styles and opacity 1. The settled `M07/community-390-v2.png` was then visually inspected: all three scenic works, all five people, silk curves and plants were present and readable as a connected composition. This was a pending browser paint, not a missing production asset. `CommunityScene.ready` already decodes the actual scene DOM images; capture verification must allow compositor settlement after decode. The scene does not create its own RAF.

## Provenance

See [generation prompts](../../../../source-art/rebuild/community/prompts.json) and [delivery manifest](../../../../public/rebuild/community/manifest.json). Twenty distant thumbnails are extracted from the existing AI concept atlases (`source-art/{companions,creative,workspaces,possibilities}.png`) and used only as tiny scenery, never featured high-resolution cards or fabricated community listings.
