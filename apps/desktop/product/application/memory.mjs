import {clone,createState,fail,launch,pick,request,validCursor,validId,validRevision,
  boundedMerge,uncertainWrite} from './state.mjs'
import {randomUUID} from 'node:crypto'

const FIELDS = ['cursor','id','source_id','category','content','revision']
const itemView = item => item && validCursor(item.cursor) && validId(item.id) &&
  validRevision(item.revision) && typeof item.content === 'string' ? pick(item,FIELDS) : null
const uncertain = uncertainWrite

export function createMemoryController({host,policy}) {
  if (!host || typeof host.request !== 'function' || !policy?.markStale || !policy?.refresh)
    throw new TypeError('trusted_dependencies_required')
  const state = createState({active:true,items:[],nextBefore:null,selectedId:null,selected:null,
    loading:false,loadingMore:false,busy:false,unknown:null,error:null,truncated:false})
  let readSeq = 0, pageGen = 0, viewGen = 0, pending = null, moreFlight = null
  const snapshot = state.snapshot, subscribe = state.subscribe
  function ownPage(rows,before) {
    if (!Array.isArray(rows) || rows.length > 50) return null
    let previous = before ?? Number.MAX_SAFE_INTEGER
    const result = []
    for (const raw of rows) {
      const item = itemView(raw)
      if (!item || item.cursor >= previous) return null
      previous = item.cursor
      result.push(item)
    }
    return result
  }
  function activate() { if (!snapshot().active) { pageGen++; viewGen++; state.publish({active:true}) } }
  async function refresh() {
    if (state.disposed) return fail('disposed')
    activate()
    const own = ++readSeq, generation = ++pageGen
    state.publish({loading:true,loadingMore:false,error:null,nextBefore:null})
    const reply = await request(host,'memory.list',{limit:50},
      ()=>!state.disposed && own===readSeq && generation===pageGen && snapshot().active)
    if (state.disposed || own !== readSeq || generation !== pageGen || !snapshot().active) return fail('stale_view')
    if (!reply.ok) { state.publish({loading:false,error:reply.error}); return reply }
    const items = ownPage(reply.result,null)
    if (!items) { state.publish({loading:false,error:'protocol_error'}); return fail('protocol_error') }
    if (pending?.unknown) pending.verifiedRefresh = true
    const selected = items.find(item => item.id === snapshot().selectedId) ?? null
    state.publish({items,nextBefore:items.length === 50 ? items.at(-1).cursor : null,
      selectedId:selected?.id ?? null,selected,loading:false,truncated:false,error:null})
    return {ok:true,result:snapshot()}
  }
  function loadMore() {
    if (state.disposed) return Promise.resolve(fail('disposed'))
    const before = snapshot().nextBefore
    if (!snapshot().active || snapshot().loading || before === null) return Promise.resolve(fail('no_more_pages'))
    if (moreFlight && moreFlight.before === before && moreFlight.generation === pageGen) return moreFlight.flight
    const own = ++readSeq, generation = pageGen
    const flight = Promise.resolve().then(()=>request(host,'memory.list',{limit:50,before},
      ()=>!state.disposed && own===readSeq && generation===pageGen && snapshot().active)).then(reply => {
      if (state.disposed || own !== readSeq || generation !== pageGen || !snapshot().active) return fail('stale_view')
      if (!reply.ok) { state.publish({loadingMore:false,error:reply.error}); return reply }
      const page = ownPage(reply.result,before)
      if (!page) { state.publish({loadingMore:false,error:'protocol_error'}); return fail('protocol_error') }
      const merged = boundedMerge(snapshot().items,page)
      state.publish({items:merged.items,nextBefore:page.length === 50 && !merged.truncated ? page.at(-1).cursor : null,
        truncated:merged.truncated,loadingMore:false,error:null})
      return {ok:true,result:snapshot()}
    }).finally(() => { if (moreFlight?.flight === flight) moreFlight = null })
    moreFlight = {before,generation,flight}
    state.publish({loadingMore:true,error:null})
    return flight
  }
  function select({id} = {}) {
    if (state.disposed) return Promise.resolve(fail('disposed'))
    if (!snapshot().active) return Promise.resolve(fail('inactive_view'))
    const item = snapshot().items.find(row => row.id === id)
    if (!item) return Promise.resolve(fail('not_found'))
    state.publish({selectedId:id,selected:item,error:null})
    return Promise.resolve({ok:true,result:clone(item)})
  }
  function write(kind,action,payload,target) {
    if (state.disposed) return Promise.resolve(fail('disposed'))
    if (pending?.flight) return pending.kind === kind &&
      JSON.stringify(pending.payload) === JSON.stringify(payload)
      ? pending.flight : Promise.resolve(fail('busy'))
    if (pending?.unknown) return Promise.resolve(fail('reconciliation_required'))
    const record = {id:randomUUID(),kind,flight:null,unknown:false,verifiedRefresh:false,
      target:clone(target),payload:clone(payload)}
    pending = record
    readSeq++; pageGen++
    const display = snapshot().active, ownerView = viewGen
    return launch(record,{state,current:()=>pending,busy:{busy:true,loading:false,loadingMore:false,
      error:null},send:()=>request(host,action,record.payload),settle:async reply => {
      readSeq++; pageGen++ // A read started while writing cannot restore pre-write content.
      state.publish({loading:false,loadingMore:false})
      if (!reply.ok) {
        record.unknown = uncertain(reply.error)
        if (!record.unknown) pending = null
        state.publish({busy:false,error:reply.error,
          unknown:record.unknown ? {operationId:record.id,kind,phase:'unknown'} : null})
        return reply
      }
      if (!receiptMatches(kind,record,reply.result)) {
        record.unknown = true
        state.publish({busy:false,error:'protocol_error',
          unknown:{operationId:record.id,kind,phase:'unknown'}})
        return fail('protocol_error')
      }
      pending = null
      policy.markStale()
      if (display && snapshot().active && ownerView === viewGen) {
        const current = snapshot()
        let items = current.items, selected = current.selected
        if (kind === 'edit') {
          items = items.map(item => item.id === target.id ? {...item,content:record.payload.content,
            revision:reply.result.revision} : item)
          if (selected?.id === target.id) selected = items.find(item => item.id === target.id)
        } else if (kind === 'forget') {
          items = items.filter(item => item.id !== target.id)
          if (selected?.id === target.id) selected = null
        } else if (kind === 'clear') { items = []; selected = null }
        state.publish({items,selected,selectedId:selected?.id ?? null,busy:false,unknown:null,error:null})
      } else state.publish({busy:false,unknown:null,error:null})
      await policy.refresh() // A failed read marks policy stale, not this confirmed memory write unknown.
      return {ok:true,result:pick(reply.result,kind==='clear' ? ['cleared','policy_revision']
        : kind==='forget' ? ['id','deleted'] : ['id','revision'])}
    }})
  }
  function receiptMatches(kind,record,result) {
    if (!result || typeof result !== 'object') return false
    if (kind === 'add') return validId(result.id) && result.revision === 1
    if (kind === 'edit') return result.id === record.target.id &&
      result.revision === record.target.revision + 1
    if (kind === 'forget') return result.id === record.target.id && result.deleted === true
    return kind === 'clear' && result.cleared === true &&
      result.policy_revision === record.target.expectedPolicyRevision + 1
  }
  function add({content,category = 'preferences'} = {}) {
    if (typeof content !== 'string' || typeof category !== 'string') return Promise.resolve(fail('invalid_request'))
    return write('add','memory.add',{content,category},{})
  }
  function edit({content} = {}) {
    const target = snapshot().selected
    if (!target || typeof content !== 'string') return Promise.resolve(fail('selection_not_ready'))
    return write('edit','memory.edit',{id:target.id,expected_revision:target.revision,content},target)
  }
  function forget() {
    const target = snapshot().selected
    if (!target) return Promise.resolve(fail('selection_not_ready'))
    return write('forget','memory.forget',{id:target.id,expected_revision:target.revision},target)
  }
  function clear({confirmed,expectedPolicyRevision} = {}) {
    const current = policy.snapshot()
    if (confirmed !== true || !validRevision(expectedPolicyRevision)) return Promise.resolve(fail('confirmation_required'))
    if (current.stale || current.policy?.revision !== expectedPolicyRevision) return Promise.resolve(fail('revision_conflict'))
    return write('clear','memory.clear',{expected_policy_revision:expectedPolicyRevision},
      {expectedPolicyRevision})
  }
  function acknowledgeUnknown({operationId} = {}) {
    if (state.disposed) return Promise.resolve(fail('disposed'))
    if (!pending?.unknown || pending.id !== operationId) return Promise.resolve(fail('unknown_operation'))
    if (!pending.verifiedRefresh) return Promise.resolve(fail('reconciliation_required'))
    pending = null
    state.publish({unknown:null,error:null})
    return Promise.resolve({ok:true,result:{operationId,acknowledged:true,confirmed:false}})
  }
  function deactivate() {
    if (state.disposed) return
    readSeq++; pageGen++; viewGen++
    state.publish({active:false,items:[],selected:null,selectedId:null,nextBefore:null,
      loading:false,loadingMore:false,truncated:false})
  }
  function dispose() { readSeq++; pageGen++; pending = null; state.dispose() }
  return {snapshot,subscribe,refresh,loadMore,select,add,edit,forget,clear,
    acknowledgeUnknown,deactivate,dispose}
}
