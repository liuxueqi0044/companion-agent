import sharp from 'sharp';
import {readFile,writeFile,stat,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=process.cwd(), source=path.join(root,'source-art/rebuild/community'), out=path.join(root,'public/rebuild/community');
await mkdir(out,{recursive:true});
const manifest=[];
async function record(id,file,sourceFile,kind='generated'){
 const p=path.join(out,file), m=await sharp(p).metadata(), data=await readFile(p);
 manifest.push({id,src:`/rebuild/community/${file}`,source:sourceFile,width:m.width,height:m.height,bytes:(await stat(p)).size,alpha:m.hasAlpha,sha256:createHash('sha256').update(data).digest('hex'),provenance:{kind,tool:'OpenAI built-in image_gen',date:'2026-09-29'},version:'m03-production-v1'});
}
for(const id of ['travel','companion','writer']){
 const src=path.join(source,`${id}-master.png`);
 await sharp(src).resize(1200,800,{fit:'cover',position:'centre'}).webp({quality:91,effort:6}).toFile(path.join(out,`${id}.webp`));
 await record(`community-${id}`,`${id}.webp`,`source-art/rebuild/community/${id}-master.png`);
}
await sharp(path.join(source,'set-clean-master.png')).webp({quality:91,effort:6}).toFile(path.join(out,'set-clean.webp'));
await record('community-set','set-clean.webp','source-art/rebuild/community/set-clean-master.png');
await sharp(path.join(source,'ribbon-master.png')).resize({width:1600}).webp({quality:91,alphaQuality:100,effort:6}).toFile(path.join(out,'ribbon.webp'));
await record('community-ribbon','ribbon.webp','source-art/rebuild/community/ribbon-master.png');
// Sprite extraction only: preserve imagegen-created alpha and edge colors unchanged.
const sheet=path.join(source,'people-clean-master.png');
const cuts=[[0,0,445,724],[443,0,374,724],[810,0,516,724],[1326,0,391,724],[1716,0,456,724]];
for(let i=0;i<cuts.length;i++){
 const [left,top,width,height]=cuts[i];
 await sharp(sheet).extract({left,top,width,height}).resize({height:620}).webp({quality:94,alphaQuality:100,effort:6}).toFile(path.join(out,`person-${i+1}.webp`));
 await record(`community-person-${i+1}`,`person-${i+1}.webp`,'source-art/rebuild/community/people-clean-master.png');
}
// Existing concept artwork appears only as tiny distant scenery (never invented authors).
const atlasRows={companions:[0,418,836,1254],creative:[0,394,778,1254],workspaces:[0,406,827,1254],possibilities:[0,418,836,1254]};
let tile=0;
for(const [name,ys]of Object.entries(atlasRows)){
 for(let i=0;i<5;i++){
  const row=Math.floor(i/2), file=`distant-${++tile}.webp`;
  await sharp(path.join(root,`public/art/${name}.webp`)).extract({left:i%2*627,top:ys[row],width:627,height:ys[row+1]-ys[row]}).resize(240,160,{fit:'cover'}).webp({quality:82}).toFile(path.join(out,file));
  await record(`community-distant-${tile}`,file,`source-art/${name}.png`,'existing-generated-concept');
 }
}
await writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({assets:manifest.length,bytes:manifest.reduce((a,x)=>a+x.bytes,0),works:manifest.slice(0,3)},null,2));
