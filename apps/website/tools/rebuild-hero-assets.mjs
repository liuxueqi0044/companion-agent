import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const project = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const source = path.join(project, 'source-art/rebuild/hero');
const output = path.join(project, 'public/rebuild/hero');
const evidence = path.join(project, 'docs/rebuild/artifacts/M02');
await fs.mkdir(output, {recursive:true});
await fs.mkdir(evidence, {recursive:true});
const approved = path.join(source, 'hero-approved-source.png');
const cleanplate = path.join(source, 'hero-cleanplate-source.png');
const records = [];
async function exportAsset(id, input, name, crop, quality=93) {
  let pipeline = sharp(input);
  if (crop) pipeline = pipeline.extract(crop);
  await pipeline.webp({quality, effort:6, smartSubsample:true}).toFile(path.join(output,name));
  const buffer = await fs.readFile(path.join(output,name));
  const metadata = await sharp(buffer).metadata();
  records.push({id, scene:'hero', src:`/rebuild/hero/${name}`, sourcePath:path.relative(project,input).replaceAll('\\','/'), crop:crop || null,
    width:metadata.width,height:metadata.height,bytes:buffer.length,sha256:crypto.createHash('sha256').update(buffer).digest('hex'),
    alpha:false, decorative:true, approvedVersion:'m02-hero-1', provenance:{kind:'generated',source:'M01 built-in imagegen approved visual; only crop/compression derivatives in this pipeline'},
    displayMask:crop ? 'Runtime rounded silhouette or tether clip path; exact same element cloned for handoff.' : null});
}
await exportAsset('hero-master',approved,'hero-master.webp',null,93);
await exportAsset('hero-cleanplate',cleanplate,'hero-cleanplate.webp',null,93);
await exportAsset('hero-tag-video',approved,'tag-video.webp',{left:174,top:150,width:174,height:236},96);
await exportAsset('hero-tag-research',approved,'tag-research.webp',{left:496,top:591,width:162,height:214},96);
await exportAsset('hero-tether-video',approved,'tether-video.webp',{left:241,top:73,width:52,height:112},96);
await exportAsset('hero-tether-research',approved,'tether-research.webp',{left:551,top:533,width:43,height:86},96);
await fs.writeFile(path.join(evidence,'assets.json'),JSON.stringify({version:'m02-hero-1',sourceDimensions:{width:1774,height:887},
  notes:['The approved master is retained as the static/failure image.','Cleanplate is drawn only inside feathered masks behind the two moving tags; no whole-frame background registration assumption.','The tag-extraction-v2 imagegen attempt remains source-only: residual fringe caused rejection.','No source art was upscaled; source dimensions remain explicit.'],assets:records,totalPublishedBytes:records.reduce((n,r)=>n+r.bytes,0)},null,2)+'\n');
console.log(JSON.stringify({assetCount:records.length,totalPublishedBytes:records.reduce((n,r)=>n+r.bytes,0),assets:records.map(({id,width,height,bytes})=>({id,width,height,bytes}))},null,2));
