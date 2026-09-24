/** Browser-independent, single-flight scheduling. Python owns eligibility and delivery. */
import path from 'node:path'
import {guardPath,readJSON,writeJSON} from './storage.mjs'
const code=e=>/^[a-z][a-z0-9_]{0,63}$/.test(e)?e:'background_failed'
export async function createBackgroundService({runtime,host,root,notify=async()=>{},intervalMs=30000,timers=globalThis,isBusy=()=>false}){
  if(!runtime?.pulseContact||!host?.request||!Number.isSafeInteger(intervalMs)||intervalMs<100)throw Error('background_configuration_required')
  await guardPath(root,{create:true})
  const file=path.join(root,'background.json')
  let state=await readJSON(file,null),flight=null,timer=null,closed=false,contactOwned=false,lastError=null,lastTick=null
  if(state===null){
    const latest=await host.request('inbox.latest',{})
    if(!latest.ok||!Number.isSafeInteger(latest.result?.cursor))throw Error('background_initialize_failed')
    state={version:1,cursor:latest.result.cursor,sequence:0,paused:false,notifications:true}
    await writeJSON(file,state)
  }
  if(state.version!==1||!Number.isSafeInteger(state.cursor)||state.cursor<0||!Number.isSafeInteger(state.sequence)||state.sequence<0||typeof state.paused!=='boolean'||typeof state.notifications!=='boolean')throw Error('background_state_invalid')
  const snapshot=()=>({available:true,running:timer!==null&&!closed,paused:state.paused,notifications:state.notifications,busy:!!flight,lastTick,lastError,sequence:state.sequence})
  async function cycle(){
    if(closed||state.paused||isBusy()||runtime.snapshot().runtime.executionBusy)return {ok:true,skipped:true}
    contactOwned=true
    let reply
    try{reply=await runtime.pulseContact()}finally{contactOwned=false}
    if(closed)return {ok:false,error:'closed'}
    if(!reply.ok){lastError=code(reply.error);return reply}
    const inbox=await host.request('inbox.list',{after:state.cursor,limit:100})
    if(!inbox.ok){lastError=code(inbox.error?.code);return {ok:false,error:lastError}}
    const rows=inbox.result
    if(!Array.isArray(rows)||rows.some((r,i)=>!Number.isSafeInteger(r.cursor)||r.cursor<=(i?rows[i-1].cursor:state.cursor)))throw Error('background_protocol_error')
    if(rows.length){
      const next={...state,cursor:rows.at(-1).cursor,sequence:state.sequence+1}
      await writeJSON(file,next);state=next
      // Advance durably before OS notification: at most once, inbox remains authoritative.
      if(state.notifications&&!closed)await notify({sequence:state.sequence,count:rows.filter(r=>!r.read).length,at:new Date().toISOString()})
    }
    lastTick=new Date().toISOString();lastError=null
    return {ok:true,delivered:rows.length}
  }
  function tick(){
    if(closed)return Promise.resolve({ok:false,error:'closed'})
    if(flight)return flight
    flight=Promise.resolve().then(cycle).catch(e=>{lastError=code(e.message);return {ok:false,error:lastError}}).finally(()=>{flight=null})
    return flight
  }
  async function configure(patch){
    if(closed)return {ok:false,error:'closed'}
    if(!patch||Object.keys(patch).some(k=>!['paused','notifications'].includes(k)||typeof patch[k]!=='boolean'))return {ok:false,error:'invalid_request'}
    if(flight)return {ok:false,error:'background_busy'}
    flight=Promise.resolve().then(async()=>{const next={...state,...patch};await writeJSON(file,next);state=next;return {ok:true,result:snapshot()}}).finally(()=>{flight=null})
    return flight
  }
  return {tick,snapshot,configure,start(){if(!closed&&timer===null){timer=timers.setInterval(()=>void tick(),intervalMs);timer.unref?.();void tick()}},
    async close(){if(closed)return;closed=true;if(timer!==null)timers.clearInterval(timer);timer=null;if(contactOwned)await runtime.stopContact();await flight}}
}
