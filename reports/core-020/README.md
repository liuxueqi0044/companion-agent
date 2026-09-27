# CORE-020 reliability fixes — source publication

Status: submitted, not independently accepted. Fixes process-death lock ownership,
accumulated conversation request overflow, recency-only memory and stale product
build/test entry points. The source profile remains FORM / ATELIER; community
character assets, credentials, private data, raw evidence and binaries are excluded.

Development validation: Python 224 passed, final Node 314 passed; schema, actual
product builds, scoped strict types and relocated-source/real-host checks passed.
An initial 313-pass/1-failure Node run exposed unnecessary context fields on the
narrow author interface; this was corrected without weakening the test. Original
failure evidence stays in the local development workspace. All 74 source/evidence
manifest entries were verified before publication preparation.

This checkout is revalidated separately. See report.json and
[publication checks](../../docs/development/GITHUB-CORE-020.md) for its results;
its source hashes are recorded in artifacts.json and SOURCE-SNAPSHOT.json.

Remaining boundaries: unidentified legacy empty locks require ownership checks
before moving aside; mandatory input exceeding the request bound is rejected before
reservation; memory is bounded lexical retrieval without semantic embeddings or
conflict resolution; older JavaScript is not entirely strictly typed. The old
CORE-019 installer has not been rebuilt. Cross-machine installation and native
visual/live-model checks were not repeated for this source upload.
