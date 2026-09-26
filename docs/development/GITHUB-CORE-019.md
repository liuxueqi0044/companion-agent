# CORE-019 source publication verification

Date: 2026-09-27. Repository: `liuxueqi0044/companion-agent`, branch `main`.
Base: `915e99a`. This publication carries current source through CORE-019,
including CORE-016–018 updates; it is not a binary release or independent acceptance.

## Rechecked development evidence

All 69 CORE-019 manifest entries match their recorded sizes and SHA-256 values.
Manifest SHA-256: `b62600b54290b86b596ddc7c22a818f5e5018fafdbc99fb05c85621bb1f19402`.
The local invitation archive is 219,454,487 bytes, SHA-256
`cd3afc28311bedaf923af0617336ad7a411aad79028f596cf3544910a0adef4e`.
It is not uploaded in this commit. Historical source-native checks: 12 passed;
physical sleep/wake and human-visible OS notifications remain unverified.
The original format failure and later explicit DeepSeek resume are retained in
the development evidence and described in the sanitized batch report.

## Tests run on this publication checkout

| Check | Result |
| --- | --- |
| Full product Python suite | 222 passed |
| Full product Node suite, serial | 305 passed; 0 failed/cancelled/skipped |
| Product Schema and source check | PASS; original 142 files unchanged |
| Editable source exports | FORM, ATELIER and collection; 3 valid packages without character payloads |
| Additional model requests / credential reads | 0 / none |

Commands used the existing pinned Python environment and Node 24 installation
in the sibling development dependency directory; no dependencies were installed.
Raw logs stay local. Their hashes are recorded under `publication` in
`reports/core-019/report.json`. The higher counts than the original batch include
the final packaging test and three publication-profile regressions; do not sum
overlapping suites from historical reports.

```powershell
& '..\companion-agent\.venv\Scripts\python.exe' -I -B tools/run_product_tests.py
$cases = @(rg --files tests/product | Where-Object { $_ -like '*.test.mjs' })
& '..\companion-agent\.local-tools\node-v24.21.0-win-x64\node.exe' --test --test-concurrency=1 @cases
& '..\companion-agent\.venv\Scripts\python.exe' -I -B tools/check_product_workspace.py
& '..\companion-agent\.local-tools\node-v24.21.0-win-x64\node.exe' tools/export_starter_interfaces.mjs
```

These are development-machine commands, not an assertion that a new checkout
has bundled runtimes. The package builder also requires its pinned, separately
provisioned Electron distribution. This commit does not claim a clean-room build.

## Publication profile and provenance

- The default starter and available interface list match the verified invitation
  package: FORM / ATELIER. The character shim exposes no assets. `characters/`
  and `whale-room.mjs` are absent. The original motion helper and its tests remain
  as reusable source; no character imagery is encoded in them.
- Windows build defaults to invitation. Requesting the old art-bearing preview
  fails before creating an output. The export tool uses the available interface
  list. Tests exercise this actual profile and reject unavailable whale exports.
- README, current handoff, sanitized report and publication guidance describe
  the current source snapshot. Older architecture documents are historical.
  Existing LF files retain LF to avoid newline-only diffs; the configuration
  PowerShell script retains its UTF-8 BOM for Windows PowerShell 5.
- Credentials, private databases/memories, runtime roots, raw live evidence,
  model candidates, dependency binaries, ZIPs and community artwork are excluded.
  No existing remote history is rewritten. No model sessions are created to
  verify this source upload.

`reports/core-019/artifacts.json` hashes the published changes. `SOURCE-SNAPSHOT.json`
records the current snapshot hashes and source/profile differences. Private local
evidence manifests remain unchanged; their hashes are provenance, not promises
that omitted evidence can be replayed from this repository.

## Remaining release checks

Another Windows PC with protection enabled, physical sleep/wake, actual toast
visibility/click, interactive real-key entry and diagnostic save, and signing.
Full UI natural-language authoring, cloud, TTS, community and general computer use
remain deferred. The source tests above do not turn submitted into accepted.
