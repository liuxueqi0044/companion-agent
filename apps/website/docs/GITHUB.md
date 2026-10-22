# Morrow website v2 — source publication

2026-09-29. The repository owner accepted the local frontend and requested its source be committed to GitHub. This directory is a standalone Astro marketing website. It does not replace `apps/desktop`, change product data or connect to live model providers.

## Run from a fresh checkout

```sh
cd apps/website
npm ci
npm run check
npm test
npm run verify:assets
npm run build
npm run preview
```

Node.js 22.12 or newer is required by this package. The repository's Node 24 development environment is also suitable. The website has an independent lockfile and is intentionally outside the existing desktop npm workspace list. Preview binds to `127.0.0.1:4332`; `dist/` is the deployable static output and must be served over HTTP, not opened as a `file://` document.

## Included

- All website source, production images, bundled fonts, dependency notices and exact dependency lock.
- Original artwork and editable gallery masters needed to regenerate production assets.
- Architecture and transition specifications, deterministic regression checks, asset manifests, and selected browser screenshots.
- `/`, `/rebuild/`, `/privacy/`, and the preserved earlier implementation at `/legacy/`.
- `SOURCE-SNAPSHOT.json` records copied-file hashes before publication-specific documentation and npm script additions. The repository root's historical snapshot is unchanged.

## Local-only material

Development caches, dependency binaries, builds, ZIPs, logs, old motion-study projects, raw screenshot sequences and MP4 review recordings remain in the original local delivery. Historical reports may reference those excluded artifacts; a reference is not evidence that the artifact is available in this checkout. The selected production screenshots and numerical reports remain included. No credentials, private agent state, runtime databases or real customer content are needed by this website.

The source import was checked with the existing pinned dependency installation, without live model calls. The build and offline test results are recorded in `PUBLICATION-CHECKS.json`. This is source publication, not a public website deployment or desktop installer release.

## Frontend boundary

The site explains configurable assistants through concept artwork. Account signup, cloud publication, purchases and actual installer downloads are not connected. The frontend supports concept filtering/details and local JSON downloads; it does not report successful remote transactions or invent user/sales statistics.
