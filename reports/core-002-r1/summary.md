# CORE-002-R1 implementation summary

Status: **submitted** for independent review. This revision addresses the four reproduced CORE-002 defects in the separate `companion-agent-core` workspace.

- A: an older input turn cannot begin a new generation once the same conversation has a later input. A result overtaken during generation is discarded; latest-turn retry and unrelated conversations remain valid.
- B: the selected view publishes only the newest owned read. Stop invalidates earlier reads, blocks concurrent refresh, and keeps repeated stop replies from replacing newer state.
- C: each submit retains a deep-copied command, material, conversation and grant. Concurrent replay is single flight; only a matching receipt clears that record. A lost real Node→Python receipt was replayed into the same persisted turn.
- D: v1 migration preflight checks tables, indexes, triggers and views before writes. Unexpected objects and malformed databases are rejected; controlled interruption rolls back schema and data changes.
- E: frontend and contract handoff guidance was updated; the original offline local service demo still reopens stable identity, turn and task and completes its CSV audit.

Verification: 95 Python tests and 19 Node tests passed; schema check and offline demo passed. The 13 delivered source, test and documentation files match `artifact-manifest.json` (`e1748010adc042180535b34cc522ae1fb84aa396c59f9452445e40f609758ed4`). The authoritative R1 scope result is in `evidence/scope-final.json`. See `report.json` for the per-ID evidence and boundaries.

No model or HTTP request, credential read, installation, visual UI change, Git operation or deployment occurred. Real model semantics, native isolation, operating-system notifications, persistent scheduling and product visual review remain `not_run`. The prior CORE-002 report and review remain unchanged; this is an implementation submission, not independent acceptance.
