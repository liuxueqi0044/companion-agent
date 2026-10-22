import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'docs/rebuild/artifacts/M04');
const manifest = JSON.parse(await fs.readFile(path.join(root,'public/rebuild/gallery/manifest.json'),'utf8'));
const evidence = { generatedAt:new Date().toISOString(), assets:[], legacyAtlases:[], motion:null, browser:'Root integration CUA verification is recorded separately. This script does not claim browser validation.' };
const contact = [];
for(const [i,asset] of manifest.assets.entries()){
 const file = path.join(root,asset.masterPath), b = await fs.readFile(file), m = await sharp(b).metadata();
 if(m.width!==1800 || m.height!==1200)throw Error(`Wrong master dimensions ${asset.id}`);
 const variants=[];
 for(const v of asset.variants){const f=path.join(root,'public',v.src),bin=await fs.readFile(f),size=await sharp(bin).metadata();if(size.width!==v.width||size.height!==v.height||bin.length!==v.bytes)throw Error(`Bad variant ${v.src}`);variants.push({...v,sha256:crypto.createHash('sha256').update(bin).digest('hex')});}
 evidence.assets.push({id:asset.id,width:m.width,height:m.height,variants,sha256:crypto.createHash('sha256').update(b).digest('hex')});
 contact.push({input:await sharp(b).resize(450,300).png().toBuffer(),left:(i%4)*450,top:Math.floor(i/4)*300});
}
for(const name of ['companions','creative','workspaces','possibilities']){const m=await sharp(path.join(root,'public/art',`${name}.webp`)).metadata();evidence.legacyAtlases.push({name,width:m.width,height:m.height});}
await sharp({create:{width:1800,height:600,channels:3,background:'#ece8dd'}}).composite(contact).jpeg({quality:90}).toFile(path.join(out,'near-assets-contact-sheet.jpg'));
await fs.writeFile(path.join(out,'asset-verification.json'),JSON.stringify(evidence,null,2));
console.log(`Verified ${evidence.assets.length} independent masters and ${evidence.assets.length*2} WebP variants.`);
