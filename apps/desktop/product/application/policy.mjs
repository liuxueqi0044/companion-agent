import {clone,createState,fail,launch,pick,request,validRevision,uncertainWrite} from './state.mjs'

const POLICY = ['revision','memory_enabled','memory_categories','proactive_enabled','timezone',
  'start_minute','end_minute','daily_limit','daily_evaluation_limit','topics','paused_until']
const MEMORY = ['memory_enabled','memory_categories']
const CONTACT = ['proactive_enabled','timezone','start_minute','end_minute','daily_limit',
  'daily_evaluation_limit','topics','paused_until']
const TOPICS = new Set(['work','daily','wellbeing'])
const shape = value => value && validRevision(value.revision) &&
  POLICY.every(key => Object.hasOwn(value,key)) ? pick(value,POLICY) : null
const patchValid = (patch, allowed) => patch && typeof patch === 'object' && !Array.isArray(patch) &&
  Object.keys(patch).length > 0 && Object.keys(patch).every(key => allowed.includes(key))

export function createPolicyController({host}) {
  if (!host || typeof host.request !== 'function') throw new TypeError('trusted_host_required')
  const state = createState({policy:null,blockedTopics:[],loading:false,busy:false,stale:true,
    unknown:false,error:null,operation:null})
  let readSeq = 0, writeSeq = 0, externalGen = 0, pending = null, needsRead = false
  const snapshot = state.snapshot, subscribe = state.subscribe
  function markStale() {
    if (state.disposed) return
    externalGen++
    readSeq++
    state.publish({stale:true,loading:false})
  }
  async function read(action) {
    if (state.disposed) return fail('disposed')
    if (pending?.flight) return fail('busy')
    const own = ++readSeq, ownWrite = writeSeq
    state.publish({loading:true,error:null})
    const reply = await request(host,action,{},()=>!state.disposed && own===readSeq && ownWrite===writeSeq)
    if (state.disposed || own !== readSeq || ownWrite !== writeSeq) return fail('stale_view')
    if (!reply.ok) { state.publish({loading:false,error:reply.error}); return reply }
    const policy = shape(action === 'policy.read' ? reply.result : reply.result?.policy)
    const blocked = action === 'contact.controls' ? reply.result?.blocked_topics : snapshot().blockedTopics
    if (!policy || !Array.isArray(blocked) || blocked.some(topic => !TOPICS.has(topic))) {
      state.publish({loading:false,error:'protocol_error'}); return fail('protocol_error')
    }
    // A read issued before a write can never turn a newly written policy backwards.
    needsRead = false
    state.publish({policy,blockedTopics:clone(blocked),stale:false,loading:false,error:null})
    return {ok:true,result:snapshot()}
  }
  const refresh = () => read('policy.read')
  const refreshContact = () => read('contact.controls')
  function write(action,payload,kind,settleResult) {
    if (state.disposed) return Promise.resolve(fail('disposed'))
    const payloadJSON = JSON.stringify(payload)
    if (pending?.flight || snapshot().busy) return pending?.flight && pending.kind === kind && pending.payloadJSON === payloadJSON
      ? pending.flight : Promise.resolve(fail('busy'))
    if (needsRead) return Promise.resolve(fail('reconciliation_required'))
    const record = {id:++writeSeq,kind,payloadJSON,externalGen,flight:null}
    pending = record
    readSeq++
    return launch(record,{state,current:()=>pending,busy:{busy:true,operation:{id:record.id,kind},
      loading:false,error:null},send:()=>request(host,action,payload),settle:async reply => {
      pending = null
      readSeq++
      if (!reply.ok) {
        const uncertain = uncertainWrite(reply.error)
        if (uncertain) needsRead = true
        state.publish({busy:false,stale:uncertain || snapshot().stale,unknown:uncertain,
          operation:null,error:reply.error})
        if (reply.error === 'revision_conflict') await read('policy.read')
        return reply
      }
      const updated = settleResult(reply.result)
      if (!updated) {
        needsRead = true
        state.publish({busy:false,unknown:true,stale:true,operation:null,error:'protocol_error'})
        return fail('protocol_error')
      }
      state.publish({busy:false,policy:updated.policy,blockedTopics:updated.blockedTopics,
        unknown:false,stale:record.externalGen !== externalGen,operation:null,error:null})
      return {ok:true,result:snapshot()}
    }})
  }
  function update(allowed,kind,{expectedRevision,patch} = {}) {
    if (state.disposed) return Promise.resolve(fail('disposed'))
    if (!patchValid(patch,allowed) || !validRevision(expectedRevision)) return Promise.resolve(fail('invalid_request'))
    const current = snapshot()
    if (!current.policy || current.stale || needsRead) return Promise.resolve(fail('policy_stale'))
    if (current.policy.revision !== expectedRevision) return Promise.resolve(fail('revision_conflict'))
    const next = {...current.policy,...clone(patch)}
    return write('policy.replace',{expected_revision:expectedRevision,policy:next},kind,result => {
      const policy = shape(result)
      return policy && policy.revision === expectedRevision + 1 &&
        POLICY.filter(key => key !== 'revision').every(key =>
          key === 'paused_until' && policy[key] !== null && next[key] !== null
            ? Date.parse(policy[key]) === Date.parse(next[key])
            : JSON.stringify(policy[key]) === JSON.stringify(next[key]))
        ? {policy,blockedTopics:current.blockedTopics} : null
    })
  }
  const updateMemory = input => update(MEMORY,'memory.update',input)
  const updateContact = input => update(CONTACT,'contact.update',input)
  function topic(action,kind,{topic} = {}) {
    if (!TOPICS.has(topic)) return Promise.resolve(fail('invalid_request'))
    const current = snapshot()
    return write(action,{topic},kind,result => {
      const policy = shape(result?.policy)
      const blocked = result?.blocked_topics
      return policy && policy.revision >= (current.policy?.revision ?? 0) &&
        Array.isArray(blocked) && blocked.every(value => TOPICS.has(value)) &&
        (action === 'contact.block-topic' ? blocked.includes(topic) : !blocked.includes(topic))
        ? {policy,blockedTopics:clone(blocked)} : null
    })
  }
  const blockTopic = input => topic('contact.block-topic','contact.block',input)
  const unblockTopic = input => topic('contact.unblock-topic','contact.unblock',input)
  function dispose() { readSeq++; writeSeq++; pending = null; state.dispose() }
  return {snapshot,subscribe,refresh,refreshContact,updateMemory,updateContact,
    blockTopic,unblockTopic,markStale,dispose}
}
