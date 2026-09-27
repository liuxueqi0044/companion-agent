# CORE-020 source publication

Repository: liuxueqi0044/companion-agent, branch main. Base: cf4dbfd.
This is a source update, not a rebuilt installer or independent acceptance.

## Verification on the publication checkout

- Python product suite: **226 passed**.
- Node product suite: **315 passed**, no failures, cancellations or skips.
- Product schema, JavaScript/Python syntax, scoped strict type checks: PASS.
- Actual FORM / ATELIER interface bundles: built successfully.
- Relocated checkout build/type checks and real Node/Python/SQLite host regression: PASS.
- Model requests, credential reads, new AI sessions and dependency installation: zero.

Commands: `node tools/product.mjs test` and `node tools/product.mjs check`.
Used Node 24.21.0 and the existing pinned dependency installation through explicit
PERSONAL_AI_PYTHON / VUE / BUNDLER / TYPESCRIPT / NODE_TYPES absolute-path overrides.
The extra two Python tests and one Node test versus the development report verify
the publication profile. Raw logs remain local; their hashes are in report.json.
This is not a fresh `npm ci` or cross-machine installation claim.

## Source and exclusions

All 74 original CORE-020 manifest entries were verified before copying source.
The source manifest hash is recorded in reports/core-020/report.json. Runtime,
provider, memory, tests and engineering commands were copied with LF line endings.
The Windows builder and support tests received only their dependency-resolution
changes; their invitation-only profile and artwork exclusion were preserved.
README, handoff and report are adapted for this Git publication mirror.

No raw evidence, machine baselines, private memories/databases, credentials,
generated live candidates, dependency binaries, release archives or community
character assets are included. The CORE-019 installer remains unchanged.
Old batch/review reports retain their historical status and hashes.

Unknown legacy empty locks still need ownership verification before moving aside.
Memory is bounded lexical retrieval, not semantic recall or conflict resolution.
Strict types cover the SDK and new reliability modules, not all older JavaScript.
Current development commands and recovery boundaries are documented in
[PRODUCT-COMMANDS.md](PRODUCT-COMMANDS.md).
