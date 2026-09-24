import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {createProductRuntime} from '../../../apps/desktop/product/runtime/index.mjs'

const ok=result=>({ok:true,result})
const bad=code=>({ok:false,error:{code}})
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}}
const tick=()=>new Promise(resolve=>setImmediate(resolve))
const policy={revision:1,memory_enabled:true,memory_categories:['work','preferences','goals'],
  proactive_enabled:true,timezone:'UTC',start_minute:0,end_minute:1439,daily_limit:5,
  daily_evaluation_limit:5,topics:['work','daily','wellbeing'],paused_until:null}
const home={profile:{profile_id:randomUUID(),revision:1,
  preferences:{ai_name:'AI',address_user_as:'friend'}},policy,unread_count:0,
  experience_revision:1,model_status:'configured',runtime:'local_device',native_isolation:'not_run'}
const entry=()=>({command_id:randomUUID(),conversation_id:randomUUID(),text:'Fictional turn'})
const turn=value=>({id:value.command_id,conversation_id:value.conversation_id,
  text:value.text,state:'queued',actions:[]})
const claim=()=>({id:randomUUID(),ticket:randomUUID(),purpose:'Fictional check-in',source:'fictional',
  recent_interactions:[],memories:[],expires_at:'2030-01-01T00:00:00Z'})

test('a disposed runtime remains owned through an abort-ignoring turn provider and cleanup',async()=>{
  const provider=deferred(),entered=deferred(),cleanup=deferred(),input=entry(),calls=[]
  const host={request(action,payload){calls.push(action)
    if(action==='bootstrap')return ok(home)
    if(action==='policy.read')return ok(policy)
    if(action==='turn.submit' || action==='turn.read')return ok(turn(input))
    if(action==='turn.begin')return ok({turn_id:input.command_id,ticket:randomUUID()})
    if(action==='turn.fail-generation')return cleanup.promise
    throw Error(action)}}
  const runtime=createProductRuntime({host,turnProvider:{configured:true,
    respond(){entered.resolve();return provider.promise}}})
  await runtime.initialize()
  const running=runtime.send(input)
  await entered.promise
  const disposed=runtime.dispose()
  assert.equal(disposed.result.closing,true)
  assert.equal(disposed.result.providerPending,true)
  assert.throws(()=>createProductRuntime({host}),/runtime_owned/)
  let settled=false
  const idle=runtime.whenIdle().then(value=>{settled=true;return value})
  await tick();assert.equal(settled,false)
  provider.resolve({decision:{reply:'late fictional reply'}})
  await tick()
  assert.equal(calls.includes('turn.fail-generation'),true)
  assert.equal(settled,false)
  cleanup.resolve(ok({id:input.command_id,state:'model_failed',error:'provider_aborted'}))
  assert.equal((await running).ok,false)
  assert.equal((await idle).result.closed,true)
  assert.equal(runtime.diagnostics().turn.providerPending,false)
  const reopened=createProductRuntime({host});reopened.dispose();await reopened.whenIdle()
})

test('contact provider, its narrow cleanup, and a management read remain in close ownership',async()=>{
  const job=claim(),provider=deferred(),entered=deferred(),cleanup=deferred(),memory=deferred()
  const calls=[]
  const host={request(action,payload){calls.push(action)
    if(action==='bootstrap')return ok(home)
    if(action==='policy.read')return ok(policy)
    if(action==='reminder.deliver-due')return ok([])
    if(action==='contact.claim')return ok(job)
    if(action==='contact.fail-generation')return cleanup.promise
    if(action==='memory.list')return memory.promise
    throw Error(action)}}
  const runtime=createProductRuntime({host,contactProvider:{configured:true,
    reassess(){entered.resolve();return provider.promise}}})
  await runtime.initialize()
  const reading=runtime.ui.memory.refresh()
  await tick();assert.equal(calls.includes('memory.list'),true)
  const pulse=runtime.pulseContact();await entered.promise
  assert.equal(runtime.dispose().result.closing,true)
  let idle=false
  const waiting=runtime.whenIdle().then(value=>{idle=true;return value})
  provider.resolve({decision:{disposition:'cancel',reason:'not_useful'}})
  await tick();assert.equal(idle,false)
  assert.equal(calls.includes('contact.fail-generation'),true)
  cleanup.resolve(ok({id:job.id,state:'needs_retry',reason:'provider_aborted',message_id:null}))
  await tick();assert.equal(idle,false)
  memory.resolve(ok([]))
  await reading;await pulse
  assert.equal((await waiting).result.closed,true)
  assert.throws(()=>runtime.subscribe(()=>{}),/invalid_listener/)
  const next=createProductRuntime({host});next.dispose();await next.whenIdle()
})

test('a host-wide unknown write remains fenced after read-only reconciliation and runtime reopen',async()=>{
  const input=entry(),calls=[]
  const host={request(action,payload){calls.push(action)
    if(action==='bootstrap')return ok(home)
    if(action==='policy.read')return ok(policy)
    if(action==='turn.submit' || action==='turn.read')return ok(turn(input))
    if(action==='turn.begin')return bad('outcome_unknown')
    throw Error(action)}}
  let runtime=createProductRuntime({host,turnProvider:{configured:true,
    respond(){throw Error('must_not_run')}}})
  await runtime.initialize()
  const result=await runtime.send(input)
  assert.equal(result.error,'outcome_unknown')
  assert.equal(runtime.diagnostics().turn.needsReconciliation,true)
  await runtime.ui.work.reconcileSelected()
  assert.equal(runtime.diagnostics().turn.needsReconciliation,true)
  runtime.dispose();await runtime.whenIdle()
  runtime=createProductRuntime({host})
  try{
    await runtime.initialize()
    assert.equal((await runtime.send(entry())).error,'reconciliation_required')
    assert.equal(calls.filter(action=>action==='turn.begin').length,1)
  }finally{runtime.dispose();await runtime.whenIdle()}
})

test('synchronous subscriber close and throwing listener prevent unsent writes',async()=>{
  const input=entry(),calls=[]
  const host={request(action){calls.push(action)
    if(action==='bootstrap')return ok(home)
    if(action==='policy.read')return ok(policy)
    throw Error(`unexpected:${action}`)}}
  const runtime=createProductRuntime({host})
  await runtime.initialize()
  let closes=0
  runtime.subscribe(view=>{if(view.runtime.send?.phase==='registered')throw Error('display_failed')})
  runtime.subscribe(view=>{if(view.runtime.send?.phase==='registered' && closes++===0){
    runtime.dispose()
    runtime.dispose()
  }})
  const result=await runtime.send(input)
  assert.equal(result.submission,'not_sent')
  assert.equal(result.error,'send_cancelled')
  assert.equal(closes>=1,true)
  assert.equal(calls.includes('turn.submit'),false)
  assert.equal((await runtime.whenIdle()).result.closed,true)
  assert.equal((await runtime.send(entry())).error,'disposed')
  const reopened=createProductRuntime({host});reopened.dispose();await reopened.whenIdle()
})

test('an in-flight management write keeps close ownership through its actual response',async()=>{
  const writing=deferred(),calls=[]
  const host={request(action){calls.push(action)
    if(action==='bootstrap')return ok(home)
    if(action==='policy.read')return ok(policy)
    if(action==='memory.list')return ok([])
    if(action==='memory.add')return writing.promise
    throw Error(`unexpected:${action}`)}}
  const runtime=createProductRuntime({host})
  await runtime.initialize()
  assert.equal((await runtime.open({panel:'memory'})).ok,true)
  const add=runtime.ui.memory.add({content:'Fictional preference',category:'preferences'})
  await tick()
  assert.equal(calls.includes('memory.add'),true)
  runtime.dispose()
  let idle=false
  const waiting=runtime.whenIdle().then(reply=>{idle=true;return reply})
  await tick()
  assert.equal(idle,false)
  assert.throws(()=>createProductRuntime({host}),/runtime_owned/)
  writing.resolve(ok({id:randomUUID(),revision:1}))
  await add
  assert.equal((await waiting).result.closed,true)
  const reopened=createProductRuntime({host});reopened.dispose();await reopened.whenIdle()
})

test('explicit contact stop only revokes the present evaluation and waits for narrow cleanup',async()=>{
  const job=claim(),entered=deferred(),provider=deferred(),cleanup=deferred(),calls=[]
  const host={request(action){calls.push(action)
    if(action==='bootstrap')return ok(home)
    if(action==='policy.read')return ok(policy)
    if(action==='reminder.deliver-due')return ok([])
    if(action==='contact.claim')return ok(job)
    if(action==='contact.fail-generation')return cleanup.promise
    throw Error(`unexpected:${action}`)}}
  const runtime=createProductRuntime({host,contactProvider:{configured:true,
    reassess(){entered.resolve();return provider.promise}}})
  await runtime.initialize()
  const pulse=runtime.pulseContact()
  await entered.promise
  const stop=await runtime.stopContact()
  assert.equal(stop.ok,true)
  assert.equal(stop.result.stopRequested,true)
  assert.equal(stop.result.providerPending,true)
  assert.equal((await runtime.send(entry())).error,'runner_busy')
  runtime.dispose()
  let idle=false
  const waiting=runtime.whenIdle().then(reply=>{idle=true;return reply})
  provider.resolve({decision:{disposition:'send',text:'Late note',reason:'late'}})
  await tick()
  assert.equal(calls.includes('contact.complete'),false)
  assert.equal(idle,false)
  cleanup.resolve(ok({id:job.id,state:'needs_retry',reason:'provider_aborted',message_id:null}))
  await pulse
  assert.equal((await waiting).result.closed,true)
})
