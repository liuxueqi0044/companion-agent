# CORE-020: reliability and maintainable product entry points

Scope: fix crash-held locks, accumulated context overflow, recency-only memory lookup,
and stale/default build and test entry points. Preserve user data and historical reports.
All verification is offline in fresh roots; no credentials, model calls or assistant sessions.

1. Replace existence-based locks with Node's bundled SQLite OS transaction locks.
   Verify abrupt subprocess termination, live-owner exclusion and recovery without replay.
   Preserve unknown legacy lock files: their ownership cannot be inferred safely.
2. Pack provider context by serialized UTF-8 bytes. Preserve current input, permissions,
   policy and execution receipts. Omit optional older context explicitly, never fabricate
   summaries or delete stored history.
3. Retrieve across all permitted memory records using query relevance plus durable
   preferences within bounded output. Preserve disabling, deletion and temporary-mode rules.
4. Point default build/check/test commands at the actual product. Resolve dependencies
   from this checkout or explicit environment overrides, never a named sibling checkout.
   Document the remaining JavaScript typing boundary honestly.

Acceptance: subprocess crash regression, repeated long-turn adapter regression,
old relevant memory retrieval and privacy regressions, relocatable build/check/test
entry points, then full product Python/Node regression. Release and cross-machine
validation are separate from this source fix.
