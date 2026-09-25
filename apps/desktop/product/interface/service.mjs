/** Full UI package lifecycle; personal data and execution ownership stay outside it. */
import fs from 'node:fs/promises'
import path from 'node:path'
import {randomBytes} from 'node:crypto'
import {buildInterface,defaultSource,verifyArtifact,frameDocument} from './builder.mjs'
import {createInterfaceSession} from './session.mjs'
import {validId} from '../application/state.mjs'
const fail=code=>Object.assign(Error(code),{code})
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
const clone=structuredClone
// Same ancestor/reparse-point rule as the existing immutable package store.
async function checked(file,{create=false}={}){
  const absolute=path.resolve(file),parts=[]
  for(let p=absolute;;p=path.dirname(p)){parts.unshift(p);if(path.dirname(p)===p)break}
  for(const p of parts){
    try{const stat=await fs.lstat(p),real=await fs.realpath(p)
      if(stat.isSymbolicLink()||path.normalize(real).toLowerCase()!==p.toLowerCase())throw fail('reparse_point')
    }catch(e){if(e.code!=='ENOENT')throw e;if(create)await fs.mkdir(p);else if(p!==absolute)throw e}
  }
  return absolute
}
async function read(file,fallback){
  await checked(file)
  try{return JSON.parse(await fs.readFile(file,'utf8'))}catch(e){if(e.code==='ENOENT')return fallback;throw fail('interface_state_invalid')}
}
async function atomic(file,value){
  await checked(file)
  const tmp=file+'.'+randomBytes(8).toString('hex')+'.tmp',h=await fs.open(tmp,'wx',0o600)
  try{await h.writeFile(JSON.stringify(value));await h.sync()}finally{await h.close()}
  await fs.rename(tmp,file)
}
export async function createInterfaceService({root,runtime,vueFile,bundlerFile,connection=()=>({configured:false}),progress,onChange=()=>{},background}={}){
  await checked(root,{create:true})
  const archive=path.join(root,'revisions');await checked(archive,{create:true})
  const stateFile=path.join(root,'state.json'),dataFile=path.join(root,'ui-state.json')
  let state,error=null,dataError=null
  const initial={version:0,active:null,history:[],candidates:[]}
  try{
  state=await read(stateFile,initial)
  if(!state||Object.keys(state).sort().join('|')!=='active|candidates|history|version'||!Number.isSafeInteger(state.version)||state.version<0
    ||state.active!==null&&!hash(state.active)||!Array.isArray(state.history)||state.history.some(v=>v!==null&&!hash(v))
    ||!Array.isArray(state.candidates)||state.candidates.length>100||state.candidates.some(v=>!hash(v.hash)||typeof v.name!=='string'))throw fail('interface_state_invalid')
  }catch(e){if(e.code==='reparse_point')throw e;state=clone(initial);error='interface_state_invalid'}
  let data
  try{data=await read(dataFile,{draft:{revision:0,value:{}},packages:{}})
    if(!data||!Number.isSafeInteger(data.draft?.revision)||data.draft.revision<0||!data.draft.value||!validDraft(data.draft.value)
      ||!data.packages||typeof data.packages!=='object'||Array.isArray(data.packages)
      ||Object.values(data.packages).some(v=>!v||!Number.isSafeInteger(v.revision)||v.revision<0||!v.value||typeof v.value!=='object'||Array.isArray(v.value)))throw fail('interface_state_invalid')
  }catch(e){if(e.code==='reparse_point')throw e;data={draft:{revision:0,value:{}},packages:{}};dataError='interface_draft_unavailable'}
  const defaultBundle=await buildInterface(await defaultSource(),{vueFile,bundlerFile})
  frameDocument(defaultBundle,'check')
  const mounts=new Map(),listeners=new Set(),mountIntents=new Map()
  let closed=false,editing=false,dataFlight=Promise.resolve(),revision=0
  const epoch=randomBytes(12).toString('hex')
  const changed=()=>{revision++;onChange();for(const fn of listeners){try{fn()}catch{}}}
  const offRuntime=runtime.subscribe(changed),offProgress=progress?.subscribe(changed)
  function summary(){return clone({...state,defaultHash:defaultBundle.hash,sdk:'morrow.ui/1',error,dataError})}
  const guardVersion=v=>{if(v!==state.version)throw fail('revision_conflict')}
  async function edit(fn){
    if(closed)throw fail('disposed');if(error)throw fail(error);if(editing)throw fail('management_busy');editing=true
    try{return await fn()}finally{editing=false}
  }
  async function persist(next){await atomic(stateFile,next);state=next;changed()}
  async function bundleFor(id){
    if(id===null||id===defaultBundle.hash)return defaultBundle
    if(!hash(id)||!state.candidates.some(c=>c.hash===id))throw fail('interface_revision_missing')
    const value=verifyArtifact(await read(path.join(archive,id+'.json'),null))
    if(value.hash!==id)throw fail('interface_integrity_error')
    return value
  }
  async function revoke(record){if(record.revoked)return;record.revoked=true;record.session?.dispose();changed()}
  function transition(next){
    // Drain already accepted draft/state writes before replacing their readers.
    // Later writes from the old mount remain queued behind this revocation barrier.
    const flight=dataFlight.then(async()=>{
      await persist(next)
      for(const record of mounts.values())if(!record.preview){record.revoked=true;record.session?.dispose()}
      changed()
    })
    dataFlight=flight.catch(()=>{})
    return flight
  }
  function recordFor(id){const record=mounts.get(id);if(!record||record.revoked)throw fail('interface_revoked');return record}
  async function mount({revision:target=state.active,preview=false,clientId=null}={}){
    if(closed)throw fail('disposed')
    if(typeof preview!=='boolean'||clientId!==null&&(typeof clientId!=='string'||!/^[-a-f0-9]{36}$/.test(clientId)))throw fail('interface_invalid_mount')
    const version=state.version,intent=Symbol('mount'),key=clientId?`${clientId}:${preview}`:null
    if(key)mountIntents.set(key,intent)
    const bundle=await bundleFor(target)
    if(!preview&&target!==state.active&&!(state.active===null&&target===defaultBundle.hash))throw fail('scope_denied')
    for(const [id,m] of mounts)if(m.revoked||m.expires<Date.now()){await revoke(m);mounts.delete(id)}
    if(clientId)for(const [id,m] of mounts)if(m.clientId===clientId&&m.preview===preview){await revoke(m);mounts.delete(id)}
    if(mounts.size>=12)throw fail('interface_mount_limit')
    const id=randomBytes(24).toString('hex'),record={id,clientId,bundle,preview,ready:false,revoked:false,expires:Date.now()+3600000,session:null}
    record.document=frameDocument(bundle,id)
    if(!preview)record.session=await createInterfaceSession({runtime,scopes:bundle.source.scopes,onChange:changed})
    if(closed||version!==state.version||key&&mountIntents.get(key)!==intent){record.session?.dispose();throw fail('interface_mount_superseded')}
    mounts.set(id,record)
    return {ok:true,mount:{id,revision:bundle.hash,url:'/interface-frame/'+id,preview,name:bundle.source.name,scopes:bundle.source.scopes}}
  }
  function snapshotFor(record){
    record.expires=Date.now()+3600000
    const view=record.preview?previewSnapshot():record.session.snapshot()
    return {epoch,revision,view,connection:record.preview?{configured:false,provider:'preview'}:connection(),
      progress:record.preview?null:progress?.snapshot()??null,
      interface:{revision:record.bundle.hash,preview:record.preview,sdk:'morrow.ui/1'},
      capabilities:{nativeIsolation:false,backgroundContact:!!background,generatedInterfaces:true,generatedScope:'whole_interface_granted_sdk'}}
  }
  const readData=(record,key)=>clone(key==='draft'?data.draft:
    Object.hasOwn(data.packages,record.bundle.source.id)?data.packages[record.bundle.source.id]:{revision:0,value:{}})
  function writeData(record,key,args){
    let captured;try{captured=clone(args)}catch{return Promise.resolve({ok:false,error:'invalid_request'})}
    const write=dataFlight.then(async()=>{
      if(record.revoked||closed)return {ok:false,error:'interface_revoked'}
      if(!captured||Object.keys(captured).sort().join('|')!=='expectedRevision|value'||!captured.value||typeof captured.value!=='object'||Array.isArray(captured.value)
        ||Buffer.byteLength(JSON.stringify(captured.value))>384*1024)return {ok:false,error:'invalid_request'}
      if(key==='draft'&&!validDraft(captured.value))return {ok:false,error:'invalid_request'}
      const old=readData(record,key)
      if(captured.expectedRevision!==old.revision)return {ok:false,error:'revision_conflict'}
      const next={revision:old.revision+1,value:captured.value},all=clone(data)
      if(key==='draft')all.draft=next;else all.packages[record.bundle.source.id]=next
      if(Buffer.byteLength(JSON.stringify(all))>4*1024*1024)return {ok:false,error:'interface_state_full'}
      await atomic(dataFile,all);data=all;return {ok:true,result:clone(next)}
    }).catch(()=>({ok:false,error:'interface_state_write_failed'}))
    dataFlight=write.then(()=>{});return write
  }
  return {summary,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},
    async importSource({source,expectedVersion}){return edit(async()=>{
      guardVersion(expectedVersion)
      if(source?.id==='morrow.default')throw fail('interface_reserved_id')
      if(state.candidates.length>=100)throw fail('interface_archive_full')
      const bundle=await buildInterface(source,{vueFile,bundlerFile});frameDocument(bundle,'check')
      const file=path.join(archive,bundle.hash+'.json');await checked(file)
      try{await fs.writeFile(file,JSON.stringify(bundle),{flag:'wx',mode:0o600})}catch(e){if(e.code!=='EEXIST')throw e;verifyArtifact(await read(file,null))}
      if(!state.candidates.some(c=>c.hash===bundle.hash))await persist({...state,version:state.version+1,candidates:[...state.candidates,{hash:bundle.hash,name:source.name,scopes:source.scopes}]})
      return {ok:true,result:{revision:bundle.hash}}
    })},
    async source({revision:target=state.active}={}){return {ok:true,result:(await bundleFor(target)).source}},
    mount,
    document(id){const m=recordFor(id);return m.document},
    async ready({mountId}){recordFor(mountId).ready=true;return {ok:true}},
    snapshot({mountId}){return {ok:true,result:snapshotFor(recordFor(mountId))}},
    async call({mountId,action,args={}}){
      const record=recordFor(mountId);record.expires=Date.now()+3600000
      if(typeof action!=='string')return {ok:false,error:'invalid_request'}
      if(record.preview)return {ok:false,error:'preview_read_only'}
      if(action==='host.window')return record.bundle.source.scopes.includes('window')?{ok:true}:{ok:false,error:'scope_denied'}
      if(action.startsWith('draft.')&&!record.bundle.source.scopes.includes('conversation'))return {ok:false,error:'scope_denied'}
      if(['draft.read','draft.write','ui.state.read','ui.state.write'].includes(action)&&dataError)return {ok:false,error:dataError}
      if(action==='draft.read'||action==='ui.state.read')return {ok:true,result:readData(record,action==='draft.read'?'draft':'package')}
      if(action==='draft.write'||action==='ui.state.write')return writeData(record,action==='draft.write'?'draft':'package',args)
      return record.session.call(action,args)
    },
    async unmount({mountId}){const record=mounts.get(mountId);if(record)await revoke(record);return {ok:true}},
    async activate({mountId,expectedVersion,trustSource=false}){return edit(async()=>{
      guardVersion(expectedVersion);const m=recordFor(mountId)
      if(!m.preview||!m.ready)throw fail('interface_preview_required')
      if(trustSource!==true)throw fail('interface_source_trust_required')
      const bundle=await bundleFor(m.bundle.hash)
      if(bundle.hash!==m.bundle.hash)throw fail('interface_integrity_error')
      const next=bundle.hash===defaultBundle.hash?null:bundle.hash
      await transition({...state,version:state.version+1,active:next,history:[...state.history,state.active].slice(-30)})
      return {ok:true}
    })},
    async restore({expectedVersion,previous=false}){return edit(async()=>{
      guardVersion(expectedVersion)
      const next=previous?(state.history.at(-1)??null):null
      if(next)await bundleFor(next)
      await transition({...state,version:state.version+1,active:next,history:previous?state.history.slice(0,-1):[...state.history,state.active].slice(-30)})
      return {ok:true}
    })},
    async close(){closed=true;offRuntime();offProgress?.();for(const m of mounts.values())await revoke(m);await dataFlight;listeners.clear()},
  }
}

function previewSnapshot(){return {panel:'home',initialized:true,home:{profile:{preferences:{ai_name:'我的 AI'}},unreadCount:0},
  conversation:null,activity:null,work:{available:false,selected:false},result:{rows:[],issues:[],metadata:{}},
  policy:{policy:{revision:1,memory_enabled:true,proactive_enabled:false}},memory:{items:[]},inbox:{items:[]},reminders:{items:[]},
  runtime:{initialized:true,executionBusy:false,pendingOperations:0,send:null}}}

function validDraft(v){return Object.keys(v).every(k=>['text','attachment','temporary','conversationId','selectedTurn'].includes(k))
  &&(v.text===undefined||typeof v.text==='string'&&v.text.length<=32000)
  &&(v.temporary===undefined||typeof v.temporary==='boolean')
  &&(v.conversationId===undefined||validId(v.conversationId))
  &&(v.selectedTurn===undefined||v.selectedTurn===null||validId(v.selectedTurn))
  &&(v.attachment===undefined||v.attachment===null||typeof v.attachment==='object'&&Object.keys(v.attachment).sort().join('|')==='name|text'
    &&typeof v.attachment.name==='string'&&v.attachment.name.length<=256&&typeof v.attachment.text==='string'&&Buffer.byteLength(v.attachment.text)<=256*1024)}
