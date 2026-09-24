# CORE-006 checkpoint

## A · trusted composition and ownership

- Added the headless runtime constructor around the original host object, architect-patched turn/contact runners and existing application. Constructor/subscription are inert; one runtime per host remains registered until actual close. Partial failure disposes only newly created resources and never closes an external host or owner.
- Added bounded lifecycle state, safe display snapshot/diagnostics, initialize singleflight, operation tracking and real `whenIdle`/dispose ownership. Focused A tests: 3 passed, including real default-off identity/policy initialization and partial owner rollback. Proceeding to B.

## B · explicit send and cancellation

- Added strict fixed `send` input normalization/hash, same-command Promise reuse, pre-submit execution reservation, saved submission classification, same-ID conflict, explicit replay of the original unknown submission, and already-submitted short-circuit. Only a newly confirmed queued turn proceeds to the existing turn runner; unconfigured execution reports a confirmed saved input without inventing work completion.
- `cancelSend` revokes continuation before submit/begin and waits an in-flight submit to classify confirmed/unknown; after runner start it calls that runner's narrow stop and reports only a confirmed permission revocation. Focused B tests: 5 passed, including real Node→Python persisted queued input and fake transport reentry/cancel/unknown replay. Proceeding to C.

## C · fixed UI methods and authoritative readback

- Exposed fixed wrappers for conversation, work, policy, memory, inbox, reminders and result controllers. Their Promise lifetimes are tracked; existing CAS, unknown/replay, pagination and result-source rules remain in the original controllers. The sole existing application change is a public handle to its already-implemented read-only `refreshHome`.
- Added one selected-turn readback after run/stop/reconcile while the same view binding remains current, coalesced identical refreshes, and inbox/home sync when the contact runner publishes committed message IDs. Normal navigation does not pulse or expose a future plan. Real C tests: 3 passed through Node→Python→SQLite→CSV/contact, including automatic completed-task display, A→B view switch, message unread/explanation and defer/cancel non-send. Proceeding to D.

## D · lifecycle, settlement, and reopen fences

- `dispose` withdraws continuation promptly, clears subscribers, and leaves the external host alive. `whenIdle` tracks runtime commands, automatic sync, both runners, provider/host/cleanup settlement and execution reservation before releasing same-host ownership. A host-wide unknown write remains fenced after read-only reconciliation and rebuilding the runtime on the same host.
- Focused D regression: 6 passed. Real deferred providers, narrow cleanup, management read/write, explicit contact stop, synchronous throwing/reentrant subscribers, duplicate close, and unknown reopen are covered. No late committed operation publishes into a disposed view or sends a new action. Proceeding to E.

## E · real offline chain and unified submission

- Added the trusted runtime demo on a fresh root: explicit send → confirmed CSV activity and source-bearing result → memory/policy read → explicit due contact pulse → inbox/explanation → close and reopen. One synthetic turn provider and one synthetic contact provider ran, maximum concurrency one; real model HTTP and credential reads zero. A delayed first home receipt exposed a two-message synchronization race; the runtime now waits for the latest committed-message revision and its regression passes.
- Full local verification: Python 121/121, Node 161/161 (142 frozen plus 19 new), private Schema byte check, five local demos, 9-file source manifest and 22 architect-artifact comparison pass. The final CORE-006 scope also passes with zero out-of-scope paths. The batch report is `submitted` for independent review; no acceptance is claimed.
