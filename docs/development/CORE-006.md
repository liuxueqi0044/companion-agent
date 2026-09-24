# CORE-006 · trusted headless product runtime

`apps/desktop/product/runtime/index.mjs` exports `createProductRuntime({host,intent?,turnProvider?,contactProvider?,timeoutMs?,timers?})`. The trusted Node owner supplies the original `createProductHost(...)` object to this one entry point. The runtime constructs the existing application, turn runner, and contact runner around that **same host object**. Construction and subscription perform no I/O; `initialize()` explicitly reads bootstrap and policy. The default providers are unavailable, so a saved user input can remain queued without any claimed model work. No UI page or native isolation is included.

```js
const host=createProductHost({python,workspace,dataRoot})
const runtime=createProductRuntime({host,intent:trustedIntent,turnProvider,contactProvider})
try {
  await runtime.initialize()
  const stopListening=runtime.subscribe(renderTrustedProjection)
  // Bind fixed user actions to runtime.send/open/ui, never to host.request.
  stopListening()
} finally {
  runtime.dispose()
  await runtime.whenIdle() // waits for real provider, host request and narrow cleanup settlement
  await host.dispose()      // host remains the caller's resource
}
```

Only the trusted owner injects `intent` and providers. The runtime and its `diagnostics()` are trusted Node APIs, **not** a general bridge to generated HTML. A later native boundary must validate origin and expose specific intents. One live runtime owns a host object until its actual close; partial constructor failure releases only newly created resources. `snapshot()`/`subscribe(fn)` return the existing display projection plus runtime state (`initialized`, `closing`, `closed`, pending count, execution busy, safe send phase). They omit the raw CSV, ticket, grants, provider context, paths and future contact plan.

## User actions and return facts

- `send({command_id,conversation_id,text,csv_text?,temporary?})` requires two trusted, retained UUIDs and rejects extra fields. The trusted `intent` callback supplies capabilities. Same command and frozen input share one in-flight Promise; the same ID with different input conflicts. A different command while execution is reserved fails **before** it can save a second turn. A confirmed queued submission runs the turn runner once; an existing nonqueued turn returns `already_submitted` without regenerating. With no model, the returned `stage:'execution'`, `submission:'confirmed'`, `error:'model_not_configured'` means the input is durably saved and queued, not completed.
- `cancelSend({commandId})` only targets this in-flight send. Before submit, it blocks transmission. While submit is pending, it waits to classify the real outcome and blocks begin. After the runner starts, it calls its narrow stop. `cancelRequested` and `permissionRevoked` are separate; only a confirmed stop receipt can set the latter. `workerExited` stays null without trusted evidence. Saved input is not deleted.
- A submission with `submission:'unknown'` never begins automatically. `ui.conversation.replaySubmit()` is an **explicit** replay of the same held command and authorization and only confirms the submission; it does not generate a reply. Runner unknown blocks both execution lanes. Read-only `ui.work.reconcileSelected()` or `reconcileContact()` observes facts and does not clear a shared unknown or replay writes.
- `ui.conversation`, `policy`, `memory`, `inbox`, `reminders`, `result`, and `work` are fixed wrappers over the existing controllers. They preserve selection, policy CAS, memory unknown acknowledgement, reminder command replay, result source references and pagination. Use `ui.work.startSelected/runLocalOnceSelected/stopSelected/reconcileSelected` only for explicit user work actions. These are not an alternate generic host request interface.
- `open({panel,...})` and `refresh()` read the selected panel. `send` and explicit work operations bind execution to the confirmed turn ID. If still selected after completion, the runtime coalesces a real readback and returns `view:{synced,error}` separately from the execution result. Navigation to another turn prevents old readback from taking over that view. A successful `execution.phase` alone does not prove a CSV task completed; display `snapshot().activity.taskStatus` and source-bearing result only after actual task evidence.
- `pulseContact()`, `stopContact()` and `reconcileContact()` belong to the **trusted host owner**. No normal initialization, navigation, refresh or send calls pulse, enables proactive policy, migrates, recovers or launches a worker by itself. A pulse may deliver due explicit reminders; only a committed message ID triggers a coalesced home unread read and, if inbox is open, inbox refresh. Defer/cancel do not invent messages. No background timer or system notification is installed.

All commands return `{ok:true,result}` or `{ok:false,error}` with safe error codes; `send` also identifies `stage` and `submission` where needed. Do not treat a view sync error as permission to rerun the model or tool. CAS conflicts require a fresh read and a new user decision. A non-idempotent memory add with unknown receipt is never automatically resent. Reminder replay uses the controller's preserved command and only on an explicit user action.

## Close, reopen, and verification

`dispose()` promptly marks closing and invalidates continuation and subscribers. It does not close the host and does not pretend that an abort-ignoring provider exited. `whenIdle()` waits for public commands, automatic reads, both runners, provider/host/cleanup settlement and the shared execution slot before a same-host runtime can be built again. If external work never settles, the trusted host owner must report pending status and decide native process policy elsewhere; there is no fake timeout completion.

For a fresh host process, create a new runtime and call `initialize()` to read identity and policy, then explicitly `open` the needed turn/inbox/result. Existing SQLite state and unknown outcomes remain authoritative. Normal reopen does not run `runtime.recover`, migrate, replay unknown commands, start model generation, start the local worker or pulse contact.

`tools/product_core006_demo.mjs` exercises a fresh local Node→Python→SQLite→CSV path with one synthetic turn decision, one synthetic contact decision, due reminder fixture, real result source references, inbox explanation and close/reopen. Controlled tests cover unavailable model, unknown submit, cancellation, navigation races, delayed cleanup and ownership. The demo's `real_model_http_requests` and `credential_reads` are zero. Natural-language understanding, real model requests, native IPC isolation, background scheduling, system notifications and product visual review remain `not_run`.
