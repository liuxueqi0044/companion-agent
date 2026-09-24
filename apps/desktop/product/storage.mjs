/** Atomic local records, under an application-owned root. */
import fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
export async function guardPath(file,{create=false}={}){
  if(!path.isAbsolute(file))throw Error('absolute_path_required')
  const chain=[];for(let p=path.normalize(file);;p=path.dirname(p)){chain.unshift(p);if(path.dirname(p)===p)break}
  for(const p of chain){
    try{const stat=await fs.lstat(p),real=await fs.realpath(p);if(stat.isSymbolicLink()||path.normalize(real).toLowerCase()!==p.toLowerCase())throw Error('reparse_point')}
    catch(e){if(e.code!=='ENOENT')throw e;if(create)await fs.mkdir(p);else if(p!==file)throw e}
  }
  return file
}
export async function readJSON(file,fallback){
  await guardPath(file)
  try{return JSON.parse(await fs.readFile(file,'utf8'))}catch(e){if(e.code==='ENOENT')return structuredClone(fallback);throw Error('state_invalid')}
}
export async function writeJSON(file,value){
  await guardPath(file)
  const temp=file+'.'+randomUUID()+'.tmp',handle=await fs.open(temp,'wx',0o600)
  try{await handle.writeFile(JSON.stringify(value));await handle.sync()}finally{await handle.close()}
  await fs.rename(temp,file)
}
