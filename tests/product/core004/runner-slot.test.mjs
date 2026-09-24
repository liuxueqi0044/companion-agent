import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {createTurnRunner} from '../../../apps/desktop/product/execution/runner.mjs'

const defer=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}}
const ok=result=>({ok:true,result})
const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve()}

test('construction is inert; unconfigured never begins',async()=>{
  const calls=[]
  const host={request(action){calls.push(action);return ok(null)}}
  const runner=createTurnRunner({host})
  assert.deepEqual(calls,[])
  assert.equal((await runner.run({turnId:randomUUID()})).error,'model_not_configured')
  assert.equal((await runner.run({turnId:randomUUID(),provider:{configured:true}})).error,'invalid_request')
  assert.deepEqual(calls,[])
  assert.deepEqual(Object.keys(runner.snapshot()).includes('ticket'),false)
  runner.dispose()
})

test('synchronous subscriber reentry uses one flight; exception and dispose are safe',async()=>{
  const id=randomUUID(),ticket=randomUUID(),held=defer(),calls=[]
  const host={request(action){calls.push(action);return action==='turn.begin'
    ? held.promise : ok({id,state:'responded',actions:[]})}}
  const runner=createTurnRunner({host,provider:{configured:true,respond:()=>ok(null)}})
  let nested
  runner.subscribe(snapshot=>{if(snapshot.phase==='beginning'&&!nested)nested=runner.run({turnId:id})})
  runner.subscribe(()=>{throw new Error('view_error')})
  const first=runner.run({turnId:id})
  assert.strictEqual(nested,first)
  assert.equal((await runner.run({turnId:randomUUID()})).error,'runner_busy')
  await tick()
  assert.deepEqual(calls,['turn.begin'])
  held.resolve(ok({turn_id:id,ticket}))
  // A fake provider is intentionally malformed. This must not hang or issue a second begin.
  await first
  assert.equal(calls.filter(item=>item==='turn.begin').length,1)
  runner.dispose()
})

test('timeout and stop hold owner until an abort-ignoring provider actually settles',async()=>{
  const id=randomUUID(),ticket=randomUUID(),providerReply=defer(),calls=[]
  let alarm
  const timers={setTimeout(fn){alarm=fn;return 1},clearTimeout(){}}
  const host={request(action,payload){calls.push({action,payload});if(action==='turn.begin')return ok({turn_id:id,ticket})
    if(action==='turn.fail-generation')return ok({id,state:'model_failed',error:payload.reason})
    if(action==='turn.stop')return ok({turn_id:id,permission_revoked:true,worker_exited:null,tasks:[]})
    throw new Error('unexpected '+action)}}
  let sends=0
  const runner=createTurnRunner({host,provider:{configured:true,respond(){sends++;return providerReply.promise}},timers})
  const run=runner.run({turnId:id})
  await tick()
  assert.equal(sends,1)
  alarm()
  assert.equal((await run).error,'provider_timeout')
  assert.equal((await runner.run({turnId:randomUUID()})).error,'runner_busy')
  assert.equal((await runner.stop()).ok,true)
  assert.equal((await runner.stop()).ok,true)
  const stopIds=calls.filter(item=>item.action==='turn.stop').map(item=>item.payload.command_id)
  assert.equal(new Set(stopIds).size,1)
  const end=runner.dispose()
  assert.equal(end.result.closed,false)
  assert.throws(()=>createTurnRunner({host}),/runner_owned/)
  providerReply.resolve({decision:{reply:'late'}})
  await runner.whenIdle()
  assert.equal(sends,1)
  assert.equal(calls.filter(item=>item.action==='turn.fail-generation').length,1)
  assert.equal(calls.some(item=>item.action==='turn.accept'),false)
  const next=createTurnRunner({host})
  next.dispose()
})

test('dispose reports a late unknown ticket cleanup without releasing owner early',async()=>{
  const id=randomUUID(),ticket=randomUUID(),providerReply=defer(),cleanup=defer()
  const host={request(action){if(action==='turn.begin')return ok({turn_id:id,ticket})
    if(action==='turn.fail-generation')return cleanup.promise
    throw new Error(action)}}
  const runner=createTurnRunner({host,provider:{configured:true,respond:()=>providerReply.promise}})
  const run=runner.run({turnId:id});await tick()
  assert.equal(runner.dispose().result.closed,false)
  assert.throws(()=>createTurnRunner({host}),/runner_owned/)
  assert.equal((await run).error,'provider_aborted')
  cleanup.resolve({ok:false,error:{code:'outcome_unknown'}})
  providerReply.resolve({decision:{reply:'late'}})
  await runner.whenIdle()
  assert.equal(runner.snapshot().needsReconciliation,true)
  createTurnRunner({host}).dispose()
})
