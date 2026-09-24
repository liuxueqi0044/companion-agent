/** One explicit, trusted pulse. Product truth remains in ContactService/SQLite. */
import {randomUUID} from 'node:crypto'
import {clone,createState,fail,request,validId} from '../application/state.mjs'
import {registerExecutionOwner} from './lease.mjs'
import {UnavailableContactProvider,contactReply} from './contact-provider.mjs'

const reasons=new Set(['provider_failed','provider_timeout','provider_invalid_output','provider_aborted'])
const rejectedWrites=new Set(['invalid_request','not_found','invalid_transition',
  'invalid_followup_window','stale_generation','request_too_large','unsupported_action',
  'unsupported_version','disposed'])
const writes=new Set(['reminder.deliver-due','contact.claim','contact.complete','contact.fail-generation'])
const states=new Set(['pending','evaluating','needs_retry','sent','cancelled','expired'])
const validCode=value=>value===null || (typeof value==='string' &&
  /^[a-z][a-z0-9_]{0,63}$/.test(value))

function receipt(value,id) {
  if(!value || typeof value!=='object' || Array.isArray(value) ||
    Object.keys(value).sort().join(',')!=='id,message_id,reason,state' ||
    value.id!==id || !states.has(value.state) || !validCode(value.reason) ||
    (value.state==='sent' ? !validId(value.message_id) : value.message_id!==null))return null
  return {id:value.id,state:value.state,reason:value.reason,messageId:value.message_id}
}

// A completion acknowledges this decision, not an arbitrary valid plan state.
// Read-only reconciliation still accepts evaluating/needs_retry as observed facts.
function completionReceipt(value,id,decision) {
  const result=receipt(value,id)
  if(!result)return null
  const {state,reason}=result
  const matches=state==='expired' && reason==='expired' ||
    state==='pending' && (['context_changed','delivery_window'].includes(reason) ||
      decision.disposition==='defer' && reason===decision.reason) ||
    state==='cancelled' && (decision.disposition==='cancel' && reason===decision.reason ||
      decision.disposition==='defer' && reason==='reevaluation_limit') ||
    state==='sent' && decision.disposition==='send' && reason===decision.reason
  return matches ? result : null
}

export function createContactRunner({host,provider=UnavailableContactProvider,
  timeoutMs=30000,timers=globalThis}={}) {
  if(!host || typeof host.request!=='function' || !provider ||
    typeof provider.reassess!=='function' || typeof provider.configured!=='boolean' ||
    !Number.isSafeInteger(timeoutMs) || timeoutMs<1 || timeoutMs>120000 ||
    typeof timers.setTimeout!=='function' || typeof timers.clearTimeout!=='function')
    throw new TypeError('trusted_contact_runner_configuration_required')
  const owner=registerExecutionOwner(host,'contact')
  const state=createState({runId:null,planId:null,phase:'idle',error:null,
    needsReconciliation:false,disposed:false})
  let active=null,lease=null,disposed=false,reconciliation=null,lastPlanId=null,
    lastReceipt=null,observationEpoch=0,cleanupUnknown=false
  const reminderMessageIds=[],contactMessageIds=[],idleWaiters=[]
  const snapshot=()=>{const value=state.snapshot();return {...value,
    needsReconciliation:value.needsReconciliation || cleanupUnknown || owner.needsReconciliation,
    providerPending:active?.providerPending??false,
    hostPending:(active?.hostPending??0)+
      (reconciliation && reconciliation.record!==active?reconciliation.record.hostPending:0),
    reminderMessageIds:[...reminderMessageIds],contactMessageIds:[...contactMessageIds],
    receipt:lastReceipt?clone(lastReceipt):null}}
  const subscribe=listener=>{
    if(typeof listener!=='function')throw new TypeError('invalid_listener')
    return state.subscribe(()=>listener(snapshot()))
  }
  function publish(patch={}){state.publish(patch)}
  function release(){
    if(reconciliation)return
    if(active && (!active.runSettled || active.providerPending || active.hostPending ||
      active.cleanupFlight))return
    active=null
    lease?.release();lease=null
    for(const resolve of idleWaiters.splice(0))resolve({ok:true,result:{idle:true}})
  }
  const whenIdle=()=>active || reconciliation ? new Promise(resolve=>idleWaiters.push(resolve)) :
    Promise.resolve({ok:true,result:{idle:true}})
  function phase(record,value,error=null){
    if(disposed || active!==record)return
    observationEpoch++
    publish({phase:value,error})
  }
  function rejected(record,error){
    if(snapshot().needsReconciliation)return fail('outcome_unknown')
    phase(record,'failed',error)
    return fail(error)
  }
  function unknown(record,error){
    owner.markUnknown();observationEpoch++
    if(disposed){cleanupUnknown=true;return fail(error)}
    if(active===record)publish({phase:'needs_reconciliation',needsReconciliation:true,error})
    return fail(error)
  }
  const eligible=record=>!disposed && active===record && record.valid
  function setPending(record){
    if(!disposed && (active===record || reconciliation?.record===record))publish()
  }
  async function call(record,action,payload,{cleanup=false,canSend=()=>true}={}){
    if(!cleanup && !eligible(record))return fail('stale_run')
    record.hostPending++;setPending(record)
    let sent=false,blocked=false
    try{
      const reply=await request(host,action,payload,()=>{
        if((!cleanup && !eligible(record)) || !canSend())return false
        if(!cleanup && writes.has(action) && owner.needsReconciliation){blocked=true;return false}
        sent=true
        if(action==='contact.complete')record.completeSent=true
        return true
      })
      if(blocked)return unknown(record,'reconciliation_required')
      if(sent && writes.has(action) && !reply.ok && !rejectedWrites.has(reply.error))
        unknown(record,reply.error)
      return reply
    }finally{record.hostPending--;setPending(record);release()}
  }
  function failOwn(record,reason){
    if(!record.planId || !record.ticket || !reasons.has(reason))return null
    if(record.cleanupAttempted)return record.cleanupPromise
    record.cleanupAttempted=true
    const flight=call(record,'contact.fail-generation',
      {id:record.planId,ticket:record.ticket,reason},{cleanup:true}).then(reply=>{
      if(!reply.ok && reply.error!=='stale_generation')unknown(record,reply.error)
      else if(reply.ok && (reply.result?.id!==record.planId ||
        reply.result?.state!=='needs_retry' || reply.result?.reason!==reason ||
        reply.result?.message_id!==null))unknown(record,'protocol_error')
      return reply
    }).finally(()=>{if(record.cleanupFlight===flight)record.cleanupFlight=null;release()})
    record.cleanupFlight=flight;record.cleanupPromise=flight
    return flight
  }
  function abort(record,why){
    if(!record.valid)return
    record.valid=false;observationEpoch++
    if(record.timer!==null){timers.clearTimeout(record.timer);record.timer=null}
    record.abortController.abort()
    record.interrupt?.({kind:why})
  }
  async function providerStage(record,context){
    record.providerPending=true;setPending(record)
    const barrier=Symbol('reconciliation_required')
    const sent=Promise.resolve().then(()=>{
      if(!eligible(record))throw new Error('aborted_before_provider_send')
      if(owner.needsReconciliation)return barrier
      return provider.reassess(clone(context),{signal:record.abortController.signal})
    })
    const settled=sent.then(value=>value===barrier?{kind:'barrier'}:{kind:'value',value},()=>({kind:'failure'}))
      .then(value=>{record.providerPending=false;setPending(record);release();return value})
    const interrupted=new Promise(resolve=>{record.interrupt=resolve})
    const timed=new Promise(resolve=>{
      record.timer=timers.setTimeout(()=>{
        abort(record,'timeout');void failOwn(record,'provider_timeout')
        resolve({kind:'timeout'})
      },timeoutMs)
    })
    const outcome=await Promise.race([settled,interrupted,timed])
    if(record.timer!==null){timers.clearTimeout(record.timer);record.timer=null}
    record.interrupt=null
    return outcome
  }
  function remember(value,record,decision){
    const verified=completionReceipt(value,record.planId,decision)
    if(!verified)return null
    lastReceipt=verified;lastPlanId=record.planId
    if(verified.messageId && !contactMessageIds.includes(verified.messageId))
      contactMessageIds.push(verified.messageId)
    if(!disposed && active===record){observationEpoch++;publish({planId:record.planId})}
    return verified
  }
  async function chain(record){
    if(!eligible(record))return fail('provider_aborted')
    phase(record,'delivering_reminders')
    const delivered=await call(record,'reminder.deliver-due',{})
    if(delivered.ok){
      const ids=delivered.result
      if(!Array.isArray(ids) || ids.length>100 || ids.some(id=>!validId(id)) ||
        new Set(ids).size!==ids.length)return unknown(record,'protocol_error')
      for(const id of ids)if(!reminderMessageIds.includes(id))reminderMessageIds.push(id)
      record.reminderIds=[...ids]
      if(!disposed && active===record)publish()
    }
    if(!eligible(record))return fail('provider_aborted')
    if(!delivered.ok)return !rejectedWrites.has(delivered.error)
      ? unknown(record,delivered.error) : rejected(record,delivered.error)
    if(!provider.configured){phase(record,'settled')
      return {ok:true,result:{phase:'settled',modelAvailable:false,
        reminderMessageIds:[...record.reminderIds],plan:null}}}
    phase(record,'claiming')
    const claimed=await call(record,'contact.claim',{})
    if(!claimed.ok){
      if(!eligible(record))return fail('provider_aborted')
      return !rejectedWrites.has(claimed.error)
        ? unknown(record,claimed.error) : rejected(record,claimed.error)
    }
    if(claimed.result===null){
      if(!eligible(record))return fail('provider_aborted')
      phase(record,'settled')
      return {ok:true,result:{phase:'settled',modelAvailable:true,
        reminderMessageIds:[...record.reminderIds],plan:null}}
    }
    if(!claimed.result || typeof claimed.result!=='object' || Array.isArray(claimed.result) ||
      !validId(claimed.result.id) || !validId(claimed.result.ticket))
      return unknown(record,'protocol_error')
    record.planId=claimed.result.id;record.ticket=claimed.result.ticket
    lastPlanId=record.planId
    if(!eligible(record)){
      void failOwn(record,'provider_aborted')
      return fail('provider_aborted')
    }
    const context=clone(claimed.result);delete context.ticket
    if(typeof context.purpose!=='string' || typeof context.source!=='string' ||
      !Array.isArray(context.recent_interactions) || !Array.isArray(context.memories) ||
      typeof context.expires_at!=='string'){
      await failOwn(record,'provider_invalid_output')
      return unknown(record,'protocol_error')
    }
    phase(record,'evaluating')
    if(!eligible(record))return fail('provider_aborted')
    const generated=await providerStage(record,context)
    if(generated.kind==='timeout')return rejected(record,'provider_timeout')
    if(!eligible(record))return fail('provider_aborted')
    if(generated.kind==='barrier' || owner.needsReconciliation)
      return unknown(record,'reconciliation_required')
    if(generated.kind==='failure'){
      await failOwn(record,'provider_failed')
      return rejected(record,'provider_failed')
    }
    const output=contactReply(generated.value)
    if(!output){await failOwn(record,'provider_invalid_output')
      return rejected(record,'provider_invalid_output')}
    if(!eligible(record))return fail('provider_aborted')
    phase(record,'completing')
    const completed=await call(record,'contact.complete',
      {id:record.planId,ticket:record.ticket,decision:output.decision})
    // A stop may race with an already sent completion. Its durable receipt remains visible.
    const committed=completed.ok?remember(completed.result,record,output.decision):null
    if(completed.ok && !committed)return unknown(record,'protocol_error')
    if(!eligible(record))return fail('provider_aborted')
    if(!completed.ok){
      if(!rejectedWrites.has(completed.error))return unknown(record,completed.error)
      if(['invalid_request','invalid_followup_window'].includes(completed.error))
        await failOwn(record,'provider_invalid_output')
      return rejected(record,completed.error)
    }
    phase(record,'reading')
    const read=await call(record,'contact.read',{id:record.planId})
    if(!eligible(record))return fail('provider_aborted')
    if(!read.ok)return unknown(record,read.error)
    const verified=receipt(read.result,record.planId)
    if(!verified || JSON.stringify(verified)!==JSON.stringify(committed))
      return unknown(record,'protocol_error')
    phase(record,'settled')
    return {ok:true,result:{phase:'settled',modelAvailable:true,
      reminderMessageIds:[...record.reminderIds],plan:verified}}
  }
  function pulse(...args){
    if(args.length)return Promise.resolve(fail('invalid_request'))
    if(disposed)return Promise.resolve(fail('disposed'))
    if(active)return active.runSettled ? Promise.resolve(fail('runner_busy')) : active.flight
    if(reconciliation)return Promise.resolve(fail('runner_busy'))
    if(snapshot().needsReconciliation)return Promise.resolve(fail('reconciliation_required'))
    const claimed=owner.claim()
    if(!claimed.ok)return Promise.resolve(fail(claimed.error))
    lease=claimed.lease
    const record={runId:randomUUID(),valid:true,runSettled:false,providerPending:false,
      hostPending:0,abortController:new AbortController(),planId:null,ticket:null,
      timer:null,interrupt:null,cleanupAttempted:false,cleanupPromise:null,
      cleanupFlight:null,stopPromise:null,completeSent:false,reminderIds:[],flight:null}
    active=record;lastPlanId=null;lastReceipt=null;observationEpoch++
    let flight
    flight=Promise.resolve().then(()=>chain(record))
      .catch(()=>unknown(record,'internal_error'))
      .finally(()=>{record.runSettled=true;release()})
    record.flight=flight
    publish({runId:record.runId,planId:null,phase:'delivering_reminders',error:null,
      needsReconciliation:false})
    return flight
  }
  function stop(...args){
    if(args.length)return Promise.resolve(fail('invalid_request'))
    if(disposed)return Promise.resolve(fail('disposed'))
    const record=active
    if(!record)return Promise.resolve(fail('not_owned_plan'))
    if(record.stopPromise)return record.stopPromise
    // Freeze the response before notifying an observer that may synchronously reenter.
    let receive
    const response=new Promise(resolve=>{receive=resolve})
    record.stopPromise=response
    abort(record,'abort')
    phase(record,'stopping')
    if(record.ticket)void failOwn(record,'provider_aborted')
    receive({ok:true,result:{stopRequested:true,planId:record.planId,
      providerPending:record.providerPending,deliveryUncertain:record.completeSent,
      needsReconciliation:snapshot().needsReconciliation}})
    return response
  }
  function reconcile(...args){
    if(args.length)return Promise.resolve(fail('invalid_request'))
    if(disposed)return Promise.resolve(fail('disposed'))
    if(reconciliation)return reconciliation.flight
    const planId=active?.planId??lastPlanId
    if(!planId)return Promise.resolve(fail('no_plan'))
    if(!active){
      const claimed=owner.claim({readOnly:true})
      if(!claimed.ok)return Promise.resolve(fail(claimed.error))
      lease=claimed.lease
    }
    const record=active??{planId,valid:true,hostPending:0}
    const check={record,epoch:observationEpoch,flight:null}
    const current=()=>!disposed && reconciliation===check && check.epoch===observationEpoch
    reconciliation=check
    check.flight=Promise.resolve().then(async()=>{
      if(!current())return fail(disposed?'disposed':'stale_view')
      const read=await call(record,'contact.read',{id:planId},{cleanup:true,canSend:current})
      if(!current())return fail(disposed?'disposed':'stale_view')
      if(!read.ok)return read
      const verified=receipt(read.result,planId)
      if(!verified)return fail('protocol_error')
      lastReceipt=verified;lastPlanId=planId
      if(verified.messageId && !contactMessageIds.includes(verified.messageId))
        contactMessageIds.push(verified.messageId)
      publish({planId})
      if(!current())return fail(disposed?'disposed':'stale_view')
      return {ok:true,result:{receipt:verified,needsReconciliation:snapshot().needsReconciliation}}
    }).catch(()=>fail('internal_error')).finally(()=>{
      if(reconciliation===check)reconciliation=null
      release()
    })
    return check.flight
  }
  function dispose(){
    if(disposed)return {ok:true,result:{closed:!active && !reconciliation}}
    disposed=true;owner.dispose();observationEpoch++
    if(active){abort(active,'abort');if(active.ticket)void failOwn(active,'provider_aborted')}
    publish({disposed:true,phase:'disposed'});state.dispose();release()
    return {ok:true,result:{closed:!active && !reconciliation,
      providerPending:snapshot().providerPending,hostPending:snapshot().hostPending,
      needsReconciliation:snapshot().needsReconciliation}}
  }
  return {pulse,stop,reconcile,snapshot,subscribe,dispose,whenIdle}
}
