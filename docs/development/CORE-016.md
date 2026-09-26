> Historical development record. The Git source snapshot and current invitation profile contain only FORM / ATELIER; community character artwork is excluded. For current use, read [the invitation guide](/docs/product/INVITATION-ALPHA.md).

# CORE-016 · Three personal spaces

The user authorized the architect to implement three complete initial UIs:
community chibi whale girl, ordered technological minimalism, and a warm Claude-
inspired study. This is starter UI production, not natural-language UI authoring.

## Architecture

- Keep the existing runtime, SDK, shared draft, conversations and authority.
- `app.mjs` owns the existing actions. `starters.mjs` owns three root compositions.
- `appearance.mjs` persists only `starterTheme` inside package UI state using CAS.
  It preserves unrelated fields and serializes selections. No conversation remount.
- `styles.css` retains existing task/panel structure; `starters.css` supplies the
  three palettes, layouts, responsive forms, activity surfaces and reduced motion.
- `defaultSource({starter, standalone})` can export three independently identified
  initial source packages with the same stable SDK. No new host privileges.
- The whale is a real prepared Q-version sprite, CSS-positioned from unchanged
  PNGs. Other illustrations are original CSS/SVG. No external fonts/assets at run
  time, dependencies, model requests or generated host code.

## Experiences

1. 蓝鲸小窝: slim navigation rail, blue cove, a blinking/touch-reactive chibi
   companion, soft conversation surface and genuine thinking state.
2. FORM: centered monochrome composition, moving silver sculpture, low-chrome
   navigation, concise suggestions and generous readable activity records.
3. ATELIER: paper/terracotta palette, study sidebar, editorial Chinese typography,
   quiet prompts and warm task/artifact presentation.

Appearance is opened with “换个样子”. Selections apply immediately. Memory, contact,
history, tools and model connection remain available; source recovery is retained
under appearance. Memory defaults and proactive opt-in rules are unchanged.

## Verification

Test persistence, late hydration, serial selections, conflicts, preview read-only
behavior, source builds and existing host security/draft isolation tests. Open all
three in a real browser on a fresh offline host. Check desktop/narrow layout,
draft preservation across selection/reload, real local reply/artifact, memory
entry and dialog keyboard behavior. No real user turns are used for testing.

## Distribution boundary

The community Q-version artwork's commercial redistribution rights remain
unconfirmed. See `apps/desktop/personal-space/characters/NOTICE.md`. This local
design delivery is not a commercially cleared installer release. The complete
interface remains source-replaceable; these are starting points, not limits.
