/** Trusted catalogue facade. Generated interfaces cannot install or grant tools. */
import path from 'node:path'
import {importCapability,capError,plain} from './importer.mjs'
import {createMcpAdapter} from './mcp.mjs'

const exact=(v,keys)=>plain(v)&&Object.keys(v).sort().join('|')===[...keys].sort().join('|')
export function createCapabilityService({host,root,python,adapter=createMcpAdapter({root:path.join(root,'processes'),python})}={}){
  const flights=new Set(),controllers=new Map();let closed=false,busy=false
  async function call(action,args={}){
    const reply=await host.request('capability.'+action,args)
    if(!reply.ok)throw capError(reply.error?.code??'capability_store_unavailable')
    return reply.result
  }
  function tracked(fn){const flight=Promise.resolve().then(fn).finally(()=>flights.delete(flight));flights.add(flight);return flight}
  async function command(name,args={}){
    if(closed)throw capError('disposed')
    if(busy)throw capError('management_busy')
    busy=true
    try{
      if(name==='import')return await call('import',{definition:importCapability(args)})
      if(['list','read','grant','sets','save-set','apply-set'].includes(name))return await call(name,args)
      if(name==='manage'){
        const result=await call(name,args)
        if(args.operation!=='enable')for(const entry of controllers.values())if(entry.packageId===args.id)entry.controller.abort()
        return result
      }
      if(name==='connect'){
        if(!exact(args,['id','version','component','expected_revision','trustSource'])||args.trustSource!==true)throw capError('capability_trust_required')
        const def=await call('definition',{id:args.id,version:args.version})
        const current=await call('read',{id:args.id})
        if(current.version!==args.version||current.revision!==args.expected_revision)throw capError('revision_conflict')
        const part=def.components.find(v=>v.id===args.component)
        if(!part||part.kind!=='mcp'||part.issues.length||def.issues.length)throw capError('capability_unavailable')
        const controller=new AbortController(),key=Symbol();controllers.set(key,{controller,packageId:args.id})
        try{
          const {tools}=await tracked(()=>adapter.list(part.connection,{signal:controller.signal}))
          const {trustSource,...payload}=args
          return await call('connected',{...payload,tools})
        }finally{controllers.delete(key)}
      }
      if(name==='export-set'){
        if(!exact(args,['id']))throw capError('invalid_request')
        const set=(await call('sets')).find(v=>v.id===args.id)
        if(!set)throw capError('capability_not_found')
        const items=[]
        for(const item of set.items){const def=await call('definition',item);items.push({id:item.id,version:item.version,name:def.name,format:def.format})}
        // References only: no URLs, instructions, server arguments, headers or user data.
        return {format:'morrow-capability-set/1',name:set.name,items}
      }
      if(name==='inspect-set'){
        if(!exact(args,['recipe']))throw capError('invalid_request')
        const r=args.recipe
        if(!exact(r,['format','name','items'])||r.format!=='morrow-capability-set/1'||typeof r.name!=='string'||!r.name||r.name.length>80||!Array.isArray(r.items)||r.items.length<1||r.items.length>32)throw capError('capability_recipe_invalid')
        const installed=await call('list'),seen=new Set()
        const items=r.items.map(item=>{
          if(!exact(item,['id','version','name','format'])||!/^[a-f0-9]{32}$/.test(item.id)||!/^[a-f0-9]{64}$/.test(item.version)||typeof item.name!=='string'||item.name.length>160||!['codex','claude','agent-plugins','agent-skills','mcp'].includes(item.format)||seen.has(item.id))throw capError('capability_recipe_invalid')
          seen.add(item.id);const own=installed.find(v=>v.id===item.id)
          return {...item,status:own?.versions.includes(item.version)?'available':'missing',active:own?.version===item.version&&own.enabled}
        })
        return {name:r.name,items}
      }
      throw capError('unsupported_action')
    }finally{busy=false}
  }
  function execute({turnId,actionId,signal}){
    if(closed)return Promise.resolve({ok:false,error:'disposed'})
    return tracked(async()=>{
      let claim
      try{claim=await call('claim',{turn_id:turnId,action_id:actionId})}catch(error){
        if(['capability_changed','capability_unavailable','capability_not_found','permission_denied','capability_version_not_found'].includes(error.code)){
          try{await call('reject',{turn_id:turnId,action_id:actionId,error:error.code});return {ok:true,result:{status:'failed'}}}catch{}
        }
        return {ok:false,error:error.code??'capability_store_unavailable'}
      }
      const controller=new AbortController(),abort=()=>controller.abort()
      signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort()
      controllers.set(actionId,{controller,packageId:claim.payload.package_id})
      let receipt
      try{receipt=await adapter.call(claim.component.connection,{signal:controller.signal,tool:claim.tool,arguments:claim.payload.arguments})}
      catch(error){receipt={status:error.outcome??'unknown',result:null,error:/^capability_[a-z_]{1,50}$/.test(error.code??'')?error.code:'capability_call_failed'}}
      finally{controllers.delete(actionId);signal?.removeEventListener('abort',abort)}
      try{
        await call('finish',{turn_id:turnId,action_id:actionId,token:claim.token,...receipt})
        return {ok:true,result:{status:receipt.status}}
      }catch{return {ok:false,error:'capability_receipt_unknown'}}
    })
  }
  return {command,execute,get busy(){return busy},async close(){closed=true;for(const entry of controllers.values())entry.controller.abort();await Promise.allSettled([...flights])}}
}
