> Historical development record. The Git source snapshot and current invitation profile contain only FORM / ATELIER; community character artwork is excluded. For current use, read [the invitation guide](/docs/product/INVITATION-ALPHA.md).

# CORE-017 · Distinct interaction forms

The user rejected CORE-016 as a set of visual skins around the same composition.
This revision changes the root experience and information architecture, while
retaining the existing business/controller/SDK boundary.

- Blue Hour is a full blue spatial scene. A local, decorative character state
  machine moves actual walking sprite frames, supports pointer destinations,
  dragging, arrow keys, greeting and sleep. Real task state preempts decoration.
  Conversations open in a separate scene window; the bottom input is a small dock.
- FORM is a single-entry focus surface. No sculpture, promotional paragraphs,
  suggestion buttons, sidebars or persistent status row. History and capabilities
  live in the invited menu. Input options appear only when requested.
- ATELIER is an open two-page journal: read on the left, write on the right;
  memory/tools/inbox are physical index tabs. Real artifact receipts remain in
  the reading page, with a link from the writing page. Narrow windows stack pages.

The three Vue root components own only presentation state. They use the existing
controller's conversation and composer nodes, retain shared drafts and the same
SDK permissions, and never own/cancel the runtime during theme switches. Character
movement is cosmetic, does not imply consciousness, and sends no model requests.
It stops in hidden tabs, respects reduced motion and cancels timers on unmount.

`companion-motion.mjs` is pure and separately testable. Existing source size/CSP
boundaries remain unchanged. CORE-016 is preserved under its historical report;
source backup is in `.test-data/core017-before-*`. Artwork rights/provenance still
follow `characters/NOTICE.md`. This is not commercial installer publication.
