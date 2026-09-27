# Current product commands

Run from the repository root with Node 24.21.x and Python 3.13.x. Install the pinned
JavaScript dependencies using `npm ci`; create `.venv` and install the project's
Python development dependencies. Do not run test commands against a user data root.

| Command | What is checked |
| --- | --- |
| `npm run build` | Real replaceable product interfaces → `dist/product/*.bundle.json` |
| `npm run typecheck` | Public SDK contract, positive/negative consumer examples, strict JS checking of lock/context/runtime-resolution modules |
| `npm run check` | All product/native/UI/tool JavaScript syntax, Python syntax, current schema, above type checks and product build |
| `npm test` | All current Python product tests then all Node product tests, serially |
| `npm run test:node -- tests/product/core020/locks.test.mjs` | Selected Node regression |
| `npm run test:python` | Python product regression |

`build:legacy`, `typecheck:legacy` and `test:legacy` retain the early skeleton commands.
The whole older JavaScript implementation is **not** strictly typed yet. Building it
and passing runtime tests do not constitute static type coverage of every function.

Dependencies resolve from this checkout (or a packaged `runtime.json`). Developers
reusing an existing toolchain can explicitly set these **absolute paths**:

- `PERSONAL_AI_PYTHON`: Python executable with project dependencies.
- `PERSONAL_AI_VUE`: Vue runtime ES module.
- `PERSONAL_AI_BUNDLER`: pinned Rolldown `dist/index.mjs`.
- `PERSONAL_AI_TYPESCRIPT`: TypeScript `lib/typescript.js`.
- `PERSONAL_AI_NODE_TYPES`: `@types/node` directory.

No command guesses that a neighboring directory called `companion-agent` exists.
Windows release builders can use `PERSONAL_AI_RUNTIME_ROOT` to explicitly select a
provisioned pinned runtime/dependency tree; the default is this repository. Release
packaging still requires its pinned Node/Python/Electron distributions and is separate
from building frontend bundles. These fixes have not rebuilt or published an installer.

## Crash recovery boundary

New locks are persistent `.guard.sqlite` sidecars held by an OS transaction. Do not
delete these sidecars while any product process runs. The OS releases ownership on
process death; restart archives a dead instance record and marks uncertain reserved
requests failed without replaying HTTP. Same-account requests remain serial.

Known-dead **legacy** startup locks with a valid PID can be archived automatically.
An empty or malformed old `.startup-lock` / `.lock`, or corrupted instance record,
cannot prove that its old owner is dead. Such files remain intact and block startup
or journal changes. Stop all old product processes, back up the state directory, then
have the specific legacy files inspected and moved aside; do not delete the request
ledger or database. This patch does not operate on real user data automatically.

## Context and memory

The transport limits the complete serialized request to 96 KiB, including JSON
escaping. Current input, permissions, policy and tool receipts are preserved; optional
memory/history entries are packed with explicit omission counts. No stored messages
are deleted. An oversized mandatory payload still returns `provider_input_too_large`
before reserving a request; it is not silently rewritten.

Memory retrieval scans all allowed, non-deleted records using normalized words/CJK
bigrams. Relevant entries lead, followed by durable preferences and recent facts.
Explicit preferences have stable age ordering when otherwise tied. Output is bounded
to 96 candidates and 20 KiB; this is offline lexical retrieval, not semantic recall,
automatic contradiction resolution, or a guarantee that every preference fits at once.
