import {boundedMerge,createState,fail,launch,pick,request,validCursor,validId,uncertainWrite} from './state.mjs'

const FIELDS = ['cursor','id','kind','text','source_id','reference_id','created_at','read']
const view = item => item && validCursor(item.cursor) && validId(item.id) &&
  typeof item.kind === 'string' && typeof item.text === 'string' &&
  (item.read === 0 || item.read === 1 || typeof item.read === 'boolean')
  ? {...pick(item,FIELDS),read:!!item.read} : null

export function createInboxController({host,onUnreadInvalidated = () => {}}) {
  if (!host || typeof host.request !== 'function' || typeof onUnreadInvalidated !== 'function')
    throw new TypeError('trusted_dependencies_required')
  const state = createState({active:true,items:[],nextAfter:null,selectedId:null,selected:null,
    explanation:null,loading:false,loadingMore:false,explaining:false,busy:false,error:null,
    unknown:false,truncated:false})
  let readSeq = 0, pageGen = 0, selectionGen = 0, explainSeq = 0, moreFlight = null, write = null
  const snapshot = state.snapshot, subscribe = state.subscribe
  function parse(rows,after) {
    if (!Array.isArray(rows) || rows.length > 50) return null
    let previous = after
    const items = []
    for (const raw of rows) {
      const item = view(raw)
      if (!item || item.cursor <= previous) return null
      previous = item.cursor; items.push(item)
    }
    return items
  }
  async function refresh() {
    if (state.disposed) return fail('disposed')
    const own = ++readSeq, generation = ++pageGen
    explainSeq++
    state.publish({active:true,loading:true,loadingMore:false,explaining:false,error:null})
    const reply = await request(host,'inbox.list',{after:0,limit:50},
      ()=>!state.disposed && own===readSeq && generation===pageGen && snapshot().active)
    if (state.disposed || own !== readSeq || generation !== pageGen || !snapshot().active) return fail('stale_view')
    if (!reply.ok) { state.publish({loading:false,error:reply.error}); return reply }
    const items = parse(reply.result,0)
    if (!items) { state.publish({loading:false,error:'protocol_error'}); return fail('protocol_error') }
    const selected = items.find(item => item.id === snapshot().selectedId) ?? null
    state.publish({items,nextAfter:items.length === 50 ? items.at(-1).cursor : null,
      selectedId:selected?.id ?? null,selected,explanation:null,loading:false,truncated:false,error:null})
    return {ok:true,result:snapshot()}
  }
  function loadMore() {
    if (state.disposed) return Promise.resolve(fail('disposed'))
    const after = snapshot().nextAfter
    if (!snapshot().active || snapshot().loading || after === null) return Promise.resolve(fail('no_more_pages'))
    if (moreFlight?.after === after && moreFlight.generation === pageGen) return moreFlight.flight
    const own = ++readSeq, generation = pageGen
    const flight = Promise.resolve().then(()=>request(host,'inbox.list',{after,limit:50},
      ()=>!state.disposed && own===readSeq && generation===pageGen && snapshot().active)).then(reply => {
      if (state.disposed || own !== readSeq || generation !== pageGen || !snapshot().active) return fail('stale_view')
      if (!reply.ok) { state.publish({loadingMore:false,error:reply.error}); return reply }
      const page = parse(reply.result,after)
      if (!page) { state.publish({loadingMore:false,error:'protocol_error'}); return fail('protocol_error') }
      const merged = boundedMerge(snapshot().items,page)
      state.publish({items:merged.items,nextAfter:page.length === 50 && !merged.truncated ? page.at(-1).cursor : null,
        loadingMore:false,truncated:merged.truncated,error:null})
      return {ok:true,result:snapshot()}
    }).finally(() => { if (moreFlight?.flight === flight) moreFlight = null })
    moreFlight = {after,generation,flight}
    state.publish({loadingMore:true,error:null})
    return flight
  }
  function select({id} = {}) {
    if (state.disposed) return Promise.resolve(fail('disposed'))
    const item = snapshot().items.find(row => row.id === id)
    if (!snapshot().active || !item) return Promise.resolve(fail('not_found'))
    selectionGen++; explainSeq++
    state.publish({selectedId:id,selected:item,explanation:null,explaining:false,error:null})
    return Promise.resolve({ok:true,result:item})
  }
  async function explainSelected() {
    if (state.disposed) return fail('disposed')
    const item = snapshot().selected
    if (!snapshot().active || !item) return fail('selection_not_ready')
    const own = ++explainSeq, ownSelection = selectionGen
    state.publish({explaining:true,error:null})
    const reply = await request(host,'inbox.explain',{id:item.id},()=>!state.disposed &&
      own===explainSeq && ownSelection===selectionGen && snapshot().active)
    if (state.disposed || own !== explainSeq || ownSelection !== selectionGen ||
      snapshot().selectedId !== item.id || !snapshot().active) return fail('stale_view')
    if (!reply.ok) { state.publish({explaining:false,error:reply.error}); return reply }
    const raw = reply.result
    if (raw?.kind !== item.kind || raw?.source_id !== item.source_id ||
      raw?.reference_id !== item.reference_id || typeof raw?.basis !== 'string') {
      state.publish({explaining:false,error:'protocol_error'}); return fail('protocol_error')
    }
    const explanation = pick(raw,['kind','source_id','reference_id','basis'])
    state.publish({explanation,explaining:false,error:null})
    return {ok:true,result:explanation}
  }
  function markRead({id} = {}) {
    if (state.disposed) return Promise.resolve(fail('disposed'))
    const item = snapshot().items.find(row => row.id === id)
    if (!snapshot().active || !item) return Promise.resolve(fail('not_found'))
    if (write?.flight) return write.id === id ? write.flight : Promise.resolve(fail('busy'))
    const record = {id,flight:null}
    write = record
    readSeq++; pageGen++
    return launch(record,{state,current:()=>write,busy:{busy:true,loading:false,
      loadingMore:false,error:null},send:()=>request(host,'inbox.read',{id}),settle:reply => {
      readSeq++; pageGen++
      write = null
      state.publish({loading:false,loadingMore:false})
      if (!reply.ok) {
        const unknown = uncertainWrite(reply.error)
        state.publish({busy:false,unknown,error:reply.error})
        return reply
      }
      if (reply.result?.read !== true) {
        state.publish({busy:false,unknown:true,error:'protocol_error'})
        return fail('protocol_error')
      }
      if (snapshot().active) {
        const items = snapshot().items.map(row => row.id === id ? {...row,read:true} : row)
        state.publish({items,selected:snapshot().selectedId === id ? items.find(row => row.id === id) : snapshot().selected,
          busy:false,unknown:false,error:null})
      } else state.publish({busy:false,unknown:false,error:null})
      try { onUnreadInvalidated() } catch { /* A display callback cannot change write truth. */ }
      return {ok:true,result:{id,read:true}}
    }})
  }
  function deactivate() {
    if (state.disposed) return
    readSeq++; pageGen++; selectionGen++; explainSeq++
    state.publish({active:false,items:[],nextAfter:null,selectedId:null,selected:null,
      explanation:null,loading:false,loadingMore:false,explaining:false,truncated:false})
  }
  function dispose() { readSeq++; pageGen++; selectionGen++; explainSeq++; write=null; state.dispose() }
  return {snapshot,subscribe,refresh,loadMore,select,explainSelected,markRead,deactivate,dispose}
}
