# Repository guidance

This is a private source snapshot through BATCH-015. Read README.md, docs/architecture/ and docs/decisions/ first. BATCH-016 in docs/handoff/ is a plan, not a claim of completed work.

Reuse existing architecture and contracts. Historical dispatch documents and batch checkers reference local-only evidence and baselines that are deliberately absent from this checkout. Do not execute an old dispatch without a current assignment, fabricate acceptance, or replace missing evidence.

Keep credentials, databases, private memories, runtime data and holdout fixtures out of Git. Do not invoke models, accounts, networked agent trials or extra sessions solely to validate this snapshot. Initial product UI is owned by the architect; notify the user before starting visual design so they can adjust reasoning settings.
