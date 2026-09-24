import {safeCode,validId} from './state.mjs'

const STATES = new Set(['queued','generating','responded','model_failed','actions_ready',
  'actions_recorded','outcome_unknown','cancelled'])
const TASK_STATES = new Set(['queued','running','cancelling','completed','failed','cancelled','interrupted'])
const ACTION_STATES = new Set(['ready','accepted','failed','blocked','outcome_unknown'])
const EVENT_KINDS = new Set(['submitted','started','cancel_requested','cancelled',
  'completed','failed','interrupted','retried'])
const taskView = raw => raw && validId(raw.task_id) && validId(raw.current_attempt_id) &&
  TASK_STATES.has(raw.status) ? {
    taskId:raw.task_id,currentAttemptId:raw.current_attempt_id,taskStatus:raw.status,
    attemptCount:Number.isSafeInteger(raw.attempt_count) ? raw.attempt_count : null,
    requirementsInterpretation:raw.requirements_interpretation === 'not_run' ? 'not_run' : null,
    taskError:typeof raw.error_code === 'string' ? safeCode(raw.error_code) : null,
  } : null

/** Derive only from a confirmed session turn and stop receipt, never reply text. */
export function projectActivity({turn,stop} = {}) {
  if (!turn || !validId(turn.id) || !STATES.has(turn.state)) return null
  let protocolError = false, hasMoreEvents = false, truncatedEvents = false
  const actions = []
  for (const raw of Array.isArray(turn.actions) ? turn.actions : []) {
    if (!validId(raw?.id) || !ACTION_STATES.has(raw?.state)) { protocolError = true; continue }
    const task = raw.kind === 'csv.audit' && raw.task ? taskView(raw.task) : null
    if (raw.task && !task) protocolError = true
    let events = []
    if (task && raw.events) {
      const page = raw.events
      if (page.task_id !== task.taskId || !Array.isArray(page.items)) protocolError = true
      else {
        if (page.next_after_seq !== null &&
          (!Number.isSafeInteger(page.next_after_seq) || page.next_after_seq <= 0)) protocolError = true
        hasMoreEvents ||= Number.isSafeInteger(page.next_after_seq) && page.next_after_seq > 0
        const seen = new Set()
        for (const item of page.items) {
          if (item?.task_id !== task.taskId || !validId(item.attempt_id) ||
            !Number.isSafeInteger(item.seq) || item.seq <= 0 || !EVENT_KINDS.has(item.kind) ||
            !TASK_STATES.has(item.status)) { protocolError = true; continue }
          const key = `${task.taskId}:${item.attempt_id}:${item.seq}`
          if (seen.has(key)) continue
          seen.add(key)
          events.push({taskId:task.taskId,attemptId:item.attempt_id,seq:item.seq,
            kind:item.kind,status:item.status,
            occurredAt:typeof item.occurred_at === 'string' ? item.occurred_at : null,
            historical:item.attempt_id !== task.currentAttemptId})
        }
        events.sort((a,b) => a.seq-b.seq)
        if (events.length > 100) {events=events.slice(0,100);truncatedEvents=true}
      }
    }
    actions.push({id:raw.id,kind:raw.kind === 'csv.audit' ? 'csv.audit' :
      raw.kind === 'profile.change' ? 'profile.change' : 'unknown',state:raw.state,
    error:typeof raw.error === 'string' ? safeCode(raw.error) : null,...task,events})
  }
  const primary=actions.find(item => item.kind === 'csv.audit' && item.taskId)
  const stopped=stop && typeof stop === 'object' ? stop : null
  const stoppedTask=Array.isArray(stopped?.tasks) ? stopped.tasks.find(item => item.task_id === primary?.taskId) : null
  const needsReconciliation=turn.state === 'outcome_unknown' ||
    actions.some(item => item.state === 'outcome_unknown') || stoppedTask?.needs_reconciliation === true
  const cancelRequested=stopped?.permission_revoked === true || stoppedTask?.cancel_requested === true ||
    primary?.taskStatus === 'cancelling' || primary?.events?.some(item =>
      !item.historical && item.kind === 'cancel_requested') === true
  let displayState = turn.state
  if (protocolError) displayState='protocol_error'
  else if (needsReconciliation) displayState='outcome_unknown'
  else if (actions.some(item=>item.state==='failed')) displayState='failed'
  else if (actions.some(item=>item.state==='blocked')) displayState='blocked'
  else if (actions.some(item=>item.state==='ready') && primary?.taskStatus==='completed') displayState='submitted'
  else if (primary?.taskStatus) displayState=primary.taskStatus
  else if (turn.state === 'actions_ready' || turn.state === 'actions_recorded') displayState='submitted'
  return {
    turnId:turn.id,turnState:turn.state,providerSummary:typeof turn.provider_summary === 'string'
      ? turn.provider_summary : null,actions,
    taskId:primary?.taskId ?? null,currentAttemptId:primary?.currentAttemptId ?? null,
    taskStatus:primary?.taskStatus ?? null,events:primary?.events ?? [],
    needsReconciliation,cancelRequested,workerExited:typeof stopped?.worker_exited === 'boolean'
      ? stopped.worker_exited : null,progress:null,displayState,protocolError,hasMoreEvents,truncatedEvents,
  }
}
