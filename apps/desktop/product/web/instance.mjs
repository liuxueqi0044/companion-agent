import fs from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {acquireProcessLock,processAlive,recoverLegacyLock} from '../process-lock.mjs'

/** Explicit recovery archives a dead owner; startup never replaces a live process. */
export function acquireInstance(file,{recoverDead=false}={}){
  if(!path.isAbsolute(file))throw Error('absolute_instance_path_required')
  fs.mkdirSync(path.dirname(file),{recursive:true})
  const record=JSON.stringify({pid:process.pid,owner:randomUUID()})
  const release=acquireProcessLock(file+'.guard.sqlite','personal_space_already_started_or_needs_recovery')
  let temp
  try{
    recoverLegacyLock(file+'.startup-lock',{recoverDead,code:'personal_space_already_started_or_needs_recovery'})
    if(recoverDead&&fs.existsSync(file)){
      let old;try{old=JSON.parse(fs.readFileSync(file,'utf8'))}catch{throw Error('instance_state_invalid')}
      if(!Number.isSafeInteger(old.pid)||old.pid<1)throw Error('instance_state_invalid')
      if(!processAlive(old.pid))fs.renameSync(file,file+'.interrupted-'+randomUUID()+'.json')
    }
    // Publish a complete record without replacing a concurrently created legacy owner.
    temp=file+'.'+randomUUID()+'.tmp'
    const fd=fs.openSync(temp,'wx',0o600)
    try{fs.writeFileSync(fd,record);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
    try{fs.linkSync(temp,file)}catch(e){if(e.code==='EEXIST')throw Error('personal_space_already_started_or_needs_recovery');throw e}
  }catch(e){release();throw e}
  finally{try{if(temp&&fs.existsSync(temp))fs.unlinkSync(temp)}catch(e){release();throw e}}
  let released=false
  return ()=>{
    if(released)return;released=true
    try{if(fs.readFileSync(file,'utf8')===record)fs.unlinkSync(file)}catch{/* Never remove another owner's file. */}
    finally{release()}
  }
}
