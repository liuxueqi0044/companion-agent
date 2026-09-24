# CORE-002-R1 checkpoint

## A · superseded turn barrier

- Fresh-root regression first reproduced CR2-F03 (three targeted failures). `begin` now rejects any turn with a later same-conversation input as `superseded_turn` before writing a ticket or event; `accept` discards a result that became superseded while generating.
- The former history test now uses the latest turn to prove filtering before the 12-item limit and separately asserts that beginning an older turn is rejected. Temporary later input also supersedes.
- Targeted run: 4 passed. Interim full Python product run: 86 passed. Continue with B.

## B · read and stop ordering

- Reproduced F01 with three failing Node cases. The session now tracks a read generation separately from selection, invalidates pre-stop reads at stop start, blocks refresh during stop, and lets only the latest repeated stop publish/read back.
- The selected turn, error, refreshing and stopping flags now follow the owning request. Targeted old/new Node session suite: 7 passed. Continue with C.

## C · owned submit retry

- Reproduced F02 and invalid receipt/transport cases before repair. Each pending submit now owns a deep-copied payload and a single in-flight replay; only its matching turn/conversation receipt can clear it. Uncertain transport outcomes retain the original command/material/grant, while deterministic validation errors clear only that record.
- Four focused Node cases and an actual Node→Python→SQLite lost-receipt wrapper pass. The latter proves one stored turn, original CSV/grant, and a completed local CSV result of 6. Continue with D.

## D · complete v1 schema preflight

- The frozen v1 DDL now has a strict table/index/trigger/view comparison before ALTER or UPDATE. F04 trigger and view probes failed before repair and pass after it, with the memory count, version and quiescent file hash unchanged.
- Separate fresh fixtures cover missing table, extra column/index, wrong identity, unknown version and corruption. A controlled interruption after several ALTER/CREATE steps rolls back every new column/table and preserves rows/references, then the standard migration and replay pass. Targeted suite: 9 passed. Continue with E.

## E · combined regression and handoff

- Updated frontend and contract guidance and added the R1 technical handoff. Actual final test commands completed: Python 95 passed, Node 19 passed, schema PASS, existing offline Node→Python→SQLite→CSV demo completed with total 6 and stable reopened identity/turn/task.
- Manifest recalculation passed for 13 delivered source/test/documentation files (`e1748010adc042180535b34cc522ae1fb84aa396c59f9452445e40f609758ed4`). `report.json`, `summary.md`, and the command ledger are written. The authoritative final R1 scope result is recorded at `evidence/scope-final.json`; submission awaits independent review. No original workspace integration has been performed.
