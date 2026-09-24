import fs from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'

/** Explicit recovery archives a dead owner; startup never replaces a live process. */
export function acquireInstance(file,{recoverDead=false}={}){
  if(!path.isAbsolute(file))throw Error('absolute_instance_path_required')
  fs.mkdirSync(path.dirname(file),{recursive:true})
  const record=JSON.stringify({pid:process.pid,owner:randomUUID()})
  let gate
  try{gate=fs.openSync(file+'.startup-lock','wx',0o600)}catch{throw Error('personal_space_already_started_or_needs_recovery')}
  try{
    fs.writeFileSync(gate,record)
    if(recoverDead&&fs.existsSync(file)){
      let old;try{old=JSON.parse(fs.readFileSync(file,'utf8'))}catch{throw Error('instance_state_invalid')}
      if(!Number.isSafeInteger(old.pid)||old.pid<1)throw Error('instance_state_invalid')
      let alive=true
      try{process.kill(old.pid,0)}catch(e){if(e.code==='ESRCH')alive=false;else throw Error('instance_owner_unknown')}
      if(!alive)fs.renameSync(file,file+'.interrupted-'+randomUUID()+'.json')
    }
    let fd
    try{fd=fs.openSync(file,'wx',0o600)}catch{throw Error('personal_space_already_started_or_needs_recovery')}
    try{fs.writeFileSync(fd,record)}finally{fs.closeSync(fd)}
  }finally{fs.closeSync(gate);fs.unlinkSync(file+'.startup-lock')}
  let released=false
  return ()=>{
    if(released)return;released=true
    try{if(fs.readFileSync(file,'utf8')===record)fs.unlinkSync(file)}catch{/* Never remove another owner's file. */}
  }
}
