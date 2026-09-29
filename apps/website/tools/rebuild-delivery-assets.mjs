import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const project=process.cwd();
const out=path.join(project,'public/rebuild/fallback');await fs.mkdir(out,{recursive:true});
const manifest=[];
for(const scene of ['hero','gallery','community']){
 const input=path.join(project,`docs/rebuild/artifacts/M01/assets/${scene}-art-v1.png`);
 const file=path.join(out,`${scene}.webp`);await sharp(input).webp({quality:88}).toFile(file);
 const meta=await sharp(file).metadata();manifest.push({scene,src:`/rebuild/fallback/${scene}.webp`,width:meta.width,height:meta.height,bytes:(await fs.stat(file)).size,source:path.relative(project,input)});
}
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify(manifest,null,2));
