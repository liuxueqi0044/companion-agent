/**
 * Writes the exact export manifest for the M01 boards.
 * Browser rendering/capture is intentionally performed through the approved
 * CUA surface; this script does not launch or automate a browser.
 * Usage: node source/render-boards.mjs [FULL_URL_TO_M01_INDEX]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { modes, scenes } from './board-layouts.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv[2] || 'http://127.0.0.1:4340/docs/rebuild/artifacts/M01/index.html';
const manifest = {
  capture: 'Set browser viewport to width × height, wait for fonts and images, capture the viewport through CUA.',
  readyAttribute: 'html[data-boards-ready="true"]',
  sourceArtworkSize: [1774, 887],
  boards: Object.entries(scenes).flatMap(([scene]) => Object.entries(modes).map(([mode, size]) => ({
    scene, mode, width: size.width, height: size.height,
    url: new URL(`?scene=${scene}&mode=${mode}`, base).href,
    output: `boards/${scene}-${mode}.png`,
    status: mode === 'mobile' ? 'Mobile layout sketch; layered production artwork pending.' : 'M01 visual review, not a functional product screen.',
  }))),
};
await mkdir(resolve(root, 'boards'), { recursive: true });
await writeFile(resolve(root, 'boards/export-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${manifest.boards.length} board capture entries to boards/export-manifest.json`);
