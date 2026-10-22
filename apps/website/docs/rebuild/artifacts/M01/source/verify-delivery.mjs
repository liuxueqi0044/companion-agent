import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(await fs.readFile(path.join(root,'boards/export-manifest.json'),'utf8'));
const checks=[];
for(const b of manifest.boards){
 const meta=await sharp(path.join(root,b.output)).metadata();
 if(meta.width!==b.width||meta.height!==b.height)throw Error('Wrong board dimensions: '+b.output);
 checks.push({file:b.output,width:meta.width,height:meta.height});
}
for(const file of ['copy.en.json','layout.desktop.json','layout.mobile.json','asset-plan.json'])JSON.parse(await fs.readFile(path.join(root,'spec',file),'utf8'));
const missing=[];
async function checkMarkdown(dir){
 for(const item of await fs.readdir(dir,{withFileTypes:true})){
  if(item.isDirectory()){
   if(!['node_modules','.hyperframes'].includes(item.name))await checkMarkdown(path.join(dir,item.name));
  }else if(item.name.endsWith('.md')){
   const file=path.join(dir,item.name);const body=await fs.readFile(file,'utf8');
   for(const match of body.matchAll(/\]\(([^)]+)\)/g)){
    const target=match[1].split('#')[0];
    if(!target||/^[a-z]+:/i.test(target))continue;
    try{await fs.access(path.resolve(dir,target));}catch{missing.push({file:path.relative(root,file),target});}
   }
  }
 }
}
await checkMarkdown(root);
if(missing.length)throw Error(JSON.stringify(missing));
const record={date:'2026-09-29',boards:checks,specJsonFiles:4,brokenMarkdownLinks:0,scope:'File/metadata validation only; visual and motion evidence recorded separately'};
await fs.writeFile(path.join(root,'proof','delivery-files.json'),JSON.stringify(record,null,2));
console.log(JSON.stringify(record,null,2));
