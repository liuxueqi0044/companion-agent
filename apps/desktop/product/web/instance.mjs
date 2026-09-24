import fs from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'

/** A crashed owner is not silently replaced; startup must not duplicate live work. */
export function acquireInstance(file){
  if(!path.isAbsolute(file))throw Error('absolute_instance_path_required')
  fs.mkdirSync(path.dirname(file),{recursive:true})
  const record=JSON.stringify({pid:process.pid,owner:randomUUID()})
  let fd
  try{fd=fs.openSync(file,'wx',0o600)}catch{throw Error('personal_space_already_started_or_needs_recovery')}
  try{fs.writeFileSync(fd,record)}finally{fs.closeSync(fd)}
  let released=false
  return ()=>{
    if(released)return;released=true
    try{if(fs.readFileSync(file,'utf8')===record)fs.unlinkSync(file)}catch{/* Never remove another owner's file. */}
  }
}
