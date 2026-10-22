import sharp from 'sharp';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Source PNGs travel with the project. Never read a user's imagegen cache or
// overwrite the originals; this script only performs delivery compression.
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const artRoot = resolve(projectRoot, 'public/art');
const ids = ['companions', 'creative', 'workspaces', 'possibilities', 'portraits'];
const checkOnly = process.argv.includes('--check');
const manifest = [];

await Promise.all(ids.map((id) => stat(resolve(projectRoot, 'source-art', `${id}.png`))));
if (!checkOnly) await mkdir(artRoot, { recursive: true });

for (const id of ids) {
  const source = resolve(projectRoot, 'source-art', `${id}.png`);
  const metadata = await sharp(source).metadata();
  if (!metadata.width || !metadata.height) throw new Error(`Cannot read dimensions: ${source}`);
  if (checkOnly) {
    console.log(`${id}: ${metadata.width} × ${metadata.height}; source available`);
    continue;
  }
  const output = await sharp(source).webp({ quality: 91, effort: 6 }).toFile(resolve(artRoot, `${id}.webp`));
  manifest.push({
    id,
    src: `/art/${id}.webp`,
    source: `source-art/${id}.png`,
    kind: 'AI-generated concept artwork',
    width: metadata.width,
    height: metadata.height,
    bytes: output.size,
  });
  console.log(`${id}: ${metadata.width} × ${metadata.height}; ${output.size} bytes`);
}

if (!checkOnly) await writeFile(resolve(artRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
