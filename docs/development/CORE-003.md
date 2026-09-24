# CORE-003 headless application handoff

`apps/desktop/product/application/index.mjs` exports `createProductApplication({host,intent?})`. The trusted Node owner creates the existing `createProductHost` with fixed Python, workspace and data root, then creates the application. The application owns its controllers and session; it never owns or closes the host. Do not pass the host or application object into generated HTML. A future native bridge must expose narrower verified intents.

Construction and subscription do no I/O. `await app.initialize()` explicitly calls `bootstrap` and reads policy; `migration_required` is returned to the trusted owner and never auto-migrated. `app.open({panel})` selects one of `home`, `conversation`, `memory`, `contact`, `inbox`, `reminders` and reads only that panel. `app.refresh()` reads the current panel. `app.snapshot()` and `app.subscribe(fn)` provide cloned, whitelisted display state. `app.dispose()` removes subscriptions, invalidates late reads and leaves the shared host and local worker alone. No timer, tick, model, recover, or worker command runs during navigation.

| Application access | User action / host command | Binding and handling |
| --- | --- | --- |
| `app.conversation` | Existing session load/open/select/refresh/submit/replay/stop | Current selected turn and stop receipt drive `snapshot().activity`; old selection cannot operate. `intent` is supplied by the trusted owner. |
| `app.policy.refresh`, `refreshContact` | `policy.read`, `contact.controls` | One confirmed revision for memory and proactive contact. Controls expose blocked topics, never future plans. |
| `app.policy.updateMemory({expectedRevision,patch})` | `policy.replace {expected_revision,policy}` | Only `memory_enabled`, `memory_categories` may be patched. Full policy is assembled from a confirmed copy. |
| `app.policy.updateContact({expectedRevision,patch})` | `policy.replace {expected_revision,policy}` | Only contact preferences from the frozen contract may be patched. Default proactive contact is OFF; opening a page never enables it. |
| `app.policy.blockTopic/unblockTopic({topic})` | `contact.block-topic`, `contact.unblock-topic` | Only the fixed three topics. No `contact.inspect`/`tick` in the app. |
| `app.memory.refresh/loadMore/select` | `memory.list {limit:50,before?}` | Live descending cursor, no snapshot-isolation claim; selection binds confirmed ID and revision. At most 200 displayed items. |
| `app.memory.add/edit/forget/clear` | Existing `memory.*` | Edit/forget freeze selected ID/revision. `clear({confirmed:true,expectedPolicyRevision})` requires explicit confirmation. A successful change invalidates and reads shared policy; memory OFF does not erase or block management. |
| `app.inbox.refresh/loadMore/select/explainSelected/markRead` | `inbox.list`, `inbox.explain`, `inbox.read` | `markRead` requires a displayed ID. Opening does not mark read. `home.unreadCount` is refreshed from `home`, not decremented optimistically. At most 200 displayed items. |
| `app.reminders.refresh/loadMore/select/create/update/cancel/replayPending` | `reminder.list/read/create/revise` | Creation/update/cancel use frozen `command_id`; cancel is `reminder.revise(operation=cancel)`. Explicit reminder time is displayable. At most 200 displayed items. |
| `app.result.open({taskId})`, `loadMoreRows/Issues` | `task.result` | The app supplies the confirmed current session turn internally. Only completed `csv.audit` with matching task/current attempt opens. Rows and issues have separate offsets, 50 per read, 500 retained per side. |

All command methods return `{ok:true,result}` or `{ok:false,error}`. `snapshot/subscribe/dispose` and pure `projectActivity` are local methods. Public errors are stable codes; transport exception text, stderr, paths, tickets, grants, internal request hashes and dedupe keys are omitted. The app does not persist a second business state. Python/SQLite remain authoritative.

## Unknown receipts, races and lifecycle

- A policy conflict re-reads the current revision for display; it does not replay or merge the previous patch. After `outcome_unknown`/transport failure, explicitly refresh before a new user intent. A read shows current state but cannot prove which uncertain write produced it.
- `memory.add` has no command idempotency key. An uncertain add/edit/forget/clear stays unknown and is never automatically resent. `memory.refresh()` after the unknown may help the user reconcile; `acknowledgeUnknown({operationId})` only releases the gate and returns `confirmed:false`. Equal text or list length does not establish success. An app restart cannot promise exactly once for that old memory operation.
- A reminder unknown retains its exact command, target, revision and body privately. `replayPending()` is explicit, single flight and uses the same payload. Receipt IDs/revisions are checked; an unrelated success remains unknown. A definite conflict requires reading current reminder and a new user intent.
- Every controller invalidates older reads on refresh, selection, write start, panel exit and dispose. Deactivation clears displayed records but retains an unresolved write record. Returning to the panel reads it anew. Results are invalidated when session selection or task attempt changes.
- Inbox read and topic block do not have a generic retry queue. An unknown read can be checked by fresh list/home reads; repeating it is a new explicit intent. Normal chat/home never exposes planned proactive due times.

## Activity and result truth

`projectActivity({turn,stop})` keeps `turnState`, action state, current task/attempt/status, provider summary, validated events, reconciliation and cancellation flags separate. A model reply saying “done” cannot complete a task. `workerExited` and percent progress remain `null` without a trusted source. Historical attempt events are marked historical; foreign task events mark a protocol error. A cancel or permission revocation is distinct from actual worker exit. CSV result metadata preserves `completeness`, currency subtotals and `requirements_interpretation:not_run`; missing columns or mixed currency do not gain an invented total. Source references remain on rows.

## Verification boundary

The `tools/product_core003_demo.mjs` driver alone calls `turn.begin/accept/execute`, `worker.run-next` and `tasks.sync` with a clearly synthetic decision. The application only reads their resulting facts. The demo uses a fresh data root and reopens identity, policy, turn, result and reminder. Tests exercise real Node→Python→SQLite behavior and controlled transport races. Real model semantics, native IPC isolation, system notifications, background life after app close, semantic memory search and product visual review remain `not_run`.
