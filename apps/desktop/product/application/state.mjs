/** Small trusted-side state primitives. No transport is started by construction. */
export const clone = value => structuredClone(value)
export const pick = (source, keys) => Object.fromEntries(keys.filter(key =>
  source && Object.hasOwn(source, key)).map(key => [key, clone(source[key])]))
export const safeCode = value => typeof value === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(value)
  ? value : 'transport_unavailable'
export const fail = error => ({ok:false,error})
export const validId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
export const validRevision = value => Number.isSafeInteger(value) && value > 0
export const validCursor = value => Number.isSafeInteger(value) && value > 0

export function createState(initial) {
  let current = clone(initial), disposed = false
  const listeners = new Set()
  const snapshot = () => clone(current)
  function publish(patch) {
    if (disposed) return
    current = {...current,...clone(patch)}
    for (const listener of [...listeners]) if (!disposed && listeners.has(listener)) {
      try { listener(snapshot()) } catch { /* Presentation cannot strand a request. */ }
    }
  }
  function subscribe(listener) {
    if (disposed || typeof listener !== 'function') throw new TypeError('invalid_listener')
    listeners.add(listener)
    try { listener(snapshot()) } catch { /* Other listeners and transport remain live. */ }
    return () => listeners.delete(listener)
  }
  function dispose() { disposed = true; listeners.clear() }
  return {snapshot,publish,subscribe,dispose,get disposed() { return disposed }}
}

// A transport/backend error is not proof that a write was rejected before commit.
const rejectedWrites = new Set(['invalid_request','invalid_capability','missing_material',
  'not_found','revision_conflict','idempotency_conflict','invalid_transition',
  'invalid_reminder_time','request_too_large','unsupported_action','unsupported_version','disposed'])
export const uncertainWrite = code => !rejectedWrites.has(code)

export async function request(host, action, payload = {}, canSend = () => true) {
  try {
    if (!canSend()) return fail('stale_view')
    const reply = await host.request(action, clone(payload))
    if (reply?.ok !== true) return fail(safeCode(reply?.error?.code))
    return {ok:true,result:reply.result}
  } catch { return fail('transport_unavailable') }
}

/** Install the unique flight before notifying synchronous subscribers. */
export function launch(record, {state, current, busy, send, settle}) {
  if (record.flight) return record.flight
  let receive
  const response = new Promise(resolve => { receive = resolve })
  let flight
  flight = response.then(reply => {
    if (state.disposed) return fail('disposed')
    if (current() !== record) return fail('stale_view')
    return settle(reply)
  }).catch(() => fail('internal_error')).finally(() => {
    if (record.flight === flight) record.flight = null
  })
  record.flight = flight
  state.publish(busy)
  Promise.resolve().then(() => {
    if (state.disposed) return fail('disposed')
    if (current() !== record) return fail('stale_view')
    return send()
  }).then(receive, () => receive(fail('transport_unavailable')))
  return flight
}

export function pageLimit(value, fallback = 50) {
  return value === undefined ? fallback : Number.isSafeInteger(value) && value >= 1 && value <= 50 ? value : null
}

export function boundedMerge(oldItems, newItems, idKey = 'id', limit = 200) {
  const seen = new Set(oldItems.map(item => item[idKey]))
  const result = [...oldItems]
  for (const item of newItems) if (!seen.has(item[idKey])) { seen.add(item[idKey]); result.push(item) }
  return {items:result.slice(0,limit),truncated:result.length > limit}
}
