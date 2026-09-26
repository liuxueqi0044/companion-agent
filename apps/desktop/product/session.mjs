/** Headless trusted-host control layer. Never expose this object to generated HTML. */
import { randomUUID } from 'node:crypto'

const safeCode = code => typeof code === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(code)
  ? code : 'transport_unavailable'
const clone = value => structuredClone(value)
const pick = (source, keys) => Object.fromEntries(keys.filter(key => Object.hasOwn(source ?? {}, key))
  .map(key => [key, clone(source[key])]))
const turnView = item => item && ({...pick(item, [
  'id','conversation_id','text','reply','state','error','provider_summary','completion_source','temporary','workflow']),
  actions: Array.isArray(item.actions) ? item.actions.map(action => pick(action,
    ['id','kind','state','error','task','events','result','artifact','reminder','tool','row_count'])) : []})
const conversationView = item => pick(item,
  ['conversation_id','latest_turn_id','cursor','last_active_at','text_preview','reply_preview'])
const summaryView = item => pick(item,
  ['id','conversation_id','cursor','text_preview','reply_preview','state','temporary','has_actions','created_at'])
const stopView = result => ({permission_revoked: result?.permission_revoked === true,
  worker_exited: result?.worker_exited ?? null,
  tasks: Array.isArray(result?.tasks) ? result.tasks.map(task => pick(task,
    ['task_id','task_status','cancel_requested','needs_reconciliation'])) : []})
const definiteSubmitErrors = new Set(['invalid_request','invalid_capability','missing_material',
  'idempotency_conflict','unsupported_action','unsupported_version'])

export function createProductSession({host, intent = () => []}) {
  if (!host || typeof host.request !== 'function' || typeof intent !== 'function')
    throw new TypeError('trusted_host_required')
  const listeners = new Set()
  const stopCommands = new Map()
  let disposed = false
  let generation = 0
  let readGeneration = 0
  let stopGeneration = 0
  let listGeneration = 0
  let pendingSubmit = null
  let state = {
    conversations: [], conversationSnapshot: null, conversationNextBefore: null,
    selectedConversationId: null, turns: [], turnsSnapshot: null, turnsNextBefore: null,
    selectedTurnId: null, turn: null, loading: false, refreshing: false, stopping: false,
    error: null, submitting: false, submitUnknown: false, stop: null,
  }
  function publish(patch) {
    if (disposed) return
    state = {...state, ...patch}
    for (const listener of [...listeners]) {
      if (!disposed && listeners.has(listener)) notify(listener)
    }
  }
  function snapshot() { return clone(state) }
  function notify(listener) {
    // Presentation observers cannot strand a submission or interrupt other
    // observers. In particular, an installed flight must always be settled.
    try { listener(snapshot()) } catch { /* Keep operation ownership in the session. */ }
  }
  function subscribe(listener) {
    if (typeof listener !== 'function' || disposed) throw new TypeError('invalid_listener')
    listeners.add(listener)
    notify(listener)
    return () => listeners.delete(listener)
  }
  async function request(action, payload) {
    try {
      const reply = await host.request(action, payload)
      if (!reply?.ok) return {ok:false, error:safeCode(reply?.error?.code)}
      return {ok:true, result:reply.result}
    } catch { return {ok:false, error:'transport_unavailable'} }
  }
  async function loadConversations(options = {}) {
    if (disposed) return {ok:false,error:'disposed'}
    const own = ++listGeneration
    const reply = await request('conversation.list', options)
    if (disposed || own !== listGeneration) return {ok:false,error:'stale_view'}
    if (!reply.ok) { publish({error:reply.error}); return reply }
    publish({conversations:reply.result.items.map(conversationView),
      conversationSnapshot:reply.result.snapshot, conversationNextBefore:reply.result.next_before,
      error:null})
    return {ok:true, result:snapshot().conversations}
  }
  async function openConversation(conversationId, options = {}) {
    if (disposed) return {ok:false,error:'disposed'}
    const own = ++generation
    readGeneration++
    stopGeneration++
    publish({selectedConversationId:conversationId, selectedTurnId:null, turn:null, turns:[],
      turnsSnapshot:null, turnsNextBefore:null, loading:true, refreshing:false, stopping:false,
      error:null, stop:null})
    const reply = await request('conversation.turns', {...options, conversation_id:conversationId})
    if (disposed || own !== generation) return {ok:false,error:'stale_view'}
    if (!reply.ok) { publish({loading:false,error:reply.error}); return reply }
    publish({turns:reply.result.items.map(summaryView), turnsSnapshot:reply.result.snapshot,
      turnsNextBefore:reply.result.next_before, loading:false})
    return {ok:true,result:snapshot().turns}
  }
  async function selectTurn(turnId) {
    if (disposed) return {ok:false,error:'disposed'}
    const own = ++generation
    readGeneration++
    stopGeneration++
    publish({selectedTurnId:turnId, turn:null, loading:true, refreshing:false,stopping:false,
      error:null,stop:null})
    const reply = await request('turn.read', {turn_id:turnId})
    if (disposed || own !== generation) return {ok:false,error:'stale_view'}
    if (!reply.ok) { publish({loading:false,error:reply.error}); return reply }
    if (reply.result?.id !== turnId) { publish({loading:false,error:'protocol_error'}); return {ok:false,error:'protocol_error'} }
    publish({turn:turnView(reply.result), selectedConversationId:reply.result.conversation_id,
      loading:false,error:null})
    return {ok:true,result:snapshot().turn}
  }
  async function refreshSelected() {
    if (disposed) return {ok:false,error:'disposed'}
    if (state.stopping) return {ok:false,error:'stop_in_progress'}
    if (!state.turn || state.loading) return {ok:false,error:'selection_not_ready'}
    const own = generation, turnId = state.turn.id, ownRead = ++readGeneration
    publish({refreshing:true,error:null})
    const reply = await request('turn.read', {turn_id:turnId})
    if (disposed || own !== generation || ownRead !== readGeneration ||
      state.selectedTurnId !== turnId || state.stopping) return {ok:false,error:'stale_view'}
    if (!reply.ok) { publish({refreshing:false,error:reply.error}); return reply }
    if (reply.result?.id !== turnId) { publish({refreshing:false,error:'protocol_error'}); return {ok:false,error:'protocol_error'} }
    publish({turn:turnView(reply.result), refreshing:false,error:null})
    return {ok:true,result:snapshot().turn}
  }
  async function submitTurn(input) {
    if (disposed) return {ok:false,error:'disposed'}
    if (pendingSubmit) return {ok:false,error:'submit_pending_reconciliation'}
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !['command_id','conversation_id','text','csv_text','temporary'].includes(key)))
      return {ok:false,error:'invalid_request'}
    const turn = {command_id:input.command_id ?? randomUUID(),
      conversation_id:input.conversation_id ?? state.selectedConversationId ?? randomUUID(),
      text:input.text, ...(input.csv_text === undefined ? {} : {csv_text:input.csv_text}),
      temporary:input.temporary ?? false}
    let capabilities
    try {
      capabilities = intent(clone(turn))
      if (!Array.isArray(capabilities) || capabilities.some(item => !['csv.audit','profile.change','artifact.create','reminder.create','tool.save','tool.run','data.query','task.loop'].includes(item)))
        return {ok:false,error:'invalid_capability'}
    } catch { return {ok:false,error:'invalid_capability'} }
    try {
      pendingSubmit = {identity:Symbol('submit'),
        payload:clone({turn,capabilities:[...new Set(capabilities)]}),flight:null}
    } catch { return {ok:false,error:'invalid_request'} }
    return replaySubmit()
  }
  function replaySubmit() {
    if (disposed) return Promise.resolve({ok:false,error:'disposed'})
    const record = pendingSubmit
    if (!record) return Promise.resolve({ok:false,error:'nothing_to_replay'})
    if (record.flight) return record.flight // One transport call owns this attempt.
    // Install ownership before notifying synchronous subscribers or invoking
    // transport: either can reenter replaySubmit on this same stack.
    let receive
    const response = new Promise(resolve => { receive = resolve })
    let flight
    flight = response.then(reply => {
      if (disposed) return {ok:false,error:'disposed'}
      if (pendingSubmit !== record) return {ok:false,error:'stale_submit'}
      if (reply.ok) {
        if (reply.result?.id !== record.payload.turn.command_id ||
            reply.result?.conversation_id !== record.payload.turn.conversation_id) {
          publish({submitting:false,submitUnknown:true,error:'outcome_unknown'})
          return {ok:false,error:'outcome_unknown'}
        }
        pendingSubmit = null
        publish({submitting:false,submitUnknown:false,error:null})
        return {ok:true,result:turnView(reply.result)}
      }
      if (definiteSubmitErrors.has(reply.error)) {
        pendingSubmit = null
        publish({submitting:false,submitUnknown:false,error:reply.error})
      } else {
        publish({submitting:false,submitUnknown:true,error:reply.error})
      }
      return reply
    }).finally(() => { if (record.flight === flight) record.flight = null })
    record.flight = flight
    publish({submitting:true,error:null})
    receive(disposed || pendingSubmit !== record
      ? {ok:false,error:disposed ? 'disposed' : 'stale_submit'}
      : request('turn.submit', clone(record.payload)))
    return flight
  }
  async function stopSelected() {
    if (disposed) return {ok:false,error:'disposed'}
    if (!state.turn || state.loading) return {ok:false,error:'selection_not_ready'}
    const turnId = state.turn.id
    const commandId = stopCommands.get(turnId) ?? randomUUID()
    stopCommands.set(turnId, commandId)
    const own = generation, ownStop = ++stopGeneration
    readGeneration++ // A pre-stop read cannot overwrite the later task receipt.
    publish({stopping:true,refreshing:false,error:null,stop:null})
    const reply = await request('turn.stop', {turn_id:turnId,command_id:commandId})
    if (disposed) return {ok:false,error:'disposed'}
    if (own === generation && ownStop === stopGeneration && state.turn?.id === turnId) {
      publish({stopping:false,stop:reply.ok ? stopView(reply.result) : {error:reply.error},
        error:reply.ok ? null : reply.error})
      if (reply.ok) await refreshSelected()
    }
    return reply.ok ? {ok:true,result:stopView(reply.result)} : reply
  }
  function dispose() {
    if (disposed) return
    disposed = true
    generation++
    readGeneration++
    stopGeneration++
    listGeneration++
    state = {...state,loading:false,refreshing:false,stopping:false,submitting:false}
    listeners.clear()
    pendingSubmit = null
  }
  return {snapshot,subscribe,loadConversations,openConversation,selectTurn,
    refreshSelected,submitTurn,replaySubmit,stopSelected,dispose}
}
