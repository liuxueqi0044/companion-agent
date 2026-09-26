/** Trusted foreground coordinator. Persistent truth remains in Python/SQLite. */
import {randomUUID} from 'node:crypto'
import {createState,fail,request,validId,safeCode,clone} from '../application/state.mjs'
import {projectActivity} from '../application/activity.mjs'
import {UnavailableProvider,providerReply} from './provider.mjs'
import {registerExecutionOwner} from './lease.mjs'

const reasons=new Set(['provider_failed','provider_timeout','provider_invalid_output','provider_aborted'])
// Only explicit pre-commit/business rejections establish that a write did not land.
const rejectedWrites=new Set(['invalid_request','invalid_capability','missing_material',
  'not_found','revision_conflict','idempotency_conflict','invalid_transition',
  'invalid_reminder_time','invalid_followup_window','request_too_large','unsupported_action',
  'unsupported_version','permission_denied','superseded_turn','stale_generation',
  'invalid_provider_metadata','disposed','repeated_action','workflow_waiting','reconciliation_required'])
const chainWrites=new Set(['turn.begin','turn.advance','turn.accept','turn.execute','worker.run-next'])

export function createTurnRunner({host,provider=UnavailableProvider,timeoutMs=30000,timers=globalThis}={}) {
  if (!host || typeof host.request!=='function' || !provider || typeof provider.respond!=='function' ||
    typeof provider.configured!=='boolean' || !Number.isSafeInteger(timeoutMs) ||
    timeoutMs<1 || timeoutMs>120000 || typeof timers.setTimeout!=='function' ||
    typeof timers.clearTimeout!=='function') throw new TypeError('trusted_runner_configuration_required')
  const owner=registerExecutionOwner(host,'turn')
  const state=createState({runId:null,turnId:null,phase:'idle',error:null,
    needsReconciliation:false,providerPending:false,hostPending:0,disposed:false,activity:null})
  let active=null,disposed=false,lastTurnId=null,lastTurn=null,lastStop=null,cleanupUnknown=false,lease=null
  let reconciliation=null,observationEpoch=0
  const idleWaiters=[]
  const snapshot=()=>{const value=state.snapshot()
    return {...value,needsReconciliation:value.needsReconciliation || cleanupUnknown ||
      owner.needsReconciliation,
      providerPending:active?.providerPending ?? false,
      hostPending:(active?.hostPending ?? 0)+
        (reconciliation && reconciliation.record!==active ? reconciliation.record.hostPending : 0)}}
  const subscribe=listener=>{
    if(typeof listener!=='function')throw new TypeError('invalid_listener')
    return state.subscribe(()=>listener(snapshot()))
  }
  const publish=patch=>state.publish(patch)
  function release() {
    if(reconciliation)return
    if (active && (!active.runSettled || active.providerPending || active.hostPending ||
      active.cleanupFlight || active.stopFlight)) return
    active=null
    lease?.release();lease=null
    for(const resolve of idleWaiters.splice(0))resolve({ok:true,result:{idle:true}})
  }
  function whenIdle(){return active || reconciliation ? new Promise(resolve=>idleWaiters.push(resolve))
    : Promise.resolve({ok:true,result:{idle:true}})}
  function setPending(record) {
    if(disposed || (active!==record && reconciliation?.record!==record))return
    publish({})
  }
  async function call(record,action,payload,{cleanup=false,canSend=()=>true}={}) {
    if (!cleanup && (disposed || !record.valid)) return fail('stale_run')
    record.hostPending++
    setPending(record)
    let sent=false,blocked=false
    try {
      // A synchronous observer may stop/dispose while setPending is notifying.
      const reply=await request(host,action,payload,()=>{
        if((!cleanup && !eligible(record)) || !canSend())return false
        if(!cleanup && chainWrites.has(action) && owner.needsReconciliation){blocked=true;return false}
        sent=true;return true
      })
      if(blocked)return unknown(record,'reconciliation_required')
      // A late failed write remains uncertain even if stop/dispose already won.
      if(sent && chainWrites.has(action) && !reply.ok && !rejectedWrites.has(reply.error))
        unknown(record,reply.error)
      return reply
    }
    finally {record.hostPending--;setPending(record);release()}
  }
  function phase(record,value,error=null) {
    if(disposed || active!==record)return
    observationEpoch++
    publish({phase:value,error})
  }
  function rejected(record,error) {
    if(!snapshot().needsReconciliation)phase(record,'failed',error)
    return fail(error)
  }
  function unknown(record,error) {
    observationEpoch++
    owner.markUnknown()
    if(disposed){cleanupUnknown=true;return fail(error)}
    if(active!==record)return fail(error)
    publish({phase:'needs_reconciliation',needsReconciliation:true,error})
    return fail(error)
  }
  function failOwn(record,reason) {
    if (!record.ticket || !reasons.has(reason))return null
    if(record.cleanupAttempted)return record.cleanupPromise
    record.cleanupAttempted=true
    const flight=call(record,'turn.fail-generation',
      {turn_id:record.turnId,ticket:record.ticket,reason},{cleanup:true}).then(reply=>{
      if(!reply.ok && reply.error!=='stale_generation')unknown(record,reply.error)
      else if(reply.ok && (reply.result?.id!==record.turnId ||
        reply.result?.state!=='model_failed' || reply.result?.error!==reason))
        unknown(record,'protocol_error')
      return reply
    }).finally(()=>{if(record.cleanupFlight===flight)record.cleanupFlight=null;release()})
    record.cleanupFlight=flight
    record.cleanupPromise=flight
    return flight
  }
  function abort(record,why) {
    if(!record.valid)return
    record.valid=false
    observationEpoch++
    if(record.timer!==null){timers.clearTimeout(record.timer);record.timer=null}
    record.abortController.abort()
    record.interrupt?.({kind:why})
  }
  async function providerStage(record,context) {
    const controller=record.abortController
    record.providerPending=true;setPending(record)
    const barrier=Symbol('reconciliation_required')
    const returned=Promise.resolve().then(()=>{
      if(!eligible(record))throw new Error('aborted_before_provider_send')
      if(owner.needsReconciliation)return barrier
      return provider.respond(clone(context),{signal:controller.signal})
    })
    const settled=returned.then(value=>value===barrier?{kind:'barrier'}:{kind:'value',value},()=>({kind:'failure'}))
      .then(result=>{record.providerPending=false;setPending(record);release();return result})
    const interrupted=new Promise(resolve=>{record.interrupt=resolve})
    const timed=new Promise(resolve=>{
      record.timer=timers.setTimeout(()=>{
        abort(record,'timeout')
        void failOwn(record,'provider_timeout')
        resolve({kind:'timeout'})
      },timeoutMs)
    })
    const reply=await Promise.race([settled,interrupted,timed])
    if(record.timer!==null){timers.clearTimeout(record.timer);record.timer=null}
    record.interrupt=null
    return reply
  }
  const eligible=record=>!disposed && active===record && record.valid
  function capture(record,turn) {
    if(turn?.id!==record.turnId)return false
    const activity=projectActivity({turn,stop:lastStop})
    if(!activity || activity.protocolError)return false
    observationEpoch++
    lastTurn=turn;lastTurnId=record.turnId
    if(!disposed && active===record)publish({activity})
    return true
  }
  async function runChain(record) {
    let automatic=false
    while(eligible(record)){
      const reply=await runStep(record,automatic)
      if(!reply.ok || reply.result?.continue!==true)return reply
      automatic=true
    }
    return fail('provider_aborted')
  }
  async function runStep(record,automatic) {
    if(!eligible(record))return fail(disposed?'disposed':'provider_aborted')
    record.ticket=null;record.cleanupAttempted=false;record.cleanupPromise=null
    phase(record,'beginning')
    const begun=await call(record,automatic?'turn.advance':'turn.begin',{turn_id:record.turnId})
    if(!begun.ok) {
      if(!eligible(record))return fail('provider_aborted')
      return !rejectedWrites.has(begun.error)
        ? unknown(record,begun.error) : rejected(record,begun.error)
    }
    if(begun.result?.turn_id!==record.turnId)
      return unknown(record,'protocol_error')
    if(!eligible(record)){
      if(validId(begun.result.ticket)){record.ticket=begun.result.ticket;void failOwn(record,'provider_aborted')}
      return fail('provider_aborted')
    }
    if(begun.result.paused===true){
      if(begun.result.turn?.state!=='paused'||!capture(record,begun.result.turn))return unknown(record,'protocol_error')
      phase(record,'paused')
      return {ok:true,result:{phase:'paused',activity:snapshot().activity}}
    }
    let accepted
    if(begun.result.resume_actions===true){
      if(begun.result.turn?.state!=='actions_ready')return unknown(record,'protocol_error')
      accepted={ok:true,result:begun.result.turn}
    }else{
    if(!validId(begun.result.ticket))return unknown(record,'protocol_error')
    record.ticket=begun.result.ticket
    if(!eligible(record)){
      void failOwn(record,'provider_aborted')
      return fail('provider_aborted')
    }
    const context=clone(begun.result)
    delete context.ticket
    if(context.workflow){
      const current=await call(record,'turn.read',{turn_id:record.turnId})
      if(!eligible(record))return fail('provider_aborted')
      if(!current.ok || !capture(record,current.result))return unknown(record,current.error??'protocol_error')
    }
    phase(record,'generating')
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
    let output
    try{output=providerReply(generated.value)}catch{output=null}
    if(!output){await failOwn(record,'provider_invalid_output');return rejected(record,'provider_invalid_output')}
    if(!eligible(record))return fail('provider_aborted')
    phase(record,'accepting')
    accepted=await call(record,'turn.accept',{turn_id:record.turnId,ticket:record.ticket,
      decision:output.decision,...(output.displayableSummary===null ? {} :
        {provider_summary:output.displayableSummary})})
    if(!eligible(record))return fail('provider_aborted')
    if(!accepted.ok){
      if(!rejectedWrites.has(accepted.error))
        return unknown(record,accepted.error)
      if(['invalid_request','permission_denied','invalid_provider_metadata',
        'invalid_followup_window','invalid_reminder_time','missing_material','repeated_action'].includes(accepted.error))
        await failOwn(record,'provider_invalid_output')
      return rejected(record,accepted.error)
    }
    }
    if(!capture(record,accepted.result))return unknown(record,'protocol_error')
    if(accepted.result.state==='model_failed'){
      phase(record,'failed',safeCode(accepted.result.error))
      return fail(safeCode(accepted.result.error))
    }
    if(accepted.result.state==='responded'){
      phase(record,'responded')
      return {ok:true,result:{phase:'responded',activity:snapshot().activity}}
    }
    if(accepted.result.state!=='actions_ready' ||
      !Array.isArray(accepted.result.actions) || accepted.result.actions.length===0 ||
      !accepted.result.actions.some(item=>item.state==='ready') ||
      accepted.result.actions.some(item=>!validId(item.id) ||
        !['csv.audit','profile.change','artifact.create','reminder.create','tool.save','tool.run','data.query'].includes(item.kind) ||
        (!accepted.result.workflow && item.state!=='ready')) ||
      snapshot().activity?.protocolError)return unknown(record,'protocol_error')
    if(!eligible(record))return fail('provider_aborted')
    phase(record,'executing')
    const executed=await call(record,'turn.execute',{turn_id:record.turnId})
    if(!eligible(record))return fail('provider_aborted')
    if(!executed.ok)return !rejectedWrites.has(executed.error)
      ? unknown(record,executed.error) : rejected(record,executed.error)
    if(!capture(record,executed.result))return unknown(record,'protocol_error')
    if(!['actions_recorded','outcome_unknown'].includes(executed.result.state) ||
      !Array.isArray(executed.result.actions) || snapshot().activity?.protocolError)
      return unknown(record,'protocol_error')
    if(executed.result.state==='outcome_unknown' || executed.result.actions?.some(item=>item.state==='outcome_unknown'))
      return unknown(record,'outcome_unknown')
    const queued=executed.result.actions?.some(item=>item.kind==='csv.audit' &&
      item.state==='accepted' && item.task?.status==='queued')
    if(queued){
      if(!eligible(record))return fail('provider_aborted')
      phase(record,'working')
      const worked=await call(record,'worker.run-next',{})
      if(!eligible(record))return fail('provider_aborted')
      if(!worked.ok)return unknown(record,worked.error)
    }
    if(!eligible(record))return fail('provider_aborted')
    phase(record,'reading')
    const read=await call(record,'turn.read',{turn_id:record.turnId})
    if(!eligible(record))return fail('provider_aborted')
    if(!read.ok)return unknown(record,read.error)
    if(!capture(record,read.result))return unknown(record,'protocol_error')
    const activity=snapshot().activity
    const next=activity?.needsReconciliation ? 'needs_reconciliation' :
      activity?.taskStatus==='queued' ? 'waiting_for_worker' : 'settled'
    if(next==='needs_reconciliation')return unknown(record,'outcome_unknown')
    const more=next==='settled'&&read.result.workflow?.next==='continue'
    phase(record,more?'observing':next)
    return {ok:true,result:{phase:next,activity,continue:more}}
  }
  function start(input,mode) {
    if(disposed)return Promise.resolve(fail('disposed'))
    if(!input || typeof input!=='object' || Array.isArray(input) ||
      Object.keys(input).some(key=>key!=='turnId') || !validId(input.turnId))
      return Promise.resolve(fail('invalid_request'))
    const turnId=input.turnId
    if(active) return active.turnId===turnId && !active.runSettled && active.mode===mode
      ? active.flight : Promise.resolve(fail('runner_busy'))
    if(reconciliation)return Promise.resolve(fail('runner_busy'))
    if(snapshot().needsReconciliation)return Promise.resolve(fail('reconciliation_required'))
    if(mode==='run' && !provider.configured)return Promise.resolve(fail('model_not_configured'))
    const claimed=owner.claim()
    if(!claimed.ok)return Promise.resolve(fail(claimed.error))
    lease=claimed.lease
    const record={runId:randomUUID(),turnId,mode,valid:true,runSettled:false,providerPending:false,
      hostPending:0,abortController:new AbortController(),ticket:null,timer:null,interrupt:null,
      cleanupFlight:null,cleanupPromise:null,cleanupAttempted:false,stopFlight:null,
      stopCommandId:randomUUID(),flight:null}
    active=record;lastTurnId=turnId;lastTurn=null;lastStop=null;observationEpoch++
    let flight
    flight=Promise.resolve().then(()=>mode==='run' ? runChain(record) : localChain(record))
      .catch(()=>unknown(record,'internal_error')).finally(()=>{record.runSettled=true;release()})
    record.flight=flight
    publish({runId:record.runId,turnId,phase:mode==='run'?'beginning':'reading',error:null,
      needsReconciliation:false,providerPending:false,hostPending:0,activity:null})
    return flight
  }
  const run=input=>start(input,'run')
  async function localChain(record) {
    if(!eligible(record))return fail('provider_aborted')
    const before=await call(record,'turn.read',{turn_id:record.turnId})
    if(!eligible(record))return fail('provider_aborted')
    if(!before.ok)return rejected(record,before.error)
    if(!capture(record,before.result))return unknown(record,'protocol_error')
    if(snapshot().activity?.protocolError)return unknown(record,'protocol_error')
    if(snapshot().activity?.needsReconciliation)return unknown(record,'outcome_unknown')
    const queued=before.result.state!=='cancelled' && before.result.actions?.some(item=>
      item.kind==='csv.audit' && item.state==='accepted' && item.task?.status==='queued')
    if(!queued)return rejected(record,'no_queued_task')
    phase(record,'working')
    const worked=await call(record,'worker.run-next',{})
    if(!eligible(record))return fail('provider_aborted')
    if(!worked.ok)return unknown(record,worked.error)
    phase(record,'reading')
    const after=await call(record,'turn.read',{turn_id:record.turnId})
    if(!eligible(record))return fail('provider_aborted')
    if(!after.ok)return unknown(record,after.error)
    if(!capture(record,after.result))return unknown(record,'protocol_error')
    if(snapshot().activity?.needsReconciliation)return unknown(record,'outcome_unknown')
    const next=snapshot().activity?.taskStatus==='queued'?'waiting_for_worker':'settled'
    phase(record,next)
    return {ok:true,result:{phase:next,activity:snapshot().activity}}
  }
  const runLocalOnce=input=>start(input,'local')
  function stop() {
    if(disposed)return Promise.resolve(fail('disposed'))
    const record=active
    if(!record)return Promise.resolve(fail('not_owned_turn'))
    if(record.stopFlight)return record.stopFlight
    let receive
    const response=new Promise(resolve=>{receive=resolve})
    let flight
    flight=response.then(reply=>{
      if(disposed){
        if(!reply.ok || reply.result?.turn_id!==record.turnId ||
          reply.result.permission_revoked!==true || !Array.isArray(reply.result.tasks) ||
          reply.result.tasks.some(item=>item.needs_reconciliation===true)){
          cleanupUnknown=true;owner.markUnknown()
        }
        return fail('disposed')
      }
      if(!reply.ok)return unknown(record,reply.error)
      if(reply.result?.turn_id!==record.turnId || reply.result.permission_revoked!==true ||
        !Array.isArray(reply.result.tasks))
        return unknown(record,'protocol_error')
      observationEpoch++
      lastStop=reply.result
      if(lastTurn)publish({activity:projectActivity({turn:lastTurn,stop:lastStop})})
      const needsReconciliation=reply.result.tasks.some(item=>item.needs_reconciliation===true)
      if(needsReconciliation)unknown(record,'outcome_unknown')
      return {ok:true,result:{permissionRevoked:true,workerExited:reply.result.worker_exited ?? null,
        needsReconciliation:snapshot().needsReconciliation}}
    }).finally(()=>{if(record.stopFlight===flight)record.stopFlight=null;release()})
    record.stopFlight=flight
    abort(record,'abort')
    phase(record,'stopping')
    if(record.ticket)void failOwn(record,'provider_aborted')
    Promise.resolve().then(()=>call(record,'turn.stop',
      {turn_id:record.turnId,command_id:record.stopCommandId},{cleanup:true}))
      .then(receive,()=>receive(fail('transport_unavailable')))
    return flight
  }
  function reconcile() {
    if(disposed)return Promise.resolve(fail('disposed'))
    if(reconciliation)return reconciliation.flight
    const turnId=active?.turnId ?? lastTurnId
    if(!turnId)return Promise.resolve(fail('no_turn'))
    if(!active){
      const claimed=owner.claim({readOnly:true})
      if(!claimed.ok)return Promise.resolve(fail(claimed.error))
      lease=claimed.lease
    }
    const record=active ?? {turnId,valid:true,hostPending:0}
    const check={record,epoch:observationEpoch,flight:null}
    const current=()=>!disposed && reconciliation===check && check.epoch===observationEpoch
    reconciliation=check
    // Register the flight before any host request or subscriber can reenter.
    check.flight=Promise.resolve().then(async()=>{
      if(!current())return fail(disposed?'disposed':'stale_view')
      const read=await call(record,'turn.read',{turn_id:turnId},{cleanup:true,canSend:current})
      if(!current())return fail(disposed?'disposed':'stale_view')
      if(!read.ok)return read
      if(read.result?.id!==turnId)return fail('protocol_error')
      const activity=projectActivity({turn:read.result,stop:lastStop})
      if(!activity || activity.protocolError)return fail('protocol_error')
      lastTurn=read.result
      if(activity.needsReconciliation){
        cleanupUnknown=true
        owner.markUnknown()
        publish({phase:'needs_reconciliation',needsReconciliation:true,error:'outcome_unknown'})
      }
      publish({activity})
      if(!current())return fail(disposed?'disposed':'stale_view')
      return {ok:true,result:{activity,needsReconciliation:snapshot().needsReconciliation}}
    }).catch(()=>fail('internal_error')).finally(()=>{
      if(reconciliation===check)reconciliation=null
      release()
    })
    return check.flight
  }
  function dispose() {
    if(disposed)return {ok:true,result:{closed:!active && !reconciliation}}
    disposed=true
    owner.dispose()
    observationEpoch++
    const record=active
    if(record){abort(record,'abort');if(record.ticket)void failOwn(record,'provider_aborted')}
    publish({disposed:true,phase:'disposed'})
    state.dispose()
    release()
    return {ok:true,result:{closed:!active && !reconciliation,providerPending:snapshot().providerPending,
      hostPending:snapshot().hostPending,needsReconciliation:snapshot().needsReconciliation}}
  }
  return {run,stop,reconcile,runLocalOnce,snapshot,subscribe,dispose,whenIdle}
}
