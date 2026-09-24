import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {createProductRuntime} from '../../../apps/desktop/product/runtime/index.mjs'

const ok=result=>({ok:true,result})
const bad=code=>({ok:false,error:{code}})
const tick=()=>new Promise(resolve=>setImmediate(resolve))
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}}
const policy={revision:1,memory_enabled:true,memory_categories:['work','preferences','goals'],
  proactive_enabled:false,timezone:'UTC',start_minute:540,end_minute:1260,daily_limit:1,
  daily_evaluation_limit:3,topics:['work','daily','wellbeing'],paused_until:null}
const home={profile:{profile_id:randomUUID(),revision:1,
  preferences:{ai_name:'AI',address_user_as:'friend'}},policy,unread_count:0,
  experience_revision:1,model_status:'not_configured',runtime:'local_device',native_isolation:'not_run'}
const entry=()=>({command_id:randomUUID(),conversation_id:randomUUID(),text:'Fictional task'})
const turn=value=>({id:value.command_id,conversation_id:value.conversation_id,
  text:value.text,state:'queued',actions:[]})
function fixture(request){
  const calls=[]
  const runtime=createProductRuntime({host:{request(action,payload){
    calls.push({action,payload})
    if(action==='bootstrap')return ok(home)
    if(action==='policy.read')return ok(policy)
    return request(action,payload)
  }}})
  return {runtime,calls,close:async()=>{runtime.dispose();await runtime.whenIdle()}}
}

for(const panel of ['home','inbox','conversation'])test(`${panel} refresh is registered before subscriber reentry`,async()=>{
  const input=entry()
  const f=fixture(action=>{
    if(action==='home')return ok(home)
    if(action==='inbox.list')return ok([])
    if(action==='turn.read')return ok(turn(input))
    throw Error(action)
  })
  const {runtime,calls}=f
  try{
    await runtime.initialize()
    if(panel!=='home')await runtime.open({panel,turnId:input.command_id})
    await runtime.whenIdle();calls.length=0
    const refresh=panel==='home'?runtime.refresh:panel==='inbox'?runtime.ui.inbox.refresh:
      runtime.ui.conversation.refreshSelected
    let entered=false,nested
    runtime.subscribe(view=>{if(view.runtime.pendingOperations && !entered){entered=true;nested=refresh()}})
    const first=refresh()
    await Promise.all([first,nested])
    assert.strictEqual(nested,first)
    const action=panel==='home'?'home':panel==='inbox'?'inbox.list':'turn.read'
    assert.equal(calls.filter(row=>row.action===action).length,1)
  }finally{await f.close()}
})

for(const panel of ['home','inbox'])test(`committed message cannot synchronize from a pre-commit ${panel} read`,async()=>{
  const stale=deferred(),messageId=randomUUID()
  let hold=false,delivered=false
  const item={cursor:1,id:messageId,kind:'reminder',text:'Fictional reminder',source_id:null,
    reference_id:null,created_at:'2030-01-01T00:00:00Z',read:0}
  const f=fixture(action=>{
    if(action==='reminder.deliver-due'){delivered=true;return ok([messageId])}
    if(action==='home')return panel==='home' && hold ? (hold=false,stale.promise):
      ok({...home,unread_count:delivered?1:0})
    if(action==='inbox.list')return panel==='inbox' && hold ? (hold=false,stale.promise):
      ok(delivered?[item]:[])
    throw Error(action)
  })
  try{
    await f.runtime.initialize()
    if(panel==='inbox')await f.runtime.open({panel})
    await f.runtime.whenIdle();hold=true
    const reading=panel==='home'?f.runtime.refresh():f.runtime.ui.inbox.refresh()
    await tick()
    const pulse=f.runtime.pulseContact();await tick()
    assert.equal(delivered,true)
    stale.resolve(ok(panel==='home'?home:[]))
    await reading
    const result=await pulse
    assert.equal(result.result.view.synced,true)
    assert.equal(f.runtime.snapshot().home.unreadCount,1)
    if(panel==='inbox')assert.deepEqual(f.runtime.ui.inbox.snapshot().items.map(row=>row.id),[messageId])
  }finally{stale.resolve(ok(panel==='home'?home:[]));await f.close()}
})

test('management write captures user input before asynchronous dispatch',async()=>{
  const f=fixture(action=>{
    if(action==='memory.add')return ok({id:randomUUID(),revision:1})
    throw Error(action)
  })
  try{
    await f.runtime.initialize()
    const input={content:'Original preference',category:'preferences'}
    const write=f.runtime.ui.memory.add(input)
    input.content='Later form edit';input.category='work'
    assert.equal((await write).ok,true)
    assert.deepEqual(f.calls.find(row=>row.action==='memory.add').payload,
      {content:'Original preference',category:'preferences'})
  }finally{await f.close()}
})

test('navigation captures its target before caller mutates the object',async()=>{
  const f=fixture(action=>action==='memory.list'?ok([]):bad('unexpected_action'))
  try{
    await f.runtime.initialize()
    const target={panel:'memory'},opened=f.runtime.open(target)
    target.panel='contact'
    assert.equal((await opened).ok,true)
    assert.equal(f.runtime.snapshot().panel,'memory')
  }finally{await f.close()}
})

test('unrelated unsent command remains usable after original unknown submission is reconciled',async()=>{
  const first=entry(),second=entry()
  let submissions=0,current
  const f=fixture((action,payload)=>{
    if(action==='turn.submit'){
      submissions++;current=turn(payload.turn)
      return submissions===1?bad('outcome_unknown'):ok(current)
    }
    if(action==='turn.read')return ok(current)
    throw Error(action)
  })
  try{
    await f.runtime.initialize()
    assert.equal((await f.runtime.send(first)).submission,'unknown')
    assert.equal((await f.runtime.send(second)).error,'submit_pending_reconciliation')
    assert.equal(submissions,1)
    assert.equal((await f.runtime.ui.conversation.replaySubmit()).result.id,first.command_id)
    const result=await f.runtime.send(second)
    assert.equal(result.submission,'confirmed')
    assert.equal(result.error,'model_not_configured')
    assert.equal(submissions,3)
    assert.equal(f.calls.some(row=>row.action==='turn.begin'),false)
  }finally{await f.close()}
})

test('uncloneable management arguments are rejected before dispatch',async()=>{
  const f=fixture(action=>{throw Error(action)})
  try{
    await f.runtime.initialize();f.calls.length=0
    const result=await f.runtime.ui.memory.add({content:'Fictional',callback:()=>{}})
    assert.equal(result.error,'invalid_request')
    assert.deepEqual(f.calls,[])
  }finally{await f.close()}
})

test('subscriber disposal before a coalesced refresh prevents the unsent read',async()=>{
  const f=fixture(action=>{throw Error(action)})
  await f.runtime.initialize();await f.runtime.whenIdle();f.calls.length=0
  f.runtime.subscribe(view=>{if(view.runtime.pendingOperations && !view.runtime.closing)f.runtime.dispose()})
  assert.equal((await f.runtime.refresh()).error,'disposed')
  assert.equal((await f.runtime.whenIdle()).result.closed,true)
  assert.deepEqual(f.calls,[])
})

test('closing while a pre-delivery read is pending waits without starting replacement reads',async()=>{
  const old=deferred(),messageId=randomUUID()
  const f=fixture(action=>{
    if(action==='home')return old.promise
    if(action==='reminder.deliver-due')return ok([messageId])
    throw Error(action)
  })
  try{
    await f.runtime.initialize()
    const read=f.runtime.refresh();await tick()
    const pulse=f.runtime.pulseContact();await tick()
    f.runtime.dispose()
    let idle=false
    const waiting=f.runtime.whenIdle().then(reply=>{idle=true;return reply})
    await tick();assert.equal(idle,false)
    old.resolve(ok(home));await read;await pulse
    assert.equal((await waiting).result.closed,true)
    assert.equal(f.calls.filter(row=>row.action==='home').length,1)
  }finally{old.resolve(ok(home));await f.close()}
})
