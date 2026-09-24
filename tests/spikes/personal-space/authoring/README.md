# Personal Space authoring kit (private offline spike)

This is `authoring-kit/1` plus `space-client/1` for the existing `demo/1` host. It accepts three UTF-8 author files: a **body fragment** in `view.html`, CSS in `view.css`, and a **classic script** in `view.js`. Layout and interaction are free source code. There is no theme or component catalog. This tool never runs author source; only the registered repository fixture in the integration test is executed.

## Client API

The builder prepends fixed `client/client-runtime.js` to author `view.js`; do not copy the raw MessagePort protocol into author code. `window.PersonalSpace` exposes:

| Method | Result |
| --- | --- |
| `connect({timeoutMs?})` / `whenReady()` | Resolves after a valid active state projection, not after sending ready. Rejects when no host becomes usable. |
| `snapshot()` | Independent copy of the latest authorized demo projection, or `null`. |
| `subscribe(callback)` | Receives independent projection copies; returns unsubscribe. |
| `refresh(timeoutMs?)` | Requests an authorized fresh projection from an active connection. Timeout must be an integer from 1 to 60000 ms. A timeout or invalid read receipt freezes further reads on that connection. |
| `saveDraft(text, timeoutMs?)` | Resolves `{saved:true, revision_id}` only on the matching host ACK. One write can be pending. A timeout freezes writes until explicit `reconnect()`. |
| `dispose()` / `reconnect()` | Close this connection or create a new SDK object waiting for a fresh host init. `reconnect()` does not re-mount the host. |

```js
const status = document.querySelector('#status')
window.PersonalSpace.subscribe(state => {
  document.querySelector('#draft').value = state.draft
})
window.PersonalSpace.connect().catch(error => { status.textContent = error.code })
document.querySelector('#save').addEventListener('click', async () => {
  try {
    await window.PersonalSpace.saveDraft(document.querySelector('#draft').value)
    status.textContent = 'Saved'
  } catch (error) { status.textContent = error.code }
})
```

The host grants `read_demo_state` and `write_demo_draft` independently. Requested scopes in a package do **not** grant access. No shell, filesystem, arbitrary network, task completion, or real memory API is provided. Save timeout can mean the ACK is unknown; this SDK never retries automatically. The message contract has a connection-level `request_id`, so a read timeout also leaves its reply ambiguous. The SDK freezes reads on that connection and requires the host to call `MountCoordinator.recover()` to establish a new channel. SDK `reconnect()` alone remains `waiting_init` until the host sends a new init. The host recovery path reads its stable draft before another save; it does not repeat the unknown write.

## JSON command line

Run `node tests/spikes/personal-space/authoring/workspace/cli.mjs` from the repository root. Send exactly one UTF-8 JSON request on stdin, receive one JSON response on stdout. Production storage is fixed at `reports/evidence/BATCH-013-R1/workspaces/`; the command has no root override. Exit 0 means a command returned a result, 2 means a classified request/workspace error, 3 means an unexpected internal error. Input and output are each capped at 128 KiB.

Commands and required fields:

| command | fields besides `command` |
| --- | --- |
| `create` | `workspace_id`, `format:"authoring-kit/1"`, `files` (all three), `source_type`, `origin`, `requested_scopes` |
| `read`, `history`, `check`, `build`, `repair-packet` | `workspace_id` |
| `change` | `workspace_id`, `expected_head`, `changes` (one to three complete file replacements) |
| `restore` | `workspace_id`, `expected_head`, `target_revision` |
| `apply-repair` | `workspace_id`, `packet`, `expected_head`, `source_hash`, `changes` |

`expected_head` is the **64-hex `head.integrity` CAS token** returned by `read`, not a revision name. A successful edit or restore returns a new head token and invalidates the current check/build pointer. `history` lists immutable author revisions and operations. `build` returns a core effective revision and a private receipt; it never activates a host view. A failed build leaves `last_good_build` intact. `current_check_valid` means a check receipt still matches the current source and tools; `current_check_passed` also requires a passing validation. Only a passing build receipt can make `current_build_valid` true. Damaged pointers or receipt/source relationships return `recovery_required` without resetting the head.

Example request:

```json
{"command":"create","workspace_id":"demo-author","format":"authoring-kit/1","files":{"view.html":"<main id=\"status\">Waiting</main>","view.css":"main{padding:8px}","view.js":"window.PersonalSpace.connect().then(() => { document.querySelector('#status').textContent = 'Ready' })"},"source_type":"handwritten_fixture","origin":{"kind":"handwritten_fixture","reference":"repo_fixture:plain"},"requested_scopes":["read_demo_state"]}
```

Workflow for a later coding agent: `read` current author files/head → `check` and inspect diagnostic positions → `repair-packet` if a bounded source packet is needed → submit complete changed file(s) via `apply-repair` with the packet token, or `change` with the head token → `check` → `build` → inspect the receipt and separate host trust gate. `restore` moves only the author head to an earlier immutable source revision; it does not undo host state, tasks, memories, or external actions. A repair packet contains the selected source verbatim and is local material, not automatically anonymized or sent to a model.

## Hashes and provenance

`author_source_hash` hashes length-framed `authoring-kit/1` and original three file bytes. `sdk_hash` hashes the exact fixed SDK bytes. `validator_hash` hashes the validator source and actual local parser entry bytes (parse5, TypeScript, PostCSS, Babel). `builder_hash` hashes builder source. `effective_source_hash` is the core `build_input_hash` of SDK plus author code in `view.js`; `artifact_hash` hashes the assembled HTML bytes. `validation_report_hash` hashes the serialized validation report. The author script and effective bundle both pass strict Babel classic-script parsing without TS/JSX or top-level return/await allowances. Core stage/seal/read verifies the effective manifest and bytes before the private build receipt is published. Changing source, SDK, validator, or builder makes old current flags false or removes the current receipt pointer. Old legal version-1 receipts remain readable as historical records; mismatched hashes do not turn them into current builds.

`model_candidate` stays `model_candidate` through manual developer revisions. The BATCH-012 descendant's BATCH-013 author source is read without modification and revalidated in a new R1 workspace. It is only parsed, built, and stored; no model code is run, previewed or registered. Static pass does not prove semantic fit, safety, browser behavior, native isolation, or visual quality. The trusted integration test registers only `fixtures/plain` with the existing `MountCoordinator` in jsdom. No arbitrary package registration path is added to product code.
