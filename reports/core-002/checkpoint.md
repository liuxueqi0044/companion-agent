# CORE-002 checkpoint

## A · context and storage (2026-09-24)

- Reproduced the stale proactive delivery with a failing fresh-root regression, then added shared stable context signatures for turn and followup generation. History filters temporary/forgotten sources before the 12-item limit and before the current turn.
- Added v2 bootstrap and explicit transactional migration of the frozen v1 DDL. Tests cover data preservation, replay, rollback and malformed structure. No historical database was used.
- Current regression: 63 passed, 2 existing reminder tests fail because package C must update the old positional INSERT for the planned v2 reminder revision. Continue with B then C; no claim of final green state yet.

## B · reopenable conversations (2026-09-24)

- Added deterministic keyset snapshots for conversation.list and conversation.turns over the existing turn journal. Temporary inputs are omitted from browse, and summaries carry only bounded previews and state. Full turn detail remains explicit.
- Fresh-root reopen, same-timestamp pagination with concurrent insertion, empty/invalid pages and private-material tests pass. Interim run: 72 passed, the same two C-dependent reminder tests failing. Continue with C.

## C · explicit reminders (2026-09-24)

- Added strict create/read/list/revise contracts, positive revision, transactional command log and CAS updates. Delivery and both cancel paths advance revision. Original create hash stays immutable; replay after an edit returns the current reminder without resetting it.
- Reopen, edit, due delivery, command replay, invalid shapes, terminal states and proactive-off behavior are covered. Interim Python run: 77 passed. Continue with D.

## D · durable stop and headless session (2026-09-24)

- `turn.stop` persists revocation and stable per-task cancel IDs before calling the existing task service. Unknown submits retain their original action ID for reconciliation. A real subprocess worker observed cancellation; a separate hard-exit probe after task DB cancel replayed the same stop command.
- Added a trusted-host-only headless session with generation-bound selection, frozen stop target, idempotent unknown-submit replay and narrow presentable snapshots. Delayed A/B, stale refresh and dispose tests pass (4 Node tests). Interim Python run: 81 passed. Continue with E.

## E · integration and handoff (2026-09-24)

- Extended trusted Node allowlist/read classification, regenerated the Python-owned JSON Schema and documented the action projections plus session wiring. No page or CSS was authored.
- Final raw run: Python 83 passed; explicitly enumerated Node files 11 passed; schema check PASS. Offline Node→Python→SQLite→CSV demo reopens the same profile/conversation/task, total 6, and reads edited reminder revision 2.
- Artifact manifest: 21 entries, recomputation PASS, SHA-256 `b184049c088f9d7edac978520fb85646f1f2cd5c4b5a1131ca5cd8307be75589`. The authoritative scope checker returned PASS with no outside changes on the report-inclusive run and final rerun. Submitted for independent review, no self-acceptance.
