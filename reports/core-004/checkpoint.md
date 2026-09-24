# CORE-004 checkpoint

## A · trusted provider and process-local slot

- Added an inert default provider and a trusted runner with a per-host owner, same-turn single flight and a bounded provider timeout. Timeout, stop and dispose revoke continuation before a late provider result can be accepted. Ownership stays until provider, host and ticket-bound cleanup operations settle.
- Focused `runner-slot.test.mjs`: 3 passed. It checks no I/O from construction, unconfigured refusal, synchronous subscriber reentry and listener exception isolation, plus an abort-ignoring provider whose late reply cannot reach accept or free the owner early. No real model request or credential read. Proceeding to B.

## B · ticket-bound generation failure

- Added strict `FailGenerationRequest`, transactional exact-ticket failure, one canonical `model.failed` event, private stdio routing, host write classification, and generated JSON Schema.
- New Python cases passed with full product collection (101 total); a real Node→Python stdio case passed. Wrong, spent, stopped or replaced tickets were rejected; malformed reason/type/extra fields wrote no events. Schema check passed. Proceeding to C.

## C · controlled turn-to-tool chain

- The runner now drives begin, provider, accept, business-state validation, execute, one worker pass, and read. A real Node→Python→SQLite→CSV test completed a six-unit fictional audit and reopened the persisted result. Separate real cases cover no grant, no-action response, optional public summary and `context_changed` with no execute.
- Five fault tests passed: unknown begin/accept never replay; provider errors use one narrow failure; an unrelated worker result leaves the selected task queued; worker uncertainty cannot become completed. Read-only reconciliation retains uncertainty. Proceeding to D.

## D · stop, reconciliation and optional app binding

- `app.work` now binds only the confirmed selected session turn; normal navigation remains read-only. A's late completion is hidden when B is selected, and B cannot stop A. App disposal only removes its subscriptions; runner and host remain outer-owned.
- New stop tests passed at begin, accept, execute and worker boundaries. Repeated stop uses one stable command ID, an ignored abort keeps ownership, and cancellation does not claim worker exit. Found and fixed a second narrow failure attempt after timeout followed by stop/dispose. Proceeding to E.

## E · composition and batch close

- New offline driver uses `app.work.startSelected()` with a synthetic provider and real Node→Python→SQLite→CSV services. It verified total 6 with source references, unread task message, stable identity and completed result after reopen. A second turn was explicitly stopped while provider response was held; the late output produced no action and `worker_exited` remained unknown.
- Added a real malformed CSV case: the worker reports `failed`, and the activity projection does not claim completed. Another real queue case proves that the first worker pass may complete an older turn while the current turn stays queued; explicit `runLocalOnce` then advances it. The prior CORE-002/003 demos passed in fresh allowed roots. Full product Python collection passed 101; explicit old/new Node suite passed 88; Schema check passed. Final manifest, architect-artifact comparison and scope evidence are recorded in this report directory. No real model, HTTP, credentials or visual UI were used.
