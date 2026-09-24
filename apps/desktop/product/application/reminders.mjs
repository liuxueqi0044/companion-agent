import {randomUUID} from 'node:crypto'
import {boundedMerge,clone,createState,fail,launch,pick,request,validCursor,validId,validRevision,uncertainWrite} from './state.mjs'

const FIELDS = ['cursor','id','text','due_at','state','revision']
const view = item => item && validId(item.id) && validRevision(item.revision) &&
  typeof item.text === 'string' && typeof item.due_at === 'string' && typeof item.state === 'string'
  ? pick(item,FIELDS) : null
const uncertain = uncertainWrite

export function createReminderController({host}) {
  if (!host || typeof host.request !== 'function') throw new TypeError('trusted_host_required')
  const state = createState({active:true,items:[],nextBefore:null,selectedId:null,selected:null,
    loading:false,loadingMore:false,selecting:false,busy:false,pending:null,error:null,truncated:false})
  let readSeq=0,pageGen=0,selectionGen=0,viewGen=0,pending=null,moreFlight=null
  const snapshot=state.snapshot,subscribe=state.subscribe
  function page(raw,before) {
    if (!raw || !Array.isArray(raw.items) || raw.items.length > 50 ||
      !(raw.next_before === null || validCursor(raw.next_before))) return null
    let previous = before ?? Number.MAX_SAFE_INTEGER
    const items=[]
    for (const value of raw.items) {
      const item=view(value)
      if (!item || !validCursor(item.cursor) || item.cursor >= previous) return null
      previous=item.cursor; items.push(item)
    }
    if (raw.next_before !== null && raw.next_before !== items.at(-1)?.cursor) return null
    return {items,nextBefore:raw.next_before}
  }
  async function refresh() {
    if (state.disposed) return fail('disposed')
    if (!snapshot().active) viewGen++
    const own=++readSeq,generation=++pageGen
    selectionGen++
    state.publish({active:true,loading:true,loadingMore:false,selecting:false,error:null})
    const reply=await request(host,'reminder.list',{limit:50},
      ()=>!state.disposed && own===readSeq && generation===pageGen && snapshot().active)
    if (state.disposed || own!==readSeq || generation!==pageGen || !snapshot().active) return fail('stale_view')
    if (!reply.ok) { state.publish({loading:false,error:reply.error}); return reply }
    const parsed=page(reply.result,null)
    if (!parsed) { state.publish({loading:false,error:'protocol_error'}); return fail('protocol_error') }
    const selected=parsed.items.find(item=>item.id===snapshot().selectedId) ?? null
    state.publish({...parsed,selectedId:selected?.id ?? null,selected,loading:false,truncated:false,error:null})
    return {ok:true,result:snapshot()}
  }
  function loadMore() {
    if (state.disposed) return Promise.resolve(fail('disposed'))
    const before=snapshot().nextBefore
    if (!snapshot().active || snapshot().loading || before===null) return Promise.resolve(fail('no_more_pages'))
    if (moreFlight?.before===before && moreFlight.generation===pageGen) return moreFlight.flight
    const own=++readSeq,generation=pageGen
    const flight=Promise.resolve().then(()=>request(host,'reminder.list',{limit:50,before},
      ()=>!state.disposed && own===readSeq && generation===pageGen && snapshot().active)).then(reply=>{
      if (state.disposed || own!==readSeq || generation!==pageGen || !snapshot().active) return fail('stale_view')
      if (!reply.ok) {state.publish({loadingMore:false,error:reply.error});return reply}
      const parsed=page(reply.result,before)
      if (!parsed) {state.publish({loadingMore:false,error:'protocol_error'});return fail('protocol_error')}
      const merged=boundedMerge(snapshot().items,parsed.items)
      state.publish({items:merged.items,nextBefore:merged.truncated ? null : parsed.nextBefore,
        truncated:merged.truncated,loadingMore:false,error:null})
      return {ok:true,result:snapshot()}
    }).finally(()=>{if(moreFlight?.flight===flight)moreFlight=null})
    moreFlight={before,generation,flight}
    state.publish({loadingMore:true,error:null})
    return flight
  }
  async function select({id}={}) {
    if (state.disposed) return fail('disposed')
    if (!snapshot().active || !snapshot().items.some(item=>item.id===id)) return fail('not_found')
    const own=++selectionGen
    state.publish({selectedId:id,selected:null,selecting:true,error:null})
    const reply=await request(host,'reminder.read',{id},()=>!state.disposed && own===selectionGen &&
      snapshot().selectedId===id && snapshot().active)
    if (state.disposed || own!==selectionGen || snapshot().selectedId!==id || !snapshot().active) return fail('stale_view')
    if (!reply.ok) {state.publish({selecting:false,error:reply.error});return reply}
    const selected=view(reply.result)
    if (!selected || selected.id!==id) {state.publish({selecting:false,error:'protocol_error'});return fail('protocol_error')}
    state.publish({selected,selecting:false,error:null})
    return {ok:true,result:clone(selected)}
  }
  function sendPending(record) {
    return launch(record,{state,current:()=>pending,busy:{busy:true,pending:{operationId:record.operationId,
      kind:record.kind,phase:'sending'},loading:false,loadingMore:false,selecting:false,error:null},
      send:()=>request(host,record.action,record.payload),settle:async reply=>{
        readSeq++;pageGen++
        if (record.target?.id && snapshot().selectedId===record.target.id) selectionGen++
        state.publish({loading:false,loadingMore:false,
          ...(record.target?.id && snapshot().selectedId===record.target.id ? {selecting:false} : {})})
        if (!reply.ok) {
          if (!uncertain(reply.error)) pending=null
          state.publish({busy:false,pending:pending ? {operationId:record.operationId,
            kind:record.kind,phase:'unknown'} : null,error:reply.error})
          if (!pending && reply.error==='revision_conflict' && record.target?.id && snapshot().active &&
            record.viewGen===viewGen && snapshot().selectedId===record.target.id)
            await select({id:record.target.id})
          return reply
        }
        const result=view(reply.result)
        // Creation replay returns the current row; revision replay returns its stored receipt.
        const valid=record.kind==='create' ? result?.id===record.payload.command_id && validRevision(result.revision)
          : result?.id===record.target.id && result.revision===record.target.revision+1 &&
            (record.kind!=='cancel' || result.state==='cancelled')
        if (!valid) {
          state.publish({busy:false,pending:{operationId:record.operationId,
            kind:record.kind,phase:'unknown'},error:'protocol_error'})
          return fail('protocol_error')
        }
        pending=null
        if (snapshot().active && record.viewGen===viewGen) {
          const current=snapshot()
          const items=current.items.map(item=>item.id===result.id && item.revision<=result.revision
            ? {...item,...result} : item)
          if (record.kind==='create' && !items.some(item=>item.id===result.id)) items.unshift(result)
          state.publish({items:items.slice(0,200),truncated:items.length>200,
            selected:current.selectedId===result.id && (current.selected?.revision ?? 0)<=result.revision
              ? result : current.selected,
            busy:false,pending:null,error:null})
        } else state.publish({busy:false,pending:null,error:null})
        return {ok:true,result:result}
      }})
  }
  function start(kind,action,payload,target=null) {
    if (state.disposed) return Promise.resolve(fail('disposed'))
    if (pending?.flight) return Promise.resolve(fail('busy'))
    if (pending) return Promise.resolve(fail('reconciliation_required'))
    const record={operationId:randomUUID(),kind,action,payload:clone(payload),target:clone(target),
      viewGen,flight:null}
    pending=record
    readSeq++;pageGen++;selectionGen++
    return sendPending(record)
  }
  function create({text,due_at}={}) {
    if (typeof text!=='string' || typeof due_at!=='string') return Promise.resolve(fail('invalid_request'))
    return start('create','reminder.create',{command_id:randomUUID(),text,due_at})
  }
  function revise(kind,{text,due_at}={}) {
    const target=snapshot().selected
    if (!target || target.state!=='pending') return Promise.resolve(fail('selection_not_ready'))
    if (kind==='update' && (typeof text!=='string' || typeof due_at!=='string'))
      return Promise.resolve(fail('invalid_request'))
    const payload={command_id:randomUUID(),id:target.id,expected_revision:target.revision,
      operation:kind,...(kind==='update' ? {text,due_at} : {})}
    return start(kind,'reminder.revise',payload,target)
  }
  const update=input=>revise('update',input)
  const cancel=()=>revise('cancel')
  function replayPending() {
    if (state.disposed) return Promise.resolve(fail('disposed'))
    if (!pending) return Promise.resolve(fail('nothing_to_replay'))
    return sendPending(pending)
  }
  function deactivate() {
    if (state.disposed) return
    readSeq++;pageGen++;selectionGen++;viewGen++
    state.publish({active:false,items:[],nextBefore:null,selectedId:null,selected:null,
      loading:false,loadingMore:false,selecting:false,truncated:false})
  }
  function dispose() {readSeq++;pageGen++;selectionGen++;pending=null;state.dispose()}
  return {snapshot,subscribe,refresh,loadMore,select,create,update,cancel,replayPending,
    deactivate,dispose}
}
