/* space-client/1: classic script, deliberately independent of author code. */
(function (window) {
  'use strict'
  const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
  const HASH = /^[a-f0-9]{64}$/
  const MAX_MESSAGE = 8192
  const encoder = new TextEncoder()
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  const fields = (value, names) => object(value) && Object.keys(value).sort().join('|') === [...names].sort().join('|')
  const bytes = value => { try { return encoder.encode(JSON.stringify(value)).length }
    catch { return Infinity } }
  const copy = value => JSON.parse(JSON.stringify(value))
  const error = code => Object.assign(new Error(code), { code })
  const goodId = value => typeof value === 'string' && ID.test(value)
  const bindingFields = ['type', 'channel_id', 'revision_id', 'request_id', 'artifact_hash', 'base_revision']
  const projectionFields = ['draft', 'tasks', 'active_revision']

  function validProjection(value, revision) {
    if (!fields(value, projectionFields) || typeof value.draft !== 'string'
      || encoder.encode(value.draft).length > 8192 || value.active_revision !== revision
      || !Array.isArray(value.tasks) || value.tasks.length > 8) return false
    return value.tasks.every(task => fields(task, ['id', 'bound_revision', 'status'])
      && goodId(task.id) && (task.bound_revision === null || goodId(task.bound_revision))
      && ['unavailable', 'idle', 'running'].includes(task.status))
  }
  function validInit(data, ports) {
    return fields(data, bindingFields) && data.type === 'personal-space-init'
      && goodId(data.channel_id) && goodId(data.revision_id) && goodId(data.request_id)
      && typeof data.artifact_hash === 'string' && HASH.test(data.artifact_hash)
      && (data.base_revision === null || goodId(data.base_revision))
      && Array.isArray(ports) && ports.length === 1 && !!ports[0]
      && typeof ports[0].postMessage === 'function' && bytes(data) <= MAX_MESSAGE
  }
  function createClient() {
    let phase = 'waiting_init', binding = null, port = null, cache = null
    let readyResolve, readyReject, readyTimer, pendingWrite = null, pendingRead = null
    let writeFrozen = false, readFrozen = false, sentCount = 0, windowStart = Date.now()
    const listeners = new Set()
    const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject })
    // A page may have no host; an unused connection must not produce an unhandled rejection.
    ready.catch(() => {})
    function failPending(code) {
      if (pendingWrite) { clearTimeout(pendingWrite.timer); pendingWrite.reject(error(code)); pendingWrite = null }
      if (pendingRead) { clearTimeout(pendingRead.timer); pendingRead.reject(error(code)); pendingRead = null }
    }
    function close(code) {
      if (phase === 'closed') return
      clearTimeout(readyTimer)
      failPending(code)
      if (phase !== 'active') readyReject(error(code))
      phase = 'closed'
      if (port) { port.onmessage = null; port.onmessageerror = null; port.close() }
      window.removeEventListener('message', onInit)
      listeners.clear()
    }
    function send(method, payload) {
      if (!binding || !port || phase === 'closed') throw error('unavailable')
      const message = { channel_id:binding.channel_id, revision_id:binding.revision_id,
        request_id:binding.request_id, method, payload }
      if (bytes(message) > MAX_MESSAGE) throw error('message_too_large')
      const now = Date.now()
      if (now - windowStart > 60000) { windowStart = now; sentCount = 0 }
      if (sentCount >= 30) throw error('rate_limited')
      sentCount++
      try { port.postMessage(message) } catch { close('port_closed'); throw error('port_closed') }
    }
    function matching(value) {
      return object(value) && binding && value.channel_id === binding.channel_id
        && value.revision_id === binding.revision_id && value.request_id === binding.request_id
        && bytes(value) <= MAX_MESSAGE
    }
    function publish(state) {
      if (!validProjection(state, binding.revision_id)) return
      cache = copy(state)
      if (phase === 'waiting_active') {
        clearTimeout(readyTimer)
        phase = 'active'
        readyResolve(copy(cache))
      }
      for (const callback of listeners) callback(copy(cache))
    }
    function onPort(event) {
      const value = event.data
      if (!matching(value) || typeof value.method !== 'string') return
      if (fields(value, ['method', 'channel_id', 'revision_id', 'request_id', 'payload'])
        && value.method === 'host_state_changed') { publish(value.payload); return }
      if (!fields(value, ['method', 'ok', 'channel_id', 'revision_id', 'request_id', 'data'])
        || typeof value.ok !== 'boolean') return
      if (value.method === 'read_demo_state' && pendingRead) {
        const pending = pendingRead; pendingRead = null; clearTimeout(pending.timer)
        if (value.ok && validProjection(value.data, binding.revision_id)) {
          publish(value.data); pending.resolve(copy(cache))
        } else { readFrozen = true; pending.reject(error('invalid_read_receipt')) }
      }
      if (value.method === 'write_demo_draft' && pendingWrite) {
        const pending = pendingWrite; pendingWrite = null; clearTimeout(pending.timer)
        if (value.ok === true && fields(value.data, ['saved']) && value.data.saved === true)
          pending.resolve({ saved:true, revision_id:binding.revision_id })
        else { writeFrozen = true; pending.reject(error('save_rejected')) }
      }
    }
    function onInit(event) {
      if (phase !== 'waiting_init' || event.source !== window.parent || !validInit(event.data, event.ports)) return
      binding = copy(event.data)
      port = event.ports[0]
      port.onmessage = onPort
      port.onmessageerror = () => close('port_closed')
      phase = 'waiting_active'
      try { send('ready', { artifact_hash:binding.artifact_hash, base_revision:binding.base_revision }) }
      catch (cause) { close(cause.code || 'port_closed') }
    }
    window.addEventListener('message', onInit)
    function connect(options = {}) {
      if (!fields(options, []) && !fields(options, ['timeoutMs'])) return Promise.reject(error('invalid_options'))
      const timeoutMs = options.timeoutMs ?? 3000
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000)
        return Promise.reject(error('invalid_timeout'))
      if (phase === 'closed') return Promise.reject(error('closed'))
      if (!readyTimer && phase !== 'active') readyTimer = setTimeout(() => close('connect_timeout'), timeoutMs)
      return ready
    }
    function refresh(timeoutMs = 3000) {
      if (phase !== 'active') return Promise.reject(error('unavailable'))
      if (readFrozen) return Promise.reject(error('read_uncertain_reconnect_required'))
      if (pendingRead) return Promise.reject(error('busy'))
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000)
        return Promise.reject(error('invalid_timeout'))
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pendingRead = null; readFrozen = true; reject(error('read_timeout')) }, timeoutMs)
        pendingRead = { resolve, reject, timer }
        try { send('read_demo_state', {}) } catch (cause) {
          clearTimeout(timer); pendingRead = null; reject(cause)
        }
      })
    }
    function saveDraft(draft, timeoutMs = 3000) {
      if (phase !== 'active') return Promise.reject(error('unavailable'))
      if (writeFrozen) return Promise.reject(error('write_uncertain_reconnect_required'))
      if (pendingWrite) return Promise.reject(error('busy'))
      if (typeof draft !== 'string' || encoder.encode(draft).length > 8192)
        return Promise.reject(error('invalid_draft'))
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000)
        return Promise.reject(error('invalid_timeout'))
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingWrite = null; writeFrozen = true; reject(error('save_timeout'))
        }, timeoutMs)
        pendingWrite = { resolve, reject, timer }
        try { send('write_demo_draft', { draft }) } catch (cause) {
          clearTimeout(timer); pendingWrite = null; reject(cause)
        }
      })
    }
    return Object.freeze({ connect, whenReady:connect, snapshot:() => cache ? copy(cache) : null,
      subscribe(callback) { if (typeof callback !== 'function') throw error('invalid_listener')
        listeners.add(callback); if (cache) callback(copy(cache)); return () => listeners.delete(callback) },
      refresh, saveDraft, dispose:() => close('closed'),
      reconnect() { close('reconnected'); window.PersonalSpace = createClient(); return window.PersonalSpace },
      status:() => phase,
      binding:() => binding ? copy(binding) : null })
  }
  window.PersonalSpace = createClient()
})(window)
