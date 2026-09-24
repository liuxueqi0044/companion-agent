/** Trusted, headless application facade. Keep host/request in the outer owner. */
import {createProductSession} from '../session.mjs'
import {createState,fail,pick,request,validRevision,safeCode} from './state.mjs'
import {createPolicyController} from './policy.mjs'
import {createMemoryController} from './memory.mjs'
import {createInboxController} from './inbox.mjs'
import {createReminderController} from './reminders.mjs'
import {createResultController} from './results.mjs'
import {projectActivity} from './activity.mjs'

const PANELS=new Set(['home','conversation','memory','contact','inbox','reminders'])
// Keep the legacy session private: its trusted snapshots contain raw tool receipts.
function turnView(raw) {
  if (!raw) return null
  return {...pick(raw,['id','conversation_id','text','state','reply','provider_summary',
    'completion_source','temporary']),error:raw.error ? safeCode(raw.error) : null,
    actions:(raw.actions ?? []).map(action=>({
      ...pick(action,['id','kind','state']),error:action.error ? safeCode(action.error) : null,
      ...(action.task ? {task:{...pick(action.task,['task_id','status','created_at','updated_at',
        'last_seq','current_attempt_id','attempt_count','executor','tool_version','requirements_interpretation']),
        error_code:action.task.error_code ? safeCode(action.task.error_code) : null}} : {}),
      ...(action.events ? {events:{...pick(action.events,['task_id','next_after_seq','last_seq']),
        items:(action.events.items ?? []).map(event=>pick(event,
          ['task_id','attempt_id','seq','kind','status','occurred_at']))}} : {}),
    }))}
}
function conversationView(raw) {
  return {...pick(raw,['conversations','conversationSnapshot','conversationNextBefore',
    'selectedConversationId','turns','turnsSnapshot','turnsNextBefore','selectedTurnId',
    'loading','refreshing','stopping','submitting','submitUnknown','error','stop']),turn:turnView(raw.turn)}
}
function homeView(raw) {
  if (!raw || !raw.profile || typeof raw.profile.profile_id!=='string' ||
    !validRevision(raw.profile.revision) || !raw.policy || !validRevision(raw.policy.revision) ||
    !Number.isSafeInteger(raw.unread_count) || raw.unread_count<0) return null
  return {profile:{...pick(raw.profile,['profile_id','revision']),
    preferences:pick(raw.profile.preferences,['ai_name','address_user_as'])},
    policy:pick(raw.policy,['revision','memory_enabled','proactive_enabled']),
    unreadCount:raw.unread_count,experienceRevision:raw.experience_revision,
    modelStatus:raw.model_status,runtime:raw.runtime,nativeIsolation:raw.native_isolation}
}

export function createProductApplication({host,intent,runner}={}) {
  if (!host || typeof host.request!=='function') throw new TypeError('trusted_host_required')
  if (runner && ['run','stop','runLocalOnce','reconcile','snapshot','subscribe'].some(
    name=>typeof runner[name]!=='function')) throw new TypeError('trusted_runner_required')
  const state=createState({panel:'home',initialized:false,home:null,homeStale:false,
    loading:false,error:null})
  const session=createProductSession({host,...(intent ? {intent} : {})})
  const policy=createPolicyController({host})
  const memory=createMemoryController({host,policy})
  const inbox=createInboxController({host,onUnreadInvalidated:()=>{
    homeSeq++;state.publish({homeStale:true,loading:false})
  }})
  const reminders=createReminderController({host})
  const result=createResultController({host})
  let init=null,homeSeq=0,navSeq=0,turnBinding=null
  const unsub=[]
  const selectedWorkTurn=()=>{
    const shown=session.snapshot()
    return state.snapshot().panel==='conversation' && !shown.loading &&
      shown.turn && shown.selectedTurnId===shown.turn.id ? shown.turn.id : null
  }
  const workView=()=>{
    if(!runner)return {available:false,selected:false}
    const shown=runner.snapshot(),turnId=selectedWorkTurn()
    return turnId && shown.turnId===turnId ? {available:true,selected:true,...shown} :
      {available:true,selected:false}
  }
  const snapshot=()=>{
    const core=state.snapshot(),conversation=session.snapshot()
    const currentPolicy=policy.snapshot()
    const home=core.home && currentPolicy.policy ? {...core.home,
      policy:pick(currentPolicy.policy,['revision','memory_enabled','proactive_enabled']),
      policyStale:currentPolicy.stale} : core.home
    return {...core,home,conversation:core.panel==='conversation' ? conversationView(conversation) : null,
      activity:projectActivity({turn:conversation.turn,stop:conversation.stop}),
      policy:currentPolicy,memory:memory.snapshot(),inbox:inbox.snapshot(),
      reminders:reminders.snapshot(),result:result.snapshot(),work:workView()}
  }
  const subscribe=listener=>state.subscribe(()=>listener(snapshot()))
  function signal() {state.publish({})}
  unsub.push(session.subscribe(value=>{
    const action=value.turn?.actions?.find(item=>item.kind==='csv.audit' && item.task)
    const binding=value.loading || value.selectedTurnId!==value.turn?.id ? null :
      `${value.turn.id}:${action?.task?.task_id ?? ''}:${action?.task?.current_attempt_id ?? ''}`
    if (binding!==turnBinding) {turnBinding=binding;result.invalidate()}
    signal()
  }))
  for(const controller of [policy,memory,inbox,reminders,result])unsub.push(controller.subscribe(signal))
  if(runner)unsub.push(runner.subscribe(signal))

  async function refreshHome() {
    if (state.disposed) return fail('disposed')
    const own=++homeSeq
    state.publish({loading:true,error:null})
    const reply=await request(host,'home',{},()=>!state.disposed && own===homeSeq)
    if (state.disposed || own!==homeSeq) return fail('stale_view')
    if (!reply.ok) {state.publish({loading:false,error:reply.error});return reply}
    const home=homeView(reply.result)
    if (!home) {state.publish({loading:false,error:'protocol_error'});return fail('protocol_error')}
    state.publish({home,homeStale:false,loading:false,error:null})
    if (!state.disposed && policy.snapshot().policy?.revision!==home.policy.revision) {
      policy.markStale()
      await policy.refresh()
    }
    return {ok:true,result:home}
  }
  function initialize() {
    if (state.disposed) return Promise.resolve(fail('disposed'))
    if (init?.flight) return init.flight
    if (state.snapshot().initialized) return Promise.resolve({ok:true,result:snapshot()})
    const record={flight:null}
    init=record
    let receive
    const response=new Promise(resolve=>{receive=resolve})
    let flight
    flight=response.then(async reply=>{
      if (state.disposed) return fail('disposed')
      if (init!==record) return fail('stale_view')
      if (!reply.ok) {state.publish({loading:false,error:reply.error});return reply}
      const home=homeView(reply.result)
      if (!home) {state.publish({loading:false,error:'protocol_error'});return fail('protocol_error')}
      state.publish({home,initialized:true,homeStale:false,loading:false,error:null})
      const current=await policy.refresh()
      return current.ok ? {ok:true,result:snapshot()} : current
    }).finally(()=>{if(record.flight===flight)record.flight=null})
    record.flight=flight
    state.publish({loading:true,error:null})
    Promise.resolve().then(()=>state.disposed ? fail('disposed') : request(host,'bootstrap')).then(receive,
      ()=>receive(fail('transport_unavailable')))
    return flight
  }
  async function refresh() {
    if (state.disposed) return fail('disposed')
    const current=state.snapshot()
    if (!current.initialized) return fail('not_initialized')
    if (current.panel==='home') return refreshHome()
    if (current.panel==='conversation') {
      const selected=session.snapshot()
      return selected.turn ? conversation.refreshSelected() : session.loadConversations()
    }
    if (current.panel==='memory') return memory.refresh()
    if (current.panel==='contact') return policy.refreshContact()
    if (current.panel==='inbox') {
      const own=navSeq
      const shown=await inbox.refresh()
      if (shown.ok && !state.disposed && own===navSeq && state.snapshot().panel==='inbox') await refreshHome()
      return shown
    }
    return reminders.refresh()
  }
  async function open({panel,conversationId,turnId}={}) {
    if (state.disposed) return fail('disposed')
    if (!PANELS.has(panel)) return fail('invalid_request')
    if (!state.snapshot().initialized) return fail('not_initialized')
    const own=++navSeq,previous=state.snapshot().panel
    homeSeq++
    if(previous!==panel){
      if(previous==='memory')memory.deactivate()
      if(previous==='inbox')inbox.deactivate()
      if(previous==='reminders')reminders.deactivate()
      result.deactivate()
    }
    state.publish({panel,loading:false,error:null})
    if(state.disposed || own!==navSeq)return fail('stale_view')
    let reply
    if(panel==='conversation' && turnId) reply=await conversation.selectTurn(turnId)
    else if(panel==='conversation' && conversationId) reply=await session.openConversation(conversationId)
    else reply=await refresh()
    if(state.disposed || own!==navSeq)return fail('stale_view')
    return reply
  }
  async function markRead(input) {
    const reply=await inbox.markRead(input)
    if(reply.ok) await refreshHome()
    return reply
  }
  function dispose() {
    if(state.disposed)return
    homeSeq++;navSeq++;init=null
    state.dispose()
    for(const stop of unsub)stop()
    for(const controller of [session,policy,memory,inbox,reminders,result])controller.dispose()
  }
  const projectedFlights=new WeakMap()
  const turnCall=method=>(...args)=>{
    const flight=method(...args)
    if (!projectedFlights.has(flight)) projectedFlights.set(flight,flight.then(reply=>
      reply.ok ? {ok:true,result:turnView(reply.result)} : reply))
    return projectedFlights.get(flight)
  }
  const conversation={snapshot:()=>conversationView(session.snapshot()),loadConversations:session.loadConversations,
    openConversation:session.openConversation,selectTurn:turnCall(session.selectTurn),
    refreshSelected:turnCall(session.refreshSelected),submitTurn:turnCall(session.submitTurn),
    replaySubmit:turnCall(session.replaySubmit),stopSelected:session.stopSelected}
  const policyApi={snapshot:policy.snapshot,refresh:policy.refresh,
    refreshContact:policy.refreshContact,updateMemory:policy.updateMemory,
    updateContact:policy.updateContact,blockTopic:policy.blockTopic,unblockTopic:policy.unblockTopic}
  const memoryApi={snapshot:memory.snapshot,refresh:memory.refresh,loadMore:memory.loadMore,
    select:memory.select,add:memory.add,edit:memory.edit,forget:memory.forget,clear:memory.clear,
    acknowledgeUnknown:memory.acknowledgeUnknown}
  const inboxApi={snapshot:inbox.snapshot,refresh:inbox.refresh,loadMore:inbox.loadMore,
    select:inbox.select,markRead,explainSelected:inbox.explainSelected}
  const remindersApi={snapshot:reminders.snapshot,refresh:reminders.refresh,
    loadMore:reminders.loadMore,select:reminders.select,create:reminders.create,
    update:reminders.update,cancel:reminders.cancel,replayPending:reminders.replayPending}
  const resultApi={snapshot:result.snapshot,open:({taskId}={})=>{
    const selected=session.snapshot()
    if(selected.loading || !selected.turn || selected.selectedTurnId!==selected.turn.id)
      return Promise.resolve(fail('selection_not_ready'))
    return result.open({turn:selected.turn,taskId})
  },loadMoreRows:result.loadMoreRows,loadMoreIssues:result.loadMoreIssues}
  const work={snapshot:workView,
    startSelected:()=>{
      if(state.disposed)return Promise.resolve(fail('disposed'))
      if(!runner)return Promise.resolve(fail('model_not_configured'))
      const turnId=selectedWorkTurn()
      return turnId ? runner.run({turnId}) : Promise.resolve(fail('selection_not_ready'))
    },
    stopSelected:()=>{
      if(state.disposed)return Promise.resolve(fail('disposed'))
      if(!runner)return Promise.resolve(fail('model_not_configured'))
      const turnId=selectedWorkTurn()
      return turnId && runner.snapshot().turnId===turnId ? runner.stop() :
        Promise.resolve(fail('not_owned_turn'))
    },
    runLocalOnceSelected:()=>{
      if(state.disposed)return Promise.resolve(fail('disposed'))
      if(!runner)return Promise.resolve(fail('model_not_configured'))
      const turnId=selectedWorkTurn()
      return turnId ? runner.runLocalOnce({turnId}) : Promise.resolve(fail('selection_not_ready'))
    },
    reconcileSelected:()=>{
      if(state.disposed)return Promise.resolve(fail('disposed'))
      if(!runner)return Promise.resolve(fail('model_not_configured'))
      const turnId=selectedWorkTurn()
      return turnId && runner.snapshot().turnId===turnId ? runner.reconcile() :
        Promise.resolve(fail('not_owned_turn'))
    }}
  return {initialize,open,refresh,refreshHome,snapshot,subscribe,dispose,conversation,policy:policyApi,
    memory:memoryApi,inbox:inboxApi,reminders:remindersApi,result:resultApi,work}
}
