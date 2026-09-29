import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const names = ['hero-art-v1.png', 'gallery-art-v1.png', 'community-art-v1.png', 'material-study-v1.png', 'hero-cleanplate-study-v1.png', 'tags-study-v1.png', 'people-study-v1.png'];
const assets = [];
for (const name of names) {
  const file = path.join(root, 'assets', name);
  const bytes = await fs.readFile(file);
  const meta = await sharp(bytes).metadata();
  assets.push({file:`assets/${name}`,width:meta.width,height:meta.height,bytes:bytes.length,alpha:meta.hasAlpha,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),source:'Built-in image_gen, constrained by user-supplied design reference',stage:name.includes('study')?'M01 feasibility/material study':'M01 art-direction master plate',productionReady:false});
}
await fs.writeFile(path.join(root,'proof','asset-audit.json'), JSON.stringify({date:'2026-09-29',scope:'M01 actual asset metadata; no production readiness or device performance implied',assets},null,2));
console.log(JSON.stringify(assets.map(({file,width,height,alpha})=>({file,width,height,alpha})),null,2));
