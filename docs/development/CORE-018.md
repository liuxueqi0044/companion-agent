> Historical development record. The Git source snapshot and current invitation profile contain only FORM / ATELIER; community character artwork is excluded. For current use, read [the invitation guide](/docs/product/INVITATION-ALPHA.md).

# CORE-018 · Integrated local Windows release

## Outcome

Deliver one locally installable Windows x64 Alpha containing the CORE-017 whale room, FORM and ATELIER roots, the shared personal runtime and existing goal / tool capabilities. Full-interface natural-language authoring remains deferred.

## Work order and boundaries

1. **Delivery:** versioned release metadata, current usage / artwork notices, deterministic file inventory, fail-before-write installation validation and a Windows built-in PowerShell path so a clean Windows machine does not need PowerShell 7 merely to install or configure its key.
2. **Integration:** exercise the copied Node, Python, Vue and bundler from the actual release. Verify local state and a real CSV task survive disposal / reopening, and all three UI sources build against those runtimes.
3. **Desktop:** launch the installed copy with a fresh explicit home and offline mode. Check the existing native boundary / recovery smoke and observe the three layouts and character interaction where desktop automation is available.
4. **Closeout:** full product regressions, artifact hashes, a current handoff and a truthful report identifying any remaining external validation.

## Inputs / outputs / authority

- Existing installed dependencies are reused; no network installation, model requests, credentials or additional agents are needed.
- The original donor is read-only. Historical reports and real user stores / request ledgers are not edited. Tests use new roots under `.test-data` and their own processes.
- Releases carry an explicit `local-preview` classification. Community whale art is retained for the authorized local prototype, with provenance and notice; this is not approval to publicly redistribute it.
- Installer verifies manifest structure, relative paths, file length / SHA-256 and reparse boundaries before creating a new destination. Existing releases and user data are preserved.
- Windows credentials continue using current-user DPAPI; the compatibility check uses a synthetic disposable value, never the user's key.

## Acceptance evidence

- Product Python / Node suites and new release / installer tests pass; original failures, if any, are retained.
- The release inventory contains only shipped code, pinned runtimes, notices and guides, with no user stores, keys or raw reports.
- Installation into a fresh path with spaces / Unicode succeeds and rejects tampering before creating a destination.
- A copied-runtime integration probe performs real local tool work and reopens its own stored state; interface bundles build using bundled dependencies.
- Native smoke records actual results from the copied Electron and a new offline home. Cross-machine, genuine sleep / wake and OS notification delivery are separate checks and are not inferred from unit tests.

Status and results are recorded in `reports/core-018/`; self-verification is not an independent accepted review.
