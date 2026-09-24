import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import {createProductHost} from '../../../apps/desktop/product/host.mjs'
import {createInboxController} from '../../../apps/desktop/product/application/inbox.mjs'
import {createReminderController} from '../../../apps/desktop/product/application/reminders.mjs'

const workspace=path.resolve(fileURLToPath(new URL('../../..',import.meta.url)))
const python=path.resolve(workspace,'../companion-agent/.venv/Scripts/python.exe')
const fresh=async()=>{await fs.mkdir(path.join(workspace,'.test-data'),{recursive:true});
  return fs.mkdtemp(path.join(workspace,'.test-data','core-003-contact-'))}
const good=async(host,action,payload={})=>{const reply=await host.request(action,payload)
  assert.equal(reply.ok,true,JSON.stringify(reply));return reply.result}
const defer=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return{promise,resolve}}

test('real reminders create/revise/cancel; lost create receipt replays its original command',async()=>{
  const host=createProductHost({python,workspace,dataRoot:await fresh()})
  try{
    await good(host,'bootstrap')
    let lost=false,createCalls=[]
    const transport={async request(action,payload){
      const reply=await host.request(action,payload)
      if(action==='reminder.create'){
        createCalls.push(structuredClone(payload))
        if(!lost){lost=true;assert.equal(reply.ok,true);return{ok:false,error:{code:'outcome_unknown'}}}
      }
      return reply
    }}
    const control=createReminderController({host:transport})
    const due=new Date(Date.now()+3600_000).toISOString()
    const first=await control.create({text:'fictional reminder',due_at:due})
    assert.equal(first.error,'outcome_unknown')
    assert.equal(control.snapshot().pending.phase,'unknown')
    assert.equal((await control.create({text:'other',due_at:due})).error,'reconciliation_required')
    const replay=await control.replayPending()
    assert.equal(replay.ok,true)
    assert.equal(replay.result.id,createCalls[0].command_id)
    assert.deepEqual(createCalls[0],createCalls[1])
    assert.equal((await good(host,'reminder.list')).items.length,1)
    await control.refresh();await control.select({id:replay.result.id})
    assert.equal((await control.update({text:'revised',due_at:new Date(Date.now()+7200_000).toISOString()})).result.revision,2)
    assert.equal((await control.cancel()).result.state,'cancelled')
    assert.equal((await good(host,'reminder.read',{id:replay.result.id})).revision,3)
    control.dispose()
  }finally{await host.dispose()}
})

test('reminder wrong receipt cannot release pending; replay is synchronous one flight',async()=>{
  const id=randomUUID(),due=new Date(Date.now()+3600_000).toISOString(),held=defer()
  let calls=0
  const host={request(){calls++;return held.promise}}
  const control=createReminderController({host})
  let nested
  control.subscribe(snapshot=>{if(snapshot.busy && !nested)nested=control.replayPending()})
  const initial=control.create({text:'A',due_at:due})
  assert.strictEqual(nested,initial)
  await Promise.resolve();assert.equal(calls,1)
  held.resolve({ok:true,result:{id,text:'A',due_at:due,state:'pending',revision:1}})
  assert.equal((await initial).error,'protocol_error')
  assert.equal(control.snapshot().pending.phase,'unknown')
  assert.equal((await control.create({text:'B',due_at:due})).error,'reconciliation_required')
  control.dispose()
})

test('inbox selection and stale explanation; read requires displayed item and never leaks dedupe key',async()=>{
  const a={cursor:1,id:randomUUID(),kind:'task',text:'done',source_id:randomUUID(),
    reference_id:randomUUID(),created_at:new Date().toISOString(),read:0,dedupe_key:'SECRET'}
  const b={...a,cursor:2,id:randomUUID(),text:'next'}
  const slow=defer(),calls=[]
  const host={request(action,payload){calls.push(action)
    if(action==='inbox.list')return Promise.resolve({ok:true,result:[a,b]})
    if(action==='inbox.explain')return slow.promise
    if(action==='inbox.read')return Promise.resolve({ok:true,result:{read:true}})
  }}
  let invalidated=0
  const inbox=createInboxController({host,onUnreadInvalidated:()=>invalidated++})
  await inbox.refresh()
  assert.equal(JSON.stringify(inbox.snapshot()).includes('SECRET'),false)
  assert.equal((await inbox.markRead({id:randomUUID()})).error,'not_found')
  await inbox.select({id:a.id})
  const old=inbox.explainSelected()
  await inbox.select({id:b.id})
  slow.resolve({ok:true,result:{kind:a.kind,source_id:a.source_id,reference_id:a.reference_id,basis:'user_requested_work'}})
  assert.equal((await old).error,'stale_view')
  assert.equal(inbox.snapshot().explanation,null)
  assert.equal((await inbox.markRead({id:b.id})).ok,true)
  assert.equal(invalidated,1)
  assert.equal(inbox.snapshot().items.find(item=>item.id===b.id).read,true)
  inbox.deactivate();assert.deepEqual(inbox.snapshot().items,[])
  inbox.dispose()
})

test('real completed task enters inbox once and read updates authoritative home count',async()=>{
  const host=createProductHost({python,workspace,dataRoot:await fresh()})
  try{
    await good(host,'bootstrap')
    const id=randomUUID()
    await good(host,'turn.submit',{turn:{command_id:id,conversation_id:randomUUID(),
      text:'Audit fictional CSV',csv_text:'item,unit,qty,unit_price,currency\nA,x,2,3,CNY\n',
      temporary:false},capabilities:['csv.audit']})
    const begun=await good(host,'turn.begin',{turn_id:id})
    await good(host,'turn.accept',{turn_id:id,ticket:begun.ticket,
      decision:{reply:'Auditing',actions:[{kind:'csv.audit'}]}})
    await good(host,'turn.execute',{turn_id:id})
    await good(host,'worker.run-next') // This trusted driver also syncs messages once.
    assert.equal((await good(host,'tasks.sync')).new_messages,0)
    assert.equal((await good(host,'tasks.sync')).new_messages,0)
    const inbox=createInboxController({host})
    await inbox.refresh()
    assert.equal(inbox.snapshot().items.length,1)
    assert.equal(inbox.snapshot().items[0].read,false)
    assert.equal((await good(host,'home')).unread_count,1)
    const message=inbox.snapshot().items[0]
    await inbox.select({id:message.id})
    assert.equal((await inbox.explainSelected()).result.basis,'user_requested_work')
    assert.equal((await inbox.markRead({id:message.id})).ok,true)
    assert.equal((await good(host,'home')).unread_count,0)
    inbox.dispose()
  }finally{await host.dispose()}
})

test('reminder selection B survives late update of A and older read A cannot replace B',async()=>{
  const a={cursor:2,id:randomUUID(),text:'A',due_at:new Date(Date.now()+3600_000).toISOString(),
    state:'pending',revision:1}
  const b={cursor:1,id:randomUUID(),text:'B',due_at:a.due_at,state:'pending',revision:1}
  const readA=defer(),writeA=defer()
  let readsA=0
  const host={request(action,payload){
    if(action==='reminder.list')return Promise.resolve({ok:true,result:{items:[a,b],next_before:null}})
    if(action==='reminder.read'){
      if(payload.id===a.id && ++readsA===1)return readA.promise
      return Promise.resolve({ok:true,result:payload.id===a.id ? a : b})
    }
    if(action==='reminder.revise')return writeA.promise
  }}
  const control=createReminderController({host})
  await control.refresh()
  const stale=control.select({id:a.id})
  assert.equal((await control.select({id:b.id})).ok,true)
  readA.resolve({ok:true,result:a})
  assert.equal((await stale).error,'stale_view')
  await control.select({id:a.id})
  const updating=control.update({text:'A revised',due_at:a.due_at})
  const selection=control.select({id:b.id})
  writeA.resolve({ok:true,result:{...a,text:'A revised',revision:2}})
  assert.equal((await updating).ok,true)
  assert.equal((await selection).ok,true)
  assert.equal(control.snapshot().selected.id,b.id)
  control.dispose()
})
