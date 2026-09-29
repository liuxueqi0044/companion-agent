# M07 — Final frontend verification

Verified 2026-09-29. This is a local frontend delivery; no public deployment or backend release was performed.

## Delivered behavior

- `/` and `/rebuild/`: the new English marketing site. `/legacy/`: preserved earlier implementation.
- Photographic layered hero with six readable skill cards; two cards become interface panels during A.
- Curved Three.js gallery with 59 instances, eight independently authored near-field interfaces and smaller background concepts.
- Community composition with three continuous works, five illustrated people, plants, ribbons and distant works.
- One GSAP/Lenis clock; reversible, progress-driven A/B handoffs; independent phone composition; reduced-motion and unavailable-resource fallbacks.
- Native dialogs, a 24-item concept library, category filtering, work details, downloadable concept recipes and local JSON creation drafts.

## Verification and limits

| Check | Observed result |
| --- | --- |
| Astro check | 0 errors, 0 warnings, 1 unused-helper hint in the asset authoring script |
| Production build | Four static routes built successfully; final code build 2026-09-29 14:40:13 UTC |
| Geometry | 14/14 checks, including projective corners, ownership endpoints and reverse re-entry |
| Gallery | 31,860 deterministic samples, 216 ordinary cycle/boundary cases and 800 designated-track continuity cases passed |
| Director | 10/10 logic checks covering readiness, context loss, modal/visibility pause, seeking and breakpoints |
| Viewports | DOM dimensions and no horizontal overflow checked at 1920×960, 1440×900, 1280×720, 768×1024, 390×844 and 360×800; see viewport-checks.json |
| Visual composition | Desktop, phone and portrait tablet inspected in Chromium; actual production route also inspected after traversing hero → community → hero |
| A/B playback | Four fresh-browser forward/reverse captures, with all bridge objects `display:none` at completed endpoints; replay-checks.json |
| Dialogs | Download, community, library, work detail and draft flow exercised; Escape restored the triggering control and cleared body overflow lock |
| Library | 24 total concepts and 8 Creative entries observed after filtering |
| Draft | Actual browser-generated JSON file saved and inspected; draft-download-proof.json |
| Reduced motion | No canvas allocation. Horizontal overflow found during QA was fixed and rechecked at 1280 px |
| WebGL unavailable | Gallery fallback displayed, no canvas created, handoffs disabled |
| Required community image missing | Whole-scene poster and three accessible work targets displayed; handoffs disabled |
| Asset inventory | No missing runtime files or source paths; diagnostic missing-image request is intentional |

The VFR MP4 captures sample the browser at roughly 5–6 frames/sec because screenshots are serial. They preserve captured timestamps and are geometry/sequence evidence, **not a measurement of website frame rate**. Use the live site to judge motion. No Lighthouse score, Safari/iOS hardware test, or real low-end-device frame-rate claim is made.

## Issues caught and resolved during integration

1. A source anchors initially discarded current ambient offsets, causing a small entry jump. Sampling now uses the rendered source pose.
2. Reserved gallery instances wrapped while the handoff was active. They now transition into continuous orbits.
3. Late asset readiness could change ownership inside a transition. Promotion now happens at a stable chapter.
4. Modal focus restoration needed an explicit opener. Native Escape now returns focus correctly.
5. Hidden bridge parents retained visible cloned descendants after a full live traversal. Inactive bridge subtrees now use `display:none`; three regression assertions and fresh production traversal verified the fix.
6. Static fallback sections could grow beyond viewport width due to aspect ratio plus minimum height. Width is now explicit.
7. Hard navigation now disposes scene resources; BFCache pages retain their live state.

## Authoritative screenshots

- `production-home.jpg`, `production-community.jpg`: final production build, normal continuous chapter navigation.
- `gallery-1440x900.jpg`, `community-1440x900.jpg`: desktop scenes.
- `hero-390x844.jpg`, `gallery-390x844.jpg`, `community-390x844.jpg`: phone scenes.
- `community-768x1024.jpg`: final production tablet scene after continuous navigation and resize.
- `library-mobile.jpg`, `reduced-motion.jpg`, `webgl-unavailable.jpg`, `community-image-failure.jpg`: functional/fallback states.

Earlier screenshot experiments remain in the workspace for traceability. Files captured with the browser's clipped screenshot option showed a 1.5× coordinate mismatch and must not be treated as pixel-size evidence. Only the above list is included as M07 screenshots in the source delivery. Raster pixel dimensions are reported in `delivery-screenshots.json` separately from CSS viewport sizes. A stale automation tab also stalled image painting after repeated viewport/navigation changes; fresh tabs were used for the final captures. This was not attributed to a proven product-code cause.

## Product boundary

Concept imagery illustrates possible assistant forms. It does not claim existing users, sales, or installable packages. Download/community buttons explain availability. Accounts, cloud storage, publishing, payments, and real skill installation are backend work outside this frontend delivery. No simulated purchase or publication succeeds silently.

## Reproduce

Run the commands in the project README. `/rebuild/?review=1&time=0` provides chapter and A/B controls. `/rebuild/?replay=A` and `?replay=B&reverse=1` play the actual transition implementation. See M05/TRANSITION-EVIDENCE.md and the neighboring JSON reports.
