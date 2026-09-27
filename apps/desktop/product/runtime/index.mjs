/** Trusted, headless composition. The original host remains owned by its caller. */
import {createHash} from 'node:crypto'
import {createProductApplication} from '../application/index.mjs'
import {createTurnRunner} from '../execution/runner.mjs'
import {createContactRunner} from '../execution/contact-runner.mjs'
import {fail,safeCode,validId} from '../application/state.mjs'
import {createResourceAPI} from './resources.mjs'

const owners=new WeakMap()
const sendFields=new Set(['command_id','conversation_id','text','csv_text','temporary'])
const definiteSubmitErrors=new Set(['invalid_request','invalid_capability','missing_material',
  'idempotency_conflict','unsupported_action','unsupported_version'])

function sendInput(value){
  if(!value || typeof value!=='object' || Array.isArray(value) ||
    Object.keys(value).some(key=>!sendFields.has(key)) ||
    !validId(value.command_id) || !validId(value.conversation_id) ||
    typeof value.text!=='string' ||
    (value.csv_text!==undefined && value.csv_text!==null && typeof value.csv_text!=='string') ||
    (value.temporary!==undefined && typeof value.temporary!=='boolean'))return null
  const frozen=Object.freeze({command_id:value.command_id,conversation_id:value.conversation_id,
    text:value.text,csv_text:value.csv_text??null,temporary:value.temporary??false})
  const json=JSON.stringify(frozen)
  return {value:frozen,hash:createHash('sha256').update(json).digest('hex')}
}

export function createProductRuntime({host,intent,turnProvider,contactProvider,capabilityExecutor,
  timeoutMs,timers}={}) {
  if(!host || typeof host.request!=='function' ||
    (intent!==undefined && typeof intent!=='function'))
    throw new TypeError('trusted_runtime_configuration_required')
  if(owners.has(host))throw new Error('runtime_owned')
  const runnerOptions={host,...(timeoutMs===undefined?{}:{timeoutMs}),
    ...(timers===undefined?{}:{timers})}
  let turn,contact,app
  try{
    turn=createTurnRunner({...runnerOptions,capabilityExecutor,...(turnProvider===undefined?{}:{provider:turnProvider})})
    contact=createContactRunner({...runnerOptions,
      ...(contactProvider===undefined?{}:{provider:contactProvider})})
    app=createProductApplication({host,...(intent===undefined?{}:{intent}),runner:turn})
  }catch(error){
    contact?.dispose();turn?.dispose()
    throw error
  }
  const ownership={};owners.set(host,ownership)
  let initialized=false,closing=false,closed=false,initFlight=null,reservation=null,
    sendRecord=null,viewEpoch=0
  const operations=new Set(),waiters=new Set(),listeners=new Set(),unsubs=[]
  const sentCommands=new Map()
  const observedMessages=new Set()
  let selectedRefresh=null,homeFlight=null,inboxFlight=null,messageSyncFlight=null,
    messageRevision=0,syncedMessageRevision=0,lastMessageSync=null
  const notify=()=>{for(const listener of [...listeners])if(listeners.has(listener)){
    try{listener(snapshot())}catch{/* A display callback does not own runtime work. */}
  }}
  const wake=()=>{for(const resolve of waiters){waiters.delete(resolve);resolve()}}
  function tracked(value){
    const flight=Promise.resolve(value).catch(()=>fail('internal_error'))
    operations.add(flight)
    void flight.finally(()=>{operations.delete(flight);notify();wake()})
    return flight
  }
  function operation(fn,announce=true){
    if(closing)return Promise.resolve(fail('disposed'))
    const flight=tracked(Promise.resolve().then(()=>closing?fail('disposed'):fn()))
    if(announce)notify()
    return flight
  }
  const uiOperation=(fn,announce=true)=>initialized ? operation(fn,announce) : Promise.resolve(fail('not_initialized'))
  function capturedOperation(fn,args,{navigation=false,requiresInitialization=true}={}){
    let captured
    try{captured=structuredClone(args)}catch{return Promise.resolve(fail('invalid_request'))}
    if(navigation)viewEpoch++
    return requiresInitialization ? uiOperation(()=>fn(...captured)) : operation(()=>fn(...captured))
  }
  function snapshot(){
    return {...app.snapshot(),runtime:{initialized,closing,closed,
      pendingOperations:operations.size,executionBusy:reservation!==null,
      send:sendRecord?{commandId:sendRecord.id,phase:sendRecord.stage,
        turnId:sendRecord.turnId,submission:sendRecord.submission,
        cancelRequested:sendRecord.cancelRequested}:null}}
  }
  function subscribe(listener){
    if(typeof listener!=='function' || closing)throw new TypeError('invalid_listener')
    listeners.add(listener)
    try{listener(snapshot())}catch{/* Other listeners remain live. */}
    return ()=>listeners.delete(listener)
  }
  function diagnostics(){
    const turnView=turn.snapshot(),contactView=contact.snapshot()
    const pickRunner=value=>({phase:value.phase,error:value.error?safeCode(value.error):null,
      providerPending:!!value.providerPending,hostPending:value.hostPending??0,
      needsReconciliation:!!value.needsReconciliation})
    return {closing,closed,pendingOperations:operations.size,
      executionBusy:reservation!==null,turn:pickRunner(turnView),contact:pickRunner(contactView),
      committedContactMessageIds:[...contactView.contactMessageIds],
      committedReminderMessageIds:[...contactView.reminderMessageIds]}
  }
  function initialize(){
    if(closing)return Promise.resolve(fail('disposed'))
    if(initFlight)return initFlight
    if(initialized)return Promise.resolve({ok:true,result:snapshot()})
    const flight=tracked(Promise.resolve().then(()=>closing?fail('disposed'):app.initialize())
      .then(reply=>{if(reply.ok && !closing)initialized=true;notify();return reply}))
    initFlight=flight
    void flight.finally(()=>{if(initFlight===flight)initFlight=null})
    notify()
    return flight
  }
  const open=input=>capturedOperation(app.open,[input],{navigation:true,requiresInitialization:false})
  function refreshHome(){
    if(closing)return Promise.resolve(fail('disposed'))
    if(homeFlight)return homeFlight
    const flight=uiOperation(()=>app.refreshHome(),false)
    homeFlight=flight
    void flight.finally(()=>{if(homeFlight===flight)homeFlight=null})
    notify()
    return flight
  }
  function refreshInbox(){
    if(closing)return Promise.resolve(fail('disposed'))
    if(app.snapshot().panel!=='inbox')return Promise.resolve(fail('stale_view'))
    if(inboxFlight)return inboxFlight
    const epoch=viewEpoch
    const flight=uiOperation(()=>viewEpoch===epoch && app.snapshot().panel==='inbox'
      ? app.inbox.refresh() : fail('stale_view'),false)
    inboxFlight=flight
    void flight.finally(()=>{if(inboxFlight===flight)inboxFlight=null})
    notify()
    return flight
  }
  function refreshSelectedBound(turnId,epoch){
    if(closing)return Promise.resolve(fail('disposed'))
    if(selectedRefresh?.turnId===turnId && selectedRefresh.epoch===epoch)
      return selectedRefresh.flight
    if(!syncCandidate(turnId,epoch))return Promise.resolve(fail('selection_not_ready'))
    const flight=uiOperation(()=>syncCandidate(turnId,epoch)
      ? app.conversation.refreshSelected() : fail('stale_view'),false)
    selectedRefresh={turnId,epoch,flight}
    void flight.finally(()=>{if(selectedRefresh?.flight===flight)selectedRefresh=null})
    notify()
    return flight
  }
  const refresh=()=>{
    if(!initialized)return Promise.resolve(fail('not_initialized'))
    const shown=app.snapshot()
    if(shown.panel==='home')return refreshHome()
    if(shown.panel==='inbox')return operation(async()=>{
      const reply=await refreshInbox()
      if(reply.ok)await refreshHome()
      return reply
    })
    if(shown.panel==='conversation' && shown.conversation?.turn?.id===
      shown.conversation?.selectedTurnId)
      return refreshSelectedBound(shown.conversation.turn.id,viewEpoch)
    return operation(()=>app.refresh())
  }
  function takeExecution(lane,kind,{allowUnknown=false}={}){
    if(reservation)return fail('runner_busy')
    if(!allowUnknown && (turn.snapshot().needsReconciliation ||
      contact.snapshot().needsReconciliation))return fail('reconciliation_required')
    const token={lane,kind,flight:null,finished:false};reservation=token
    return {ok:true,token}
  }
  function retireExecution(token,runner){
    const busy=runner.snapshot().providerPending || runner.snapshot().hostPending
    const waiter=tracked(Promise.resolve().then(()=>runner.whenIdle()).then(()=>{
      if(reservation===token){reservation=null;notify();wake()}
    }))
    notify()
    // Ordinary settled work frees the slot before its caller receives completion.
    // A nonsettling provider/cleanup keeps the slot while the caller can return.
    return busy ? Promise.resolve() : waiter
  }
  function syncCandidate(turnId,epoch){
    if(closing || viewEpoch!==epoch)return false
    const shown=app.snapshot()
    return shown.panel==='conversation' && shown.conversation?.selectedTurnId===turnId &&
      shown.conversation?.turn?.id===turnId && !shown.conversation.loading
  }
  async function syncTurn(turnId,epoch){
    if(!syncCandidate(turnId,epoch))return {synced:false,error:'stale_view'}
    const reply=await refreshSelectedBound(turnId,epoch)
    if(!syncCandidate(turnId,epoch))return {synced:false,error:'stale_view'}
    return {synced:reply.ok,error:reply.ok?null:safeCode(reply.error)}
  }
  function observeCommittedMessages(){
    const current=contact.snapshot()
    let found=false
    for(const id of [...current.reminderMessageIds,...current.contactMessageIds])
      if(!observedMessages.has(id)){observedMessages.add(id);found=true}
    if(found && initialized && !closing){messageRevision++;void scheduleMessageSync()}
    notify()
  }
  function scheduleMessageSync(){
    if(closing || !initialized)return Promise.resolve({synced:false,error:'disposed'})
    if(messageSyncFlight)return messageSyncFlight
    if(syncedMessageRevision>=messageRevision && lastMessageSync)
      return Promise.resolve(lastMessageSync)
    const target=messageRevision
    // A read already in progress may have captured the database before delivery.
    // Settle those reads, then require a read begun after the committed message.
    const priorHome=homeFlight,priorInbox=inboxFlight
    const flight=tracked(Promise.resolve().then(async()=>{
      if(priorHome)await priorHome
      const home=await refreshHome()
      if(priorInbox)await priorInbox
      const inbox=app.snapshot().panel==='inbox' ? await refreshInbox() : null
      return {synced:home.ok && (inbox===null || inbox.ok),
        homeSynced:home.ok,inboxSynced:inbox?.ok??false,
        error:!home.ok?safeCode(home.error):inbox && !inbox.ok?safeCode(inbox.error):null}
    }).then(result=>{syncedMessageRevision=target;lastMessageSync=result;return result})
      .finally(()=>{if(messageSyncFlight===flight)messageSyncFlight=null
        if(!closing && messageRevision>target)void scheduleMessageSync()}))
    messageSyncFlight=flight;notify()
    return flight
  }
  async function latestMessageSync(since){
    if(messageRevision<=since)return null
    let view=lastMessageSync
    while(!closing && syncedMessageRevision<messageRevision)
      view=await scheduleMessageSync()
    return view
  }
  async function sendChain(record){
    try{
      if(closing || record.cancelRequested)return {ok:false,error:'send_cancelled',
        stage:'submission',submission:'not_sent'}
      // The placeholder is registered before any display notification can cancel it.
      record.submitFlight=Promise.resolve().then(()=>closing || record.cancelRequested
        ? fail('send_cancelled') : app.conversation.submitTurn(record.input))
      record.stage='submitting';notify()
      const submitted=await record.submitFlight
      record.submitFlight=null
      if(!submitted.ok){
        record.submission=app.conversation.snapshot().submitUnknown ||
          !definiteSubmitErrors.has(submitted.error) && submitted.error!=='send_cancelled'
          ? 'unknown':'not_sent'
        sentCommands.get(record.id).submission=record.submission
        return {ok:false,error:submitted.error,stage:'submission',submission:record.submission}
      }
      if(submitted.result?.id!==record.id){
        record.submission='unknown';sentCommands.get(record.id).submission='unknown'
        return {ok:false,error:'outcome_unknown',stage:'submission',submission:'unknown'}
      }
      record.turnId=record.id;record.submission='confirmed'
      Object.assign(sentCommands.get(record.id),{submission:'confirmed',turnId:record.id})
      if(!closing && !record.cancelRequested && record.startEpoch===viewEpoch){
        record.viewEpoch=++viewEpoch
        record.stage='selecting';notify()
        const selected=await app.open({panel:'conversation',turnId:record.id})
        record.selectError=selected.ok?null:safeCode(selected.error)
      }
      if(submitted.result.state!=='queued'){
        record.stage='already_submitted';notify()
        return {ok:true,result:{turnId:record.id,
          execution:{phase:'already_submitted',state:submitted.result.state},
          view:{synced:record.selectError===null && syncCandidate(record.id,record.viewEpoch),
            error:record.selectError}}}
      }
      if(closing || record.cancelRequested)return {ok:false,error:'send_cancelled',
        stage:'execution',turnId:record.id,submission:'confirmed'}
      record.stage='execution';notify()
      if(closing || record.cancelRequested)return {ok:false,error:'send_cancelled',
        stage:'execution',turnId:record.id,submission:'confirmed'}
      record.runnerStarted=true
      const execution=await turn.run({turnId:record.id})
      record.stage='syncing';notify()
      const view=record.viewEpoch!==null ? await syncTurn(record.id,record.viewEpoch) :
        {synced:false,error:record.selectError??'stale_view'}
      if(!execution.ok)return {ok:false,error:safeCode(execution.error),stage:'execution',
        turnId:record.id,submission:'confirmed',view}
      return {ok:true,result:{turnId:record.id,execution:execution.result,view}}
    }catch{
      return {ok:false,error:'internal_error',stage:record.submission==='not_sent'
        ? 'submission':'execution',turnId:record.turnId,submission:record.submission}
    }finally{
      record.stage='finished'
      if(sendRecord===record)sendRecord=null
      await retireExecution(record.token,turn)
      notify()
    }
  }
  function send(input){
    const prepared=sendInput(input)
    if(!prepared)return Promise.resolve({ok:false,error:'invalid_request',stage:'submission',
      submission:'not_sent'})
    const id=prepared.value.command_id,prior=sentCommands.get(id)
    if(prior && prior.hash!==prepared.hash)return Promise.resolve(fail('idempotency_conflict'))
    if(sendRecord?.id===id)return sendRecord.flight
    if(closing)return Promise.resolve(fail('disposed'))
    if(!initialized)return Promise.resolve(fail('not_initialized'))
    if(sendRecord || reservation)return Promise.resolve(fail('runner_busy'))
    if(prior?.submission==='unknown')return Promise.resolve(fail('submit_pending_reconciliation'))
    if(prior?.submission==='confirmed')return Promise.resolve({ok:true,result:{turnId:prior.turnId,
      execution:{phase:'already_submitted'},view:{synced:false,error:null}}})
    // Do not register a different command as unknown when it never reached transport.
    if(app.conversation.snapshot().submitUnknown)
      return Promise.resolve(fail('submit_pending_reconciliation'))
    const taken=takeExecution('turn','send')
    if(!taken.ok)return Promise.resolve(taken)
    if(!prior)sentCommands.set(id,{hash:prepared.hash,submission:'not_sent',turnId:null})
    const record={id,input:prepared.value,stage:'registered',turnId:null,submission:'not_sent',
      startEpoch:viewEpoch,viewEpoch:null,selectError:null,cancelRequested:false,
      runnerStarted:false,submitFlight:null,cancelFlight:null,flight:null,token:taken.token}
    sendRecord=record
    const flight=tracked(Promise.resolve().then(()=>sendChain(record)))
    record.flight=flight
    notify()
    return flight
  }
  function cancelSend({commandId}={}){
    if(!validId(commandId))return Promise.resolve(fail('invalid_request'))
    if(closing)return Promise.resolve(fail('disposed'))
    const record=sendRecord
    if(!record || record.id!==commandId)return Promise.resolve(fail('not_owned_send'))
    if(record.cancelFlight)return record.cancelFlight
    record.cancelRequested=true
    const flight=tracked(Promise.resolve().then(async()=>{
      if(record.runnerStarted){
        const stopped=await turn.stop()
        return stopped.ok ? {ok:true,result:{cancelRequested:true,turnId:record.turnId,
          submission:record.submission,permissionRevoked:stopped.result.permissionRevoked===true,
          workerExited:stopped.result.workerExited??null,
          needsReconciliation:stopped.result.needsReconciliation===true}} :
          {ok:false,error:safeCode(stopped.error),cancelRequested:true,
            turnId:record.turnId,submission:record.submission,permissionRevoked:false}
      }
      if(record.submitFlight)await record.submitFlight
      return {ok:true,result:{cancelRequested:true,turnId:record.turnId,
        submission:record.submission,permissionRevoked:false,workerExited:null}}
    }))
    record.cancelFlight=flight;notify()
    return flight
  }
  function replaySubmit(){
    if(!initialized)return Promise.resolve(fail('not_initialized'))
    return operation(async()=>{
      const reply=await app.conversation.replaySubmit()
      if(reply.ok){
        const prior=sentCommands.get(reply.result?.id)
        if(prior && prior.submission==='unknown'){
          prior.submission='confirmed';prior.turnId=reply.result.id
        }
      }
      return reply
    })
  }
  const uiCall=fn=>(...args)=>capturedOperation(fn,args)
  const selectedTurn=()=>{
    const shown=app.snapshot()
    return shown.panel==='conversation' && !shown.conversation?.loading &&
      shown.conversation?.selectedTurnId===shown.conversation?.turn?.id
      ? shown.conversation.turn.id : null
  }
  const withView=async(reply,turnId,epoch)=>{
    const view=await syncTurn(turnId,epoch)
    return reply.ok ? {ok:true,result:{...reply.result,view}} : {...reply,view}
  }
  function runWork(kind,method,{allowUnknown=false}={}){
    if(closing)return Promise.resolve(fail('disposed'))
    if(!initialized)return Promise.resolve(fail('not_initialized'))
    const turnId=selectedTurn(),epoch=viewEpoch
    if(!turnId)return Promise.resolve(fail('selection_not_ready'))
    if(reservation){
      if(reservation.lane==='turn' && reservation.kind===kind &&
        reservation.turnId===turnId && !reservation.finished)return reservation.flight
      return Promise.resolve(fail('runner_busy'))
    }
    const taken=takeExecution('turn',kind,{allowUnknown})
    if(!taken.ok)return Promise.resolve(taken)
    const token=taken.token;token.turnId=turnId
    const flight=tracked(Promise.resolve().then(()=>syncCandidate(turnId,epoch)
      ? method() : fail('stale_view')).then(reply=>withView(reply,turnId,epoch))
      .finally(async()=>{token.finished=true;await retireExecution(token,turn)}))
    token.flight=flight;notify()
    return flight
  }
  function stopWork(){
    if(!initialized)return Promise.resolve(fail('not_initialized'))
    const turnId=selectedTurn(),epoch=viewEpoch
    if(!turnId)return Promise.resolve(fail('selection_not_ready'))
    return uiOperation(async()=>{
      if(!syncCandidate(turnId,epoch))return fail('stale_view')
      const reply=await app.work.stopSelected()
      return withView(reply,turnId,epoch)
    })
  }
  function reconcileWork(){
    if(!initialized)return Promise.resolve(fail('not_initialized'))
    if(reservation){
      if(reservation.lane!=='turn')return Promise.resolve(fail('runner_busy'))
      const turnId=selectedTurn(),epoch=viewEpoch
      if(!turnId)return Promise.resolve(fail('selection_not_ready'))
      return uiOperation(async()=>withView(await app.work.reconcileSelected(),turnId,epoch))
    }
    return runWork('work.reconcileSelected',()=>app.work.reconcileSelected(),{allowUnknown:true})
  }
  // Resource commands own a runner ID, never a page selection. Reserve before the
  // first await, and keep the existing execution lease until real cleanup finishes.
  function runById({turnId,kind='start',runId}={}){
    if(!validId(turnId)||!['start','local','reconcile'].includes(kind))return Promise.resolve(fail('invalid_request'))
    if(closing)return Promise.resolve(fail('disposed'))
    if(!initialized)return Promise.resolve(fail('not_initialized'))
    if(kind==='reconcile' && (turn.snapshot().turnId!==turnId || turn.snapshot().runId!==runId))
      return Promise.resolve(fail('not_owned_run'))
    if(reservation){
      if(kind==='reconcile' && reservation.lane==='turn')return uiOperation(()=>
        turn.snapshot().turnId===turnId && turn.snapshot().runId===runId ? turn.reconcile() : fail('not_owned_run'))
      return Promise.resolve(fail('runner_busy'))
    }
    const taken=takeExecution('turn',`resource.${kind}`,{allowUnknown:kind==='reconcile'})
    if(!taken.ok)return Promise.resolve(taken)
    const token=taken.token;token.turnId=turnId
    const flight=tracked(Promise.resolve().then(()=>closing?fail('disposed'):
      kind==='local'?turn.runLocalOnce({turnId}):kind==='reconcile'?turn.reconcile():turn.run({turnId}))
      .finally(async()=>{token.finished=true;await retireExecution(token,turn)}))
    token.flight=flight;notify();return flight
  }
  function stopById({turnId,runId}={}){
    if(!validId(turnId)||!validId(runId))return Promise.resolve(fail('invalid_request'))
    return uiOperation(()=>turn.snapshot().turnId===turnId && turn.snapshot().runId===runId
      ? turn.stop() : fail('not_owned_run'))
  }
  function pulseContact(){
    if(closing)return Promise.resolve(fail('disposed'))
    if(!initialized)return Promise.resolve(fail('not_initialized'))
    if(reservation){
      if(reservation.kind==='pulseContact' && !reservation.finished)return reservation.flight
      return Promise.resolve(fail('runner_busy'))
    }
    const taken=takeExecution('contact','pulseContact')
    if(!taken.ok)return Promise.resolve(taken)
    const token=taken.token,startRevision=messageRevision
    const flight=tracked(Promise.resolve().then(()=>closing?fail('disposed'):contact.pulse())
      .then(async reply=>{
        const view=await latestMessageSync(startRevision)
        const projected=view??{synced:false,homeSynced:false,inboxSynced:false,error:null}
        return reply.ok ? {ok:true,result:{...reply.result,view:projected}} : {...reply,view:projected}
      }).finally(async()=>{token.finished=true;await retireExecution(token,contact)}))
    token.flight=flight;notify()
    return flight
  }
  const stopContact=()=>uiOperation(()=>contact.stop())
  function reconcileContact(){
    if(closing)return Promise.resolve(fail('disposed'))
    if(!initialized)return Promise.resolve(fail('not_initialized'))
    if(reservation){
      if(reservation.lane!=='contact')return Promise.resolve(fail('runner_busy'))
      return uiOperation(()=>contact.reconcile())
    }
    const taken=takeExecution('contact','reconcileContact',{allowUnknown:true})
    if(!taken.ok)return Promise.resolve(taken)
    const token=taken.token
    const flight=tracked(Promise.resolve().then(()=>closing?fail('disposed'):contact.reconcile())
      .finally(async()=>{token.finished=true;await retireExecution(token,contact)}))
    token.flight=flight;notify()
    return flight
  }
  function finishClose(){
    if(closed || !closing || operations.size || reservation)return
    closed=true;owners.delete(host);notify();wake()
  }
  let idleFlight=null
  function whenIdle(){
    if(idleFlight)return idleFlight
    let flight
    flight=(async()=>{
      for(;;){
        if(operations.size || reservation){await new Promise(resolve=>waiters.add(resolve));continue}
        await Promise.all([turn.whenIdle(),contact.whenIdle()])
        if(operations.size || reservation)continue
        finishClose()
        return {ok:true,result:{idle:true,closed}}
      }
    })().finally(()=>{if(idleFlight===flight)idleFlight=null})
    idleFlight=flight
    return flight
  }
  function dispose(){
    if(closing)return {ok:true,result:{closing:!closed,closed,
      pendingOperations:operations.size,executionBusy:reservation!==null}}
    closing=true;viewEpoch++
    if(sendRecord)sendRecord.cancelRequested=true
    const first=turn.dispose(),second=contact.dispose()
    app.dispose()
    for(const view of views)view.dispose()
    views.clear()
    for(const unsubscribe of unsubs)unsubscribe()
    notify();listeners.clear()
    if(first.result.closed && second.result.closed)finishClose()
    if(!closed)void whenIdle()
    return {ok:true,result:{closing:!closed,closed,pendingOperations:operations.size,
      executionBusy:reservation!==null,
      providerPending:!!(first.result.providerPending || second.result.providerPending),
      hostPending:(first.result.hostPending??0)+(second.result.hostPending??0)}}
  }
  unsubs.push(app.subscribe(notify),turn.subscribe(notify),contact.subscribe(observeCommittedMessages))
  const ui={
    conversation:{snapshot:app.conversation.snapshot,
      loadConversations:uiCall(app.conversation.loadConversations),
      openConversation:(...args)=>capturedOperation(app.conversation.openConversation,args,{navigation:true}),
      selectTurn:(...args)=>capturedOperation(app.conversation.selectTurn,args,{navigation:true}),
      refreshSelected:()=>{
        const id=selectedTurn()
        return id ? refreshSelectedBound(id,viewEpoch) : Promise.resolve(fail('selection_not_ready'))
      },replaySubmit},
    policy:{snapshot:app.policy.snapshot,refresh:uiCall(app.policy.refresh),
      refreshContact:uiCall(app.policy.refreshContact),
      updateMemory:uiCall(app.policy.updateMemory),updateContact:uiCall(app.policy.updateContact),
      blockTopic:uiCall(app.policy.blockTopic),unblockTopic:uiCall(app.policy.unblockTopic)},
    memory:{snapshot:app.memory.snapshot,refresh:uiCall(app.memory.refresh),
      loadMore:uiCall(app.memory.loadMore),select:uiCall(app.memory.select),
      add:uiCall(app.memory.add),edit:uiCall(app.memory.edit),forget:uiCall(app.memory.forget),
      clear:uiCall(app.memory.clear),acknowledgeUnknown:uiCall(app.memory.acknowledgeUnknown)},
    inbox:{snapshot:app.inbox.snapshot,refresh:refreshInbox,loadMore:uiCall(app.inbox.loadMore),
      select:uiCall(app.inbox.select),markRead:uiCall(app.inbox.markRead),
      explainSelected:uiCall(app.inbox.explainSelected)},
    reminders:{snapshot:app.reminders.snapshot,refresh:uiCall(app.reminders.refresh),
      loadMore:uiCall(app.reminders.loadMore),select:uiCall(app.reminders.select),
      create:uiCall(app.reminders.create),update:uiCall(app.reminders.update),
      cancel:uiCall(app.reminders.cancel),replayPending:uiCall(app.reminders.replayPending)},
    result:{snapshot:app.result.snapshot,open:uiCall(app.result.open),
      loadMoreRows:uiCall(app.result.loadMoreRows),loadMoreIssues:uiCall(app.result.loadMoreIssues)},
    work:{snapshot:app.work.snapshot,
      startSelected:()=>runWork('work.startSelected',()=>app.work.startSelected()),
      stopSelected:stopWork,
      runLocalOnceSelected:()=>runWork('work.runLocalOnceSelected',()=>app.work.runLocalOnceSelected()),
      reconcileSelected:reconcileWork},
  }
  const resources=createResourceAPI({host,operation:uiOperation,run:runById,stop:stopById,
    execution:()=>structuredClone(turn.snapshot()),send,cancelSend})
  const views=new Set()
  function createView(){
    if(closing)throw Error('disposed')
    const local=createProductApplication({host,runner:{
      run:input=>runById(input),runLocalOnce:input=>runById({...input,kind:'local'}),
      stop:()=>stopById({turnId:turn.snapshot().turnId,runId:turn.snapshot().runId}),
      reconcile:()=>runById({turnId:turn.snapshot().turnId,runId:turn.snapshot().runId,kind:'reconcile'}),
      snapshot:()=>turn.snapshot(),subscribe:turn.subscribe,
    }})
    views.add(local)
    const wrap=object=>Object.fromEntries(Object.entries(object).map(([key,value])=>[key,
      typeof value==='function' && !['snapshot','subscribe','dispose'].includes(key)
        ? (...args)=>{let captured;try{captured=structuredClone(args)}catch{return Promise.resolve(fail('invalid_request'))}
          return operation(()=>value(...captured))}
        : value&&typeof value==='object'?wrap(value):value]))
    return {...wrap(local),dispose(){views.delete(local);local.dispose()}}
  }
  return {initialize,open,refresh,snapshot,subscribe,dispose,whenIdle,diagnostics,
    send,cancelSend,ui,pulseContact,stopContact,reconcileContact,resources,createView}
}
