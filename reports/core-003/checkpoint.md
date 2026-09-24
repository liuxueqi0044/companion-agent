# CORE-003 checkpoint

## A · shared policy control

- Added inert state/transport helpers and `createPolicyController`. Policy reads and contact controls share one revision, patch fields are whitelisted, CAS conflicts read current state without resending the old write, and uncertain writes require a later explicit read. Display listeners are isolated; the flight is registered before busy notification.
- Focused Node test: 4 passed, including synchronous listener reentry, dispose before send, real Node→Python policy CAS and hostile error sanitization. Proceeding to B.

## B · memory management

- Added bounded live cursor paging, selection-bound edit/forget, explicit clear confirmation, lifecycle read invalidation and shared-policy refresh. The memory write gate retains only metadata in snapshots; unknown `memory.add` has no replay and requires a later successful list read plus explicit acknowledgement.
- Focused Node test: 3 passed, including real add/edit/forget/clear while memory is OFF, a lost real add receipt with exactly one persisted row, and read/selection races. Proceeding to C.

## C · inbox and explicit reminders

- Added bounded inbox paging, explicit mark-read and selection-bound explanation. Default reads never mark a message read; the public item whitelist removes `dedupe_key` and the home unread count remains a separate authority.
- Added reminder list/read/create/revise controls. Pending writes freeze command ID, target revision and body; a lost receipt can only be explicitly replayed with the same command. Cancel uses `reminder.revise(operation=cancel)`.
- Focused Node test: 3 passed, including real create/revise/cancel and a dropped real create receipt, synchronous replay reentry with wrong receipt, and inbox selection/read boundaries. Proceeding to D.

## D · activity and result reading

- Added a pure activity projection that keeps turn, action, task, attempt, cancellation and event facts separate. Model reply text never promotes a task to complete; bad event ownership marks protocol error. Added attempt-bound result opening and independent bounded row/issue cursors.
- Focused Node test: 4 passed, including status tables, foreign/historical events, real mixed-currency and missing-column CSV artifacts, and old selection rejection. Proceeding to E.

## E · application composition and handoff

- Added the trusted headless `createProductApplication` facade, named controller methods, panel lifecycle and current-session result binding. Normal navigation only reads; the separate demo driver explicitly injects a synthetic decision and invokes the local worker.
- Focused application test: 2 passed. Actual fresh-root demo completed and reopened identity/turn/CSV total 6/policy/reminder with zero forbidden navigation commands. API and uncertainty handoff is documented. Proceeding to complete regression, manifest, scope and submitted report.

## Batch close

- Complete regression: 99 Python and 43 Node passed, zero final failed/skipped. Schema and both old/new offline demonstrations passed; the new driver observed no forbidden application navigation command.
- Sixteen delivered source/test/demo/documentation files match the manifest. All 15 architect-verified artifacts were checked: 14 unchanged, and the one authorized `frontend-handoff.md` extension is separately recorded. `report.json` and `summary.md` are submitted; final scope evidence is `evidence/scope-final.json`.
- No independent acceptance or CORE-004 work has been performed.
