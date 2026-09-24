import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {createContactRunner} from '../../../apps/desktop/product/execution/contact-runner.mjs'
import {createTurnRunner} from '../../../apps/desktop/product/execution/runner.mjs'

const ok=result=>({ok:true,result})
const bad=code=>({ok:false,error:{code}})
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}}
const tick=()=>new Promise(resolve=>setImmediate(resolve))
const claim=(id=randomUUID(),ticket=randomUUID())=>({id,ticket,purpose:'Fictional purpose',
  source:'fictional',recent_interactions:[],memories:[],expires_at:'2030-01-01T00:00:00Z'})
const sent=(id,message_id=randomUUID())=>({id,state:'sent',reason:'still_relevant',message_id})
const provider={configured:true,reassess:()=>({decision:{disposition:'send',
  text:'Fictional note',reason:'still_relevant'}})}

test('foreground and contact share a real slot; neither can start the other lane',async()=>{
  const begin=deferred(),actions=[],id=randomUUID()
  const host={request(action){actions.push(action)
    if(action==='turn.begin')return begin.promise
    if(action==='reminder.deliver-due')return ok([])
    if(action==='contact.claim')return ok(null)
    throw new Error(action)}}
  const turn=createTurnRunner({host,provider:{configured:true,respond:()=>{throw Error('unexpected')}}})
  const contact=createContactRunner({host,provider})
  try{
    const running=turn.run({turnId:id});await tick()
    assert.equal((await contact.pulse()).error,'runner_busy')
    assert.deepEqual(actions,['turn.begin'])
    begin.resolve(bad('invalid_request'))
    assert.equal((await running).error,'invalid_request');await turn.whenIdle()
    const held=deferred(),job=claim(),reverse=[]
    host.request=action=>{reverse.push(action)
      if(action==='reminder.deliver-due')return ok([])
      if(action==='contact.claim')return ok(job)
      if(action==='contact.fail-generation')return ok({id:job.id,state:'needs_retry',
        reason:'provider_aborted',message_id:null})
      if(action==='turn.begin')return bad('invalid_request')
      throw Error(action)}
    const heldProvider={configured:true,reassess(){return held.promise}}
    // Owner is unique: release this idle contact owner before installing the held provider.
    contact.dispose();await contact.whenIdle()
    const contact2=createContactRunner({host,provider:heldProvider})
    try{
      const pulse=contact2.pulse();await tick();await tick()
      assert.equal(contact2.snapshot().providerPending,true)
      assert.equal((await turn.run({turnId:id})).error,'runner_busy')
      assert.equal(reverse.includes('turn.begin'),false)
      await contact2.stop()
      assert.equal((await pulse).error,'provider_aborted')
      assert.equal((await turn.run({turnId:id})).error,'runner_busy')
      held.resolve({decision:{disposition:'cancel',reason:'not_useful'}})
      await contact2.whenIdle()
      assert.equal((await turn.run({turnId:id})).error,'invalid_request')
    }finally{contact2.dispose();await contact2.whenIdle()}
  }finally{turn.dispose();contact.dispose();await turn.whenIdle();await contact.whenIdle()}
})

test('synchronous stop or dispose before send blocks the unsent reminder write',async()=>{
  for(const op of ['stop','dispose']){
    const actions=[],host={request(action){actions.push(action);return ok([])}}
    const runner=createContactRunner({host})
    let fired=false
    runner.subscribe(view=>{if(!fired && view.hostPending){fired=true;void runner[op]()}})
    const answer=await runner.pulse()
    assert.equal(answer.ok,false)
    assert.deepEqual(actions,[])
    await runner.whenIdle();runner.dispose()
  }
})

test('wrong claim identity cannot reach provider; provider failures clean only owned ticket once',async()=>{
  for(const job of [claim('wrong'),claim(randomUUID(),'wrong')]){
    const actions=[],host={request(action){actions.push(action)
      return action==='reminder.deliver-due'?ok([]):ok(job)}}
    let calls=0
    const runner=createContactRunner({host,provider:{configured:true,reassess(){calls++}}})
    assert.equal((await runner.pulse()).error,'protocol_error')
    assert.equal(calls,0)
    assert.deepEqual(actions,['reminder.deliver-due','contact.claim'])
    assert.equal(runner.snapshot().needsReconciliation,true)
    runner.dispose();await runner.whenIdle()
  }
  for(const [reassess,reason] of [[()=>{throw Error('secret')},'provider_failed'],
    [()=>({decision:{disposition:'send',text:'x',reason:'still_relevant'},forged:true}),
      'provider_invalid_output']]){
    const job=claim(),actions=[]
    const host={request(action,payload){actions.push({action,payload})
      if(action==='reminder.deliver-due')return ok([])
      if(action==='contact.claim')return ok(job)
      if(action==='contact.fail-generation')return ok({id:job.id,state:'needs_retry',
        reason:payload.reason,message_id:null})
      throw Error(action)}}
    const runner=createContactRunner({host,provider:{configured:true,reassess}})
    assert.equal((await runner.pulse()).error,reason)
    assert.deepEqual(actions.map(item=>item.action),
      ['reminder.deliver-due','contact.claim','contact.fail-generation'])
    assert.deepEqual(actions[2].payload,{id:job.id,ticket:job.ticket,reason})
    assert.doesNotMatch(JSON.stringify(runner.snapshot()),/secret|ticket|Fictional purpose/)
    runner.dispose();await runner.whenIdle()
  }
})

test('unknown completion is not replayed and blocks both lanes even after readback',async()=>{
  const job=claim(),actions=[]
  const host={request(action){actions.push(action)
    if(action==='reminder.deliver-due')return ok([])
    if(action==='contact.claim')return ok(job)
    if(action==='contact.complete')return bad('outcome_unknown')
    if(action==='contact.read')return ok({id:job.id,state:'evaluating',reason:null,message_id:null})
    throw Error(action)}}
  const contact=createContactRunner({host,provider}),turn=createTurnRunner({host})
  try{
    assert.equal((await contact.pulse()).error,'outcome_unknown')
    assert.equal(contact.snapshot().needsReconciliation,true)
    const read=await contact.reconcile()
    assert.equal(read.ok,true)
    assert.equal(read.result.needsReconciliation,true)
    assert.equal((await contact.pulse()).error,'reconciliation_required')
    assert.equal((await turn.runLocalOnce({turnId:randomUUID()})).error,'reconciliation_required')
    assert.deepEqual(actions,['reminder.deliver-due','contact.claim','contact.complete','contact.read'])
  }finally{contact.dispose();turn.dispose();await contact.whenIdle();await turn.whenIdle()}
})

test('late committed completion remains visible after stop, without a second complete',async()=>{
  const job=claim(),complete=deferred(),messageId=randomUUID(),actions=[]
  const host={request(action,payload){actions.push(action)
    if(action==='reminder.deliver-due')return ok([])
    if(action==='contact.claim')return ok(job)
    if(action==='contact.complete')return complete.promise
    if(action==='contact.fail-generation')return bad('stale_generation')
    if(action==='contact.read')return ok(sent(job.id,messageId))
    throw Error(action)}}
  const runner=createContactRunner({host,provider})
  try{
    const flight=runner.pulse()
    for(let n=0;n<10 && !actions.includes('contact.complete');n++)await tick()
    assert.equal(actions.includes('contact.complete'),true)
    const stopped=await runner.stop()
    assert.equal(stopped.result.deliveryUncertain,true)
    complete.resolve(ok(sent(job.id,messageId)))
    assert.equal((await flight).error,'provider_aborted')
    await runner.whenIdle()
    assert.deepEqual(runner.snapshot().contactMessageIds,[messageId])
    assert.equal((await runner.reconcile()).result.receipt.messageId,messageId)
    assert.equal(actions.filter(item=>item==='contact.complete').length,1)
  }finally{runner.dispose();await runner.whenIdle()}
})

test('claim in flight keeps disposed owner until actual cleanup settles',async()=>{
  const job=claim(),pending=deferred(),cleanup=deferred(),actions=[]
  const host={request(action){actions.push(action)
    if(action==='reminder.deliver-due')return ok([])
    if(action==='contact.claim')return pending.promise
    if(action==='contact.fail-generation')return cleanup.promise
    throw Error(action)}}
  const runner=createContactRunner({host,provider})
  const flight=runner.pulse()
  for(let n=0;n<10 && !actions.includes('contact.claim');n++)await tick()
  assert.equal(actions.includes('contact.claim'),true)
  runner.dispose()
  assert.throws(()=>createContactRunner({host}),/runner_owned/)
  pending.resolve(ok(job))
  assert.equal((await flight).error,'provider_aborted')
  await tick()
  assert.equal(actions.includes('contact.fail-generation'),true)
  assert.throws(()=>createContactRunner({host}),/runner_owned/)
  cleanup.resolve(ok({id:job.id,state:'needs_retry',reason:'provider_aborted',message_id:null}))
  await runner.whenIdle()
  const successor=createContactRunner({host});successor.dispose()
})

test('timeout does not release the slot while an abort-ignoring provider is pending',async()=>{
  const job=claim(),pending=deferred(),actions=[]
  const host={request(action,payload){actions.push(action)
    if(action==='reminder.deliver-due')return ok([])
    if(action==='contact.claim')return ok(job)
    if(action==='contact.fail-generation')return ok({id:job.id,state:'needs_retry',
      reason:payload.reason,message_id:null})
    throw Error(action)}}
  const contact=createContactRunner({host,timeoutMs:5,provider:{configured:true,
    reassess(){return pending.promise}}})
  const turn=createTurnRunner({host})
  try{
    assert.equal((await contact.pulse()).error,'provider_timeout')
    assert.equal(contact.snapshot().providerPending,true)
    assert.equal((await turn.runLocalOnce({turnId:randomUUID()})).error,'runner_busy')
    assert.equal(actions.filter(item=>item==='contact.fail-generation').length,1)
    pending.resolve({decision:{disposition:'send',text:'Late',reason:'still_relevant'}})
    await contact.whenIdle()
    assert.equal(actions.includes('contact.complete'),false)
  }finally{contact.dispose();turn.dispose();await contact.whenIdle();await turn.whenIdle()}
})

test('reconcile is singleflight, read-only and cannot overwrite after disposal',async()=>{
  const job=claim(),read=deferred(),actions=[]
  const host={request(action){actions.push(action)
    if(action==='reminder.deliver-due')return ok([])
    if(action==='contact.claim')return ok(job)
    if(action==='contact.complete')return bad('outcome_unknown')
    if(action==='contact.read')return read.promise
    throw Error(action)}}
  const runner=createContactRunner({host,provider})
  assert.equal((await runner.pulse()).error,'outcome_unknown')
  const a=runner.reconcile(),b=runner.reconcile()
  assert.equal(a,b)
  await tick()
  assert.equal(actions.filter(item=>item==='contact.read').length,1)
  runner.dispose()
  assert.throws(()=>createContactRunner({host}),/runner_owned/)
  read.resolve(ok(sent(job.id)))
  assert.equal((await a).error,'disposed')
  await runner.whenIdle()
  assert.equal(runner.snapshot().contactMessageIds.length,0)
  const successor=createContactRunner({host});successor.dispose()
})

test('cleanup transport uncertainty is retained and not mistaken for a provider failure receipt',async()=>{
  const job=claim(),actions=[]
  const host={request(action){actions.push(action)
    if(action==='reminder.deliver-due')return ok([])
    if(action==='contact.claim')return ok(job)
    if(action==='contact.fail-generation')return bad('outcome_unknown')
    throw Error(action)}}
  const runner=createContactRunner({host,provider:{configured:true,
    reassess(){throw Error('private failure')}}})
  try{
    const result=await runner.pulse()
    assert.equal(result.error,'outcome_unknown')
    assert.equal(runner.snapshot().needsReconciliation,true)
    assert.equal((await runner.pulse()).error,'reconciliation_required')
    assert.deepEqual(actions,['reminder.deliver-due','contact.claim','contact.fail-generation'])
  }finally{runner.dispose();await runner.whenIdle()}
})

test('uncertain reminder or claim receipt never advances to model work',async()=>{
  for(const uncertain of ['reminder.deliver-due','contact.claim']){
    const actions=[],host={request(action){actions.push(action)
      if(action===uncertain)return bad('internal_error')
      if(action==='reminder.deliver-due')return ok([])
      throw Error(action)}}
    let called=0
    const runner=createContactRunner({host,provider:{configured:true,reassess(){called++}}})
    assert.equal((await runner.pulse()).error,'internal_error')
    assert.equal(called,0)
    assert.equal(runner.snapshot().needsReconciliation,true)
    assert.deepEqual(actions,uncertain==='reminder.deliver-due'?
      ['reminder.deliver-due']:['reminder.deliver-due','contact.claim'])
    runner.dispose();await runner.whenIdle()
  }
})

test('foreign or malformed completion receipt cannot become a send or trigger read/redo',async()=>{
  for(const faulty of [sent(randomUUID()),{id:randomUUID(),state:'sent',
    reason:'still_relevant',message_id:null}]){
    const job=claim(),actions=[]
    const host={request(action){actions.push(action)
      if(action==='reminder.deliver-due')return ok([])
      if(action==='contact.claim')return ok(job)
      if(action==='contact.complete')return ok(faulty)
      throw Error(action)}}
    const runner=createContactRunner({host,provider})
    assert.equal((await runner.pulse()).error,'protocol_error')
    assert.equal(runner.snapshot().needsReconciliation,true)
    assert.deepEqual(runner.snapshot().contactMessageIds,[])
    assert.deepEqual(actions,['reminder.deliver-due','contact.claim','contact.complete'])
    runner.dispose();await runner.whenIdle()
  }
})

test('definite bad decision completion cleans its own ticket once; failed readback stays unknown',async()=>{
  for(const mode of ['invalid_time','readback_lost']){
    const job=claim(),actions=[],messageId=randomUUID()
    const host={request(action,payload){actions.push(action)
      if(action==='reminder.deliver-due')return ok([])
      if(action==='contact.claim')return ok(job)
      if(action==='contact.complete')return mode==='invalid_time'
        ? bad('invalid_followup_window') : ok(sent(job.id,messageId))
      if(action==='contact.fail-generation')return ok({id:job.id,state:'needs_retry',
        reason:payload.reason,message_id:null})
      if(action==='contact.read')return bad('transport_unavailable')
      throw Error(action)}}
    const runner=createContactRunner({host,provider})
    const result=await runner.pulse()
    if(mode==='invalid_time'){
      assert.equal(result.error,'invalid_followup_window')
      assert.deepEqual(actions,['reminder.deliver-due','contact.claim','contact.complete',
        'contact.fail-generation'])
    }else{
      assert.equal(result.error,'transport_unavailable')
      assert.deepEqual(runner.snapshot().contactMessageIds,[messageId])
      assert.deepEqual(actions,['reminder.deliver-due','contact.claim','contact.complete',
        'contact.read'])
      assert.equal(runner.snapshot().needsReconciliation,true)
    }
    runner.dispose();await runner.whenIdle()
  }
})
