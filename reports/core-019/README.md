# CORE-019 invitation Alpha — source publication

Status: **submitted**, not independently accepted. Includes changes since CORE-015, with FORM and ATELIER and the Windows invitation delivery lifecycle. The development-only whale artwork is excluded. Full interface source replacement remains available.

Development evidence: 219 Python tests passed; a later packaging subset passed 10 tests (overlapping, including one newly added test). Final Node suite passed 304 tests. Native Electron checks passed 12 checks. The final invitation ZIP has 1,763 inventoried files / 1,764 ZIP entries; installation into a fresh path containing spaces and Chinese characters, full candidate uninstall, packaged offline Check, and reminder pause/deduplication checks passed on the development PC.

Actual DeepSeek trial: four serial requests in total. The initial run failed on the final model response format after a successful real query. An explicit single-request resume succeeded using the existing query receipt; no automatic retries or repeated query. The failed record was retained. No OpenAI/Codex/Claude calls in this batch. This is not evidence that model output errors are eliminated.

The archive hash in report.json identifies the verified local invitation ZIP; that ZIP, raw logs, live candidates and private data are **not uploaded**. This source publication uses the same FORM/ATELIER configuration but is a separate payload, with publication tests and documentation. Its verification is recorded in [GITHUB-CORE-019.md](../../docs/development/GITHUB-CORE-019.md); its source hashes are in artifacts.json and SOURCE-SNAPSHOT.json.

Pending: another Windows computer with protection enabled; real physical sleep/wake; human-observed OS toast/click; interactive real-key entry and diagnostic-save dialog; signing. The notification `show` event and simulated resume are not substitutes for these checks.

Deferred: full-interface natural-language authoring, cloud, TTS, community and general computer use. Read [the invitation guide](../../docs/product/INVITATION-ALPHA.md) and [trial checklist](../../docs/product/TRIAL-CHECKLIST.md).
