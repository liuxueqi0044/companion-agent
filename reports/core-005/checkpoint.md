# CORE-005 checkpoint

## A · shared in-process execution ownership

- Extracted per-host, per-role ownership and one shared lease in `execution/lease.mjs`. Turn runner now claims a lease before its work, attaches reconciliation to its existing lease, and retains the architect-patched flight, pre-send, observation and dynamic pending-count behavior. An uncertain turn write marks a host-wide barrier; read-only reconciliation cannot clear it.
- Focused new lease tests: 3 passed. Existing CORE-004 runner and architect regressions: 34 passed unchanged. Contact-runner end-to-end contention is verified in C after that lane exists. Proceeding to B.

## B · narrow contact and reminder protocol

- Added strict Pydantic request types, exact stdio routing, Schema export and host read/write classification for `contact.claim/complete/fail-generation/read` and `reminder.deliver-due`. `contact.read` exposes only ID/state/canonical reason/persisted message ID; the sent ID is checked against the inbox relation. Ticket-bound failure updates only an evaluating match; the older Python contact APIs remain available.
- Full Python collection: 110 passed; new real Node→Python stdio cases: 2 passed. Tests cover send, defer, cancel, context change, delivery window, expiry, invalid decisions/times, stale/replaced/stopped tickets, malformed fields, reminder independence and conservative transport classification. Schema check passed. Proceeding to C.

## C · one explicit contact pulse

- Added a default-unavailable trusted provider boundary and a single-pulse coordinator. The coordinator delivers at most one due reminder batch, claims at most one plan only with a configured provider, strips the ticket from deep-copied reassessment context, validates one decision, completes once, and verifies the durable receipt by readback. It preserves a shared unknown-write barrier and performs at most one ticket-bound failure cleanup.
- Real Node→Python→SQLite scenarios now cover unavailable provider, sent message and reopen without duplication, defer, cancel, and proactive permission revocation. Controlled fake-host cases cover both-lane contention, synchronous subscription reentry, wrong claim identity, provider failures, unknown completion, late committed send, in-flight owner disposal, timeout with ignored abort, reconciliation and unknown cleanup. New C tests: 13 passed. Proceeding to D.

## D · stop, policy and readback controls

- Stop revokes continuation before any later send; late committed completion remains visible as a durable message fact. Reconcile is singleflight/read-only with an observation epoch and never clears the host-wide unknown barrier. Dispose retains ownership until claim, provider, cleanup and readback actually settle.
- Added real-policy tests for disabling, pausing, cancelling, topic blocking, memory forgetting, new input and expiry during evaluation; no stale output sends. Tested daily message/evaluation limits, absence of future proactive plan in normal projections, inbox basis/read state, and explicit reminder delivery after proactive revocation. Full Python collection: 120 passed at that checkpoint; Node real integration: 4 passed; Node fault cases: 9 passed at that checkpoint. Proceeding to E.

## E · combined offline verification and handoff

- Added a fixed-root test-only due-plan fixture and `product_core005_demo.mjs`. The demo exercised default-off policy, an unavailable provider delivering an explicit reminder without claim, synthetic send/defer/cancel, a foreground CSV task contending for the same host lease, maximum observed provider concurrency of one, and reopened identity/message/source-linked result. A separate off-switch case still delivered an explicit reminder.
- Closing audit tightened complete/readback reason consistency for a same-state race; the committed message remains visible if the wrapper reports outcome_unknown. New fault cases were added. Final full product regression: Python 121 passed (101 prior + 20 new), Node 126 passed (105 prior + 21 new), zero failures/skips. Schema check and CORE-002/003/004/005 offline demos passed after the correction. Development, private protocol and frontend handoff documentation updated. Preliminary scope PASS with nine authorized modified files and no outside paths; final manifest/report/scope closeout follows.
- Manifest recomputed and verified: 21 source/test/document/demo artifacts. Current CORE-004 architect manifest hash matched its frozen value; 12 of 20 files remain byte-identical, and the other eight changes are within this batch's whitelist. Report and 15 acceptance-ID evidence links validated. The batch is submitted for independent review; final authoritative scope output is in `evidence/scope-final.json`.
