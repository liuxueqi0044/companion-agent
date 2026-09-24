/** Quota-free transport journal. Owns serialization, not product pricing. */
import fs from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'

const fail=code=>Object.assign(new Error(code),{code})
export function createRequestLedger({file}){
  if(!path.isAbsolute(file))throw fail('invalid_ledger_configuration')
  fs.mkdirSync(path.dirname(file),{recursive:true})
  function read(){
    if(!fs.existsSync(file))return {version:2,limit:null,attempts:[]}
    let value
    try{value=JSON.parse(fs.readFileSync(file,'utf8'))}catch{throw fail('ledger_invalid')}
    const legacy=value?.version===1&&Number.isSafeInteger(value.limit)&&value.limit>0
    if(!(legacy||value?.version===2&&value.limit===null)||!Array.isArray(value.attempts)||
      legacy&&value.attempts.length>value.limit)throw fail('ledger_invalid')
    const seen=new Set()
    for(const row of value.attempts){
      if(!row||typeof row.id!=='string'||seen.has(row.id)||!['turn','contact'].includes(row.kind)||
        !['reserved','received','failed'].includes(row.state)||typeof row.at!=='string')throw fail('ledger_invalid')
      seen.add(row.id)
    }
    return value
  }
  function change(update){
    let lock,temp
    try{lock=fs.openSync(file+'.lock','wx',0o600)}catch{throw fail('ledger_locked')}
    try{
      const value=read()
      const result=update(value)
      if(value.version===1){
        // Preserve the exact historical bytes before the first successful migration.
        const backup=file+'.v1-backup.json'
        if(fs.existsSync(backup)){
          if(!fs.readFileSync(backup).equals(fs.readFileSync(file)))throw fail('ledger_invalid')
        }else fs.copyFileSync(file,backup,fs.constants.COPYFILE_EXCL)
        value.version=2;value.limit=null
      }
      temp=file+'.'+randomUUID()+'.tmp'
      fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600})
      fs.renameSync(temp,file);temp=null
      return result
    }finally{
      if(temp&&fs.existsSync(temp))fs.unlinkSync(temp)
      fs.closeSync(lock);fs.unlinkSync(file+'.lock')
    }
  }
  return {
    snapshot(){const v=read();return {used:v.attempts.length,inFlight:v.attempts.some(r=>r.state==='reserved')}},
    reserve(kind){
      if(!['turn','contact'].includes(kind))throw fail('ledger_invalid')
      return change(value=>{
        if(value.attempts.some(item=>item.state==='reserved'))throw fail('request_in_progress')
        const id=randomUUID();value.attempts.push({id,kind,state:'reserved',at:new Date().toISOString()});return id
      })
    },
    finish(id,details){change(value=>{
      const row=value.attempts.find(item=>item.id===id)
      if(!row||row.state!=='reserved'||!['received','failed'].includes(details.state))throw fail('ledger_invalid')
      Object.assign(row,details,{finished_at:new Date().toISOString()})
    })},
  }
}
