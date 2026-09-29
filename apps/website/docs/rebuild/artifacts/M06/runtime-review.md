# M06 runtime review

Independent read of `StoryDirector.ts`, `TransitionLayer.ts`, `bootstrap.ts`, `Actions.ts` and their direct scene/quality contracts. This is a bounded source-and-math audit, not a substitute for root browser QA. The six defects below were found and then corrected during integration. Their original reproduction is preserved so the regressions remain understandable.

## Final verification status

**No unresolved defect remains from this bounded review.** The actual director/quality regression passes **10/10** in [runtime-check.json](runtime-check.json); actual geometry/bridge tests pass **11/11** in [the M05 geometry report](../M05/geometry-check.json). Gallery regression passes **800 designated A continuity cases**, 31,860 deterministic samples and 216 ordinary offscreen wraps in [the M04 motion report](../M04/motion-verification.json).

The source review additionally verified that community asset failures activate a complete poster scene, and that B's cloned card now receives its mobile ancestor context and current inline scale. These are source-verification claims; their exact visual appearance remains part of root browser QA.

## Confirmed issues

### 1. A can inherit a gallery wrap discontinuity

`TransitionLayer` samples the designated incoming gallery card every frame. `gallery-motion.ts` still applies the ordinary horizontal `wrap()` to those cards during A. Offscreen recycling of the local gallery card does not mean the interpolated bridge is offscreen.

Reproduced by evaluating the actual production motion module in Node: at 1920 × 960, Frame (near band, index 0), `enter=.5`, the wrap occurs at ambient time **68.13793103448276 s**. Samples 1 ms before/after have target centers **(2690.4610, 381.5093)** and **(-136.9463, 499.3174)**. The target jump is **2829.86 px**, so the approximately half-complete bridge jumps about **1414.93 px**. The loop test only asserts that the two local endpoint poses are offscreen; it does not protect the bridge.

Required fix: incoming identities must use a continuous reserved route while A owns them, and their destination/local render must use the same route. Do not merely freeze one side of the bridge or introduce a different source image.

**Resolved.** Frame/Fieldnotes now arrive at reserved authored anchors and enter a continuous 78.54 s closed orbit after A. They do not use modulo recycling. The gallery regression explicitly covers the old failing 68.137931 s boundary, million-second clocks, enter .1/.5/.9/1, and the release tangent.

### 2. Loading completion can change ownership in the middle of a transition

`StoryDirector` immediately sets `handoffsReady=true` inside the combined `ready` promise and calls `render()`. A user can reach A or B while gallery/community images are still loading. The next completion callback hides the local instances and creates already-midflight bridge instances in the same visible transition, replacing the previously chosen route.

Required fix: keep readiness separate from the active handoff route. Enable the enhanced route only at a stable chapter boundary. A transition that began with the fallback route should complete on that route.

**Resolved.** `handoffCandidate` records asset readiness; ordinary playback promotes it only outside A/B. The actual director test resolves pending assets at progress .25, verifies that ownership remains disabled there, then verifies promotion at stable gallery progress .48. Fixed-frame/review entries deliberately allow decode-before-review initialization.

### 3. WebGL context loss does not invalidate bridge ownership

`GalleryHost.ready` becomes false and `GalleryScene` latches its fallback on context loss. `StoryDirector.handoffsReady` remains true because it is only assigned by the initial asset promise. `TransitionLayer.hidden()` and `update()` continue to transfer/hide instances while the gallery shows its baked fallback master. This can duplicate the fallback's works and animate bridge objects without a live gallery destination.

Required fix: invalidate the current enhanced route when the renderer becomes unavailable and show a complete fallback route; do not keep the initial readiness boolean as a permanent renderer-health assertion.

Related source observation: `CommunityScene.ready` returns `fallback` on any failed image but does not itself activate a complete fallback master. Root integration needs to choose the full fallback when that result is returned, rather than merely disabling bridges while leaving a broken image in the community scene.

**Resolved.** The context-loss listener clears both candidate and active handoff state; a director event test verifies bridge ownership is disabled immediately. Community now hides its layered scene, activates its complete poster and corresponding work hit regions, and returns no handoff anchors while fallback is active. Its poster decode failure also suppresses a broken image icon.

### 4. Mobile layout classification is inconsistent

Hero now follows the shared `Viewport.layout`. Community still uses `layout==='mobile' || width<720` in both layout and CSS-class selection. Therefore widths **681–719 px** receive mobile community artwork while root copy remains desktop/tablet. At exactly **680 px**, `QualityPolicy` uses `<680` while the CSS mobile query uses `max-width:680px`, yielding another mismatch.

Required fix: use one inclusive 680 px breakpoint in the shared policy and have each scene trust `Viewport.layout`.

**Resolved.** QualityPolicy now uses `<=680`; hero and community trust `Viewport.layout`. Runtime checks verify 680 is mobile and 681 is tablet, and geometry checks verify the 720 px tablet source anchor.

### 5. Mobile B's cloned card lacks its destination typography context

The bridge clones `article.community-work`; the destination's `.community-mobile` class lives on an ancestor, which is not cloned. During B the clone therefore uses desktop card text sizes **6.4 / 2.6 / 3.2 cqw**; at completion the destination uses mobile **7.4 / 3.2 / 4.1 cqw**, plus different border/radius rules. This produces a visible style change at B completion even when the projected quad is exact.

Required fix: apply the mobile context to the bridge wrapper and keep the cloned `--community-scale` inline value synchronized when the viewport changes. The latter is cached by the current asset-only clone key.

**Resolved by source verification.** Bridge painting toggles `community-mobile` from the shared layout and refreshes the clone's inline `--community-scale` from the current source element. The existing clone reuse remains valid when resizing.

### 6. Modal blocking leaves pointer-driven motion active

The modal event stops Lenis and ambient-time advancement, but the global pointer handler still changes the shared pointer and `render()` still executes while blocked. Moving the mouse over an open dialog therefore moves the tree/gallery behind it. Review playback also advances `fixed` in `tick()` without a blocked/hidden guard.

Required fix: freeze pointer-driven background pose while blocked and suspend review playback advancement while a modal or hidden document owns the interaction. No need to stop dialog-local scrolling.

**Resolved.** Actual director tests verify stopped Lenis, unchanged ambient time and pointer under a modal, unchanged review progress under a modal/hidden document, then successful playback/Lenis resumption.

## Checks that passed or have a bounded result

- The root's corrected pure geometry suite reports **11/11 passing**: exact warped corner maps, folded height, source entry/exit, deterministic repeated seeks and dimension guards. This validates geometry rather than CSS appearance or renderer health.
- Fast chapter navigation uses a direct chapter anchor, and A/B geometry is sampled from progress rather than completion callbacks. No mandatory intermediate animation is required for a jump.
- Dialog switching is coordinated through one active native dialog set. Overflow restoration, Escape/native close, focus return and switching between the community/explore/share dialogs have coherent source handling. Browser interaction verification remains root-owned.
- The static/no-JavaScript layout contains full photographic fallback sections and readable actual text. Its notice accurately states that previews and drafts need JavaScript. No backend success is invented by the draft flow.
- Mobile hero text/art geometry has safe separation at 390 × 844 and 390 × 700: text ends around 321/266 px, art begins around 407/338 px respectively.
- Filesystem scan of **20 literal `/rebuild/` and `/fonts/` references** across runtime/page/styles found **zero missing paths**. Dynamic atlas/numbered-asset paths are covered by the existing asset check, not this literal scan.

## Scope

No root runtime or page files were edited during this review. Follow-up work added `tools/rebuild-runtime-check.mjs`, its evidence JSON, and updated the inert geometry-test adapter for the new clone styling API. Browser screenshots, native modal input checks, real scrolling, and GPU/context-failure verification remain with the root integration pass. The findings are intentionally limited to reproducible defects; no broader architecture replacement was proposed.
