/** OS-owned SQLite transaction locks. Sidecar files persist; their existence is not a lock. */
import fs from 'node:fs'
import path from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {randomUUID} from 'node:crypto'

/** @param {string} code */
const fail=code=>Object.assign(Error(code),{code})
/** @param {unknown} error */
const errorCode=error=>error instanceof Error&&'code' in error?error.code:null
// Callers may intentionally keep an instance lock until process exit. GC is not release.
const heldDatabases=new Set()
/** @param {string} file */
export function acquireProcessLock(file,code='process_locked'){
  if(!path.isAbsolute(file))throw fail('absolute_lock_path_required')
  // A junction/symlink must not redirect even a lock's journal into another root.
  const chain=[]
  for(let p=file;;p=path.dirname(p)){chain.unshift(p);if(path.dirname(p)===p)break}
  for(const p of chain){
    try{if(fs.lstatSync(p).isSymbolicLink())throw fail('lock_path_invalid')}
    catch(e){if(errorCode(e)!=='ENOENT')throw e}
  }
  fs.mkdirSync(path.dirname(file),{recursive:true})
  let db
  try{db=new DatabaseSync(file,{timeout:0});db.exec('BEGIN IMMEDIATE')}
  catch(e){db?.close();if(e instanceof Error&&'errcode' in e&&(e.errcode===5||e.errcode===6))throw fail(code);throw fail('lock_state_invalid')}
  heldDatabases.add(db)
  let released=false
  return ()=>{if(released)return;released=true;try{db.exec('ROLLBACK')}finally{db.close();heldDatabases.delete(db)}}
}

/** @param {number} pid */
export function processAlive(pid){
  if(!Number.isSafeInteger(pid)||pid<1)throw fail('instance_state_invalid')
  try{process.kill(pid,0);return true}catch(e){if(errorCode(e)==='ESRCH')return false;throw fail('instance_owner_unknown')}
}

// The new OS lock serializes migration. Never guess that an unowned legacy file is stale.
/** @param {string} file */
export function recoverLegacyLock(file,{recoverDead=false,code='process_locked'}={}){
  if(!fs.existsSync(file))return
  let record
  try{record=JSON.parse(fs.readFileSync(file,'utf8'))}catch{throw fail(code)}
  if(!recoverDead||!Number.isSafeInteger(record?.pid)||record.pid<1||processAlive(record.pid))throw fail(code)
  fs.renameSync(file,file+'.interrupted-'+randomUUID()+'.json')
}
