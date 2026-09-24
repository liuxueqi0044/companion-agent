/** Owns code packages and an atomic activation pointer. Never owns personal/task state. */
import fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID,randomBytes} from 'node:crypto'
import {stageSource,sealCandidate,readRevision} from '../../../../tests/spikes/personal-space/core/store.mjs'
import {HOST_API_VERSION} from '../../../../tests/spikes/personal-space/core/package.mjs'
import {validateSpaceDecision,buildCanvas} from './package.mjs'

const fail=code=>Object.assign(new Error(code),{code})
const id=v=>typeof v==='string'&&/^[0-9a-f-]{36}$/.test(v)
const sameKeys=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===keys.sort().join('|')
const errors=new Set(['provider_aborted','provider_timeout','provider_failed','provider_invalid_output','provider_response_too_large',
 'provider_busy','request_in_progress','credential_rejected','provider_insufficient_balance','provider_rate_limited','provider_http_error',
 'ledger_locked','ledger_invalid','ledger_write_failed','space_empty_html','space_html_format','space_external_resource','space_js_syntax',
 'invalid_file_set','file_too_large','source_too_large','embedded_closing_tag','invalid_source_type','invalid_unicode_scalar'])

export async function createSpaceService({root,provider,isRuntimeBusy=()=>false,now=()=>Date.now()}={}){
  if(!path.isAbsolute(root))throw fail('space_configuration_required')
  await fs.mkdir(root,{recursive:true})
  // Reuse the package store's segment-by-segment checks for every package read/write.
  // Check the state root too, including ancestor junctions, before opening the activation pointer.
  for(let p=path.resolve(root);;p=path.dirname(p)){
    const stat=await fs.lstat(p),real=await fs.realpath(p)
    if(stat.isSymbolicLink()||path.normalize(real).toLowerCase()!==path.normalize(p).toLowerCase())throw fail('reparse_point')
    if(path.dirname(p)===p)break
  }
  const stateFile=path.join(root,'state.json')
  let state={format:'personal-canvas/1',version:0,active:null,history:[],candidates:[],job:null}
  try{
    if((await fs.lstat(stateFile)).isSymbolicLink())throw fail('reparse_point')
    state=JSON.parse(await fs.readFile(stateFile,'utf8'))
  }catch(e){if(e.code!=='ENOENT')throw fail('space_state_invalid')}
  if(!sameKeys(state,['format','version','active','history','candidates','job'])||state.format!=='personal-canvas/1'
    ||!Number.isSafeInteger(state.version)||state.version<0||state.active!==null&&!id(state.active)
    ||!Array.isArray(state.history)||state.history.length>30||state.history.some(v=>v!==null&&!id(v))
    ||!Array.isArray(state.candidates)||state.candidates.length>100
    ||state.candidates.some(v=>!sameKeys(v,['id','summary','createdAt','basedOn'])||!id(v.id)||typeof v.summary!=='string'
      ||v.summary.length>300||typeof v.createdAt!=='string'||v.basedOn!==null&&!id(v.basedOn))
    ||new Set(state.candidates.map(v=>v.id)).size!==state.candidates.length
    ||[state.active,...state.history].some(v=>v!==null&&!state.candidates.some(c=>c.id===v))
    ||state.job!==null&&(!sameKeys(state.job,['id','status','error','candidateId'])||!id(state.job.id)
      ||!['generating','validating','ready','failed','cancelled','interrupted'].includes(state.job.status)
      ||state.job.error!==null&&typeof state.job.error!=='string'||state.job.candidateId!==null&&!id(state.job.candidateId)))throw fail('space_state_invalid')
  let busy=false,closed=false,controller=null,flight=Promise.resolve(),stateError=null
  const listeners=new Set(),mounts=new Map()
  const notify=()=>{for(const fn of listeners)try{fn()}catch{}}
  async function persist(next){
    const value={...next,version:state.version+1},temp=path.join(root,'state-'+randomUUID()+'.tmp')
    // Never follow a substituted activation file. Fixed, random siblings, exclusive creation.
    try{if((await fs.lstat(stateFile)).isSymbolicLink())throw fail('reparse_point')}catch(e){if(e.code!=='ENOENT')throw e}
    const h=await fs.open(temp,'wx',0o600)
    try{await h.writeFile(JSON.stringify(value,null,2)+'\n');await h.sync()}finally{await h.close()}
    await fs.rename(temp,stateFile);state=value;notify()
  }
  if(['generating','validating'].includes(state.job?.status))await persist({...state,job:{...state.job,status:'interrupted',error:'space_generation_interrupted'}})
  const snapshot=()=>({version:state.version,active:state.active,historyDepth:state.history.length,
    candidates:structuredClone(state.candidates),job:structuredClone(state.job),busy,configured:!!provider?.generate,error:stateError})
  const checkVersion=v=>{if(v!==state.version)throw fail('revision_conflict')}
  function enter(){if(closed)throw fail('closing');if(busy||isRuntimeBusy())throw fail('runner_busy');busy=true;notify()}
  const leave=()=>{busy=false;notify()}
  const lookup=revision=>{const c=state.candidates.find(c=>c.id===revision);if(!c)throw fail('space_revision_missing');return c}
  async function execute(job,prompt,base){
    try{
      const current=base?await readRevision(root,base):null
      if(controller.signal.aborted)throw fail('provider_aborted')
      const output=await provider.generate({request:prompt,current_files:current?.files??null},{signal:controller.signal})
      if(controller.signal.aborted)throw fail('provider_aborted')
      await persist({...state,job:{...job,status:'validating'}})
      const value=validateSpaceDecision(output),revision=randomUUID()
      await stageSource(root,{package_id:'personal-home',revision_id:revision,base_revision:base,
        host_api_version:HOST_API_VERSION,source_type:'model_candidate',requested_scopes:[],changes:value.files})
      await sealCandidate(root,revision)
      if(controller.signal.aborted)throw fail('provider_aborted')
      const candidate={id:revision,summary:value.summary,createdAt:new Date(now()).toISOString(),basedOn:base}
      await persist({...state,candidates:[...state.candidates,candidate],job:{...job,status:'ready',candidateId:revision}})
      if(controller.signal.aborted)throw fail('provider_aborted')
    }catch(error){
      const cancelled=controller.signal.aborted,code=cancelled?'provider_aborted':errors.has(error.code)?error.code:'space_save_failed'
      try{await persist({...state,job:{...job,status:cancelled?'cancelled':'failed',error:code}})}catch{stateError='space_state_write_failed';notify()}
    }finally{controller=null;leave()}
  }
  return {
    snapshot,subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn)},
    async generate({prompt,expectedVersion,baseRevision=null}){
      if(!provider?.generate)throw fail('model_not_configured')
      if(typeof prompt!=='string'||!prompt.trim()||prompt.length>6000)throw fail('invalid_request')
      checkVersion(expectedVersion);if(baseRevision!==null)lookup(baseRevision)
      if(state.candidates.length>=100)throw fail('space_archive_full')
      enter();controller=new AbortController()
      const job={id:randomUUID(),status:'generating',error:null,candidateId:null}
      try{await persist({...state,job})}catch(e){controller=null;leave();throw e}
      flight=execute(job,prompt.trim(),baseRevision)
      return {ok:true,jobId:job.id}
    },
    cancel({jobId}){if(!controller||state.job?.id!==jobId)return {ok:false,error:'stale_view'};controller.abort();return {ok:true}},
    async preview({revision}){
      lookup(revision)
      const {files,artifact_hash}=await readRevision(root,revision)
      const mountId=randomBytes(16).toString('hex'),urlToken=randomBytes(24).toString('hex')
      const built=buildCanvas(files,mountId)
      for(const [k,v] of mounts)if(v.expires<now())mounts.delete(k)
      if(mounts.size>=30)mounts.delete(mounts.keys().next().value)
      mounts.set(urlToken,{mountId,revision,artifact_hash,...built,expires:now()+15*60*1000,ready:false})
      return {ok:true,mount:{id:mountId,revision,url:'/space-frame/'+urlToken,artifactHash:artifact_hash}}
    },
    document(urlToken){const v=mounts.get(urlToken);return v&&v.expires>=now()?{html:v.html,csp:v.csp}:null},
    ready({mountId,revision}){
      const v=[...mounts.values()].find(v=>v.mountId===mountId&&v.revision===revision&&v.expires>=now())
      if(!v)return {ok:false,error:'space_preview_expired'}
      v.ready=true;return {ok:true}
    },
    async activate({mountId,revision,expectedVersion}){
      checkVersion(expectedVersion);lookup(revision);enter()
      try{
        const v=[...mounts.values()].find(v=>v.mountId===mountId&&v.revision===revision&&v.ready&&v.expires>=now())
        if(!v)throw fail('space_preview_required')
        const current=await readRevision(root,revision)
        if(current.artifact_hash!==v.artifact_hash)throw fail('space_revision_changed')
        if(state.active===revision)return {ok:true}
        await persist({...state,active:revision,history:[...state.history,state.active].slice(-30)})
        return {ok:true}
      }finally{leave()}
    },
    async rollback({expectedVersion,original=false}){
      if(typeof original!=='boolean')throw fail('invalid_request')
      checkVersion(expectedVersion);enter()
      try{
        if(original){if(state.active!==null)await persist({...state,active:null,history:[...state.history,state.active].slice(-30)});return {ok:true}}
        if(!state.history.length)throw fail('space_no_previous')
        const revision=state.history.at(-1)
        if(revision!==null)await readRevision(root,revision)
        await persist({...state,active:revision,history:state.history.slice(0,-1)})
        return {ok:true}
      }finally{leave()}
    },
    async source({revision}){lookup(revision);const p=await readRevision(root,revision);return {ok:true,files:p.files,manifest:p.manifest}},
    async close(){closed=true;controller?.abort();await flight;listeners.clear();mounts.clear()},
    whenIdle:()=>flight,
  }
}

/** A damaged customization store must not take down conversations or personal memory. */
export function unavailableSpaceService(){
  const denied=()=>({ok:false,error:'space_state_invalid'})
  return {snapshot:()=>({version:0,active:null,historyDepth:0,candidates:[],job:null,busy:false,configured:false,error:'space_state_invalid'}),
    subscribe:()=>()=>{},generate:denied,cancel:denied,preview:denied,ready:denied,activate:denied,rollback:denied,source:denied,
    document:()=>null,close:async()=>{},whenIdle:async()=>{}}
}
