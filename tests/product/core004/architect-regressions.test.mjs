import {resolveRuntime} from '../../../apps/desktop/product/runtime-paths.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID as uuid} from 'node:crypto'
import {createTurnRunner} from '../../../apps/desktop/product/execution/runner.mjs'
import {createProductHost} from '../../../apps/desktop/product/host.mjs'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const ok=result=>({ok:true,result}),bad=code=>({ok:false,error:{code}})
const defer=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}}
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve()}
const plain=id=>({id,state:'responded',actions:[]})
const queued=id=>({id,state:'actions_recorded',actions:[{id:uuid(),kind:'csv.audit',state:'accepted',
  task:{task_id:uuid(),current_attempt_id:uuid(),status:'queued',attempt_count:1}}]})
const provider={configured:true,respond:()=>({decision:{reply:'synthetic'}})}
async function completedWithHeldRead(){
  const id=uuid(),read=defer(),calls=[]
  const host={request(action,p){calls.push(action)
    if(action==='turn.begin')return ok({turn_id:p.turn_id,ticket:uuid()})
    if(action==='turn.accept')return ok(plain(p.turn_id))
    if(action==='turn.read')return read.promise
    throw Error(action)
  }}
  const runner=createTurnRunner({host,provider});assert.equal((await runner.run({turnId:id})).ok,true)
  return {id,read,calls,host,runner}
}

test('pending reconciliation holds idle and host ownership through disposal',async()=>{
  const {id,read,host,runner}=await completedWithHeldRead()
  const checking=runner.reconcile();await flush();let idle=false
  const idleFlight=runner.whenIdle().then(()=>{idle=true})
  const end=runner.dispose();await flush()
  const tooEarly=idle;let ownerHeld=false,replacement
  try{replacement=createTurnRunner({host})}catch(e){ownerHeld=e.message==='runner_owned'}
  replacement?.dispose();read.resolve(ok(plain(id)));await checking;await idleFlight
  assert.equal(end.result.closed,false);assert.equal(tooEarly,false);assert.equal(ownerHeld,true)
  assert.equal(runner.snapshot().hostPending,0)
})

test('reconciliation is single flight and does not admit a new run before readback settles',async()=>{
  const {id,read,calls,runner}=await completedWithHeldRead()
  const first=runner.reconcile(),second=runner.reconcile();await flush()
  const next=await runner.run({turnId:uuid()})
  read.resolve(ok(plain(id)));await Promise.all([first,second])
  assert.strictEqual(first,second);assert.equal(calls.filter(a=>a==='turn.read').length,1)
  assert.equal(next.error,'runner_busy');runner.dispose();await runner.whenIdle()
})

test('a reconciliation read predating generation completion cannot roll activity backwards',async()=>{
  const id=uuid(),generated=defer(),read=defer()
  const host={request(action){
    if(action==='turn.begin')return ok({turn_id:id,ticket:uuid()})
    if(action==='turn.accept')return ok(plain(id))
    if(action==='turn.read')return read.promise
  }}
  const runner=createTurnRunner({host,provider:{configured:true,respond:()=>generated.promise}})
  const running=runner.run({turnId:id});await flush()
  const old=runner.reconcile();await flush();generated.resolve({decision:{reply:'done'}})
  assert.equal((await running).ok,true)
  read.resolve(ok({id,state:'generating',actions:[]}))
  assert.equal((await old).error,'stale_view');assert.equal(runner.snapshot().activity.turnState,'responded')
  runner.dispose();await runner.whenIdle()
})

test('dispose inside host-pending notification prevents a not-yet-sent begin',async()=>{
  const id=uuid(),calls=[]
  const runner=createTurnRunner({host:{request(action,p){calls.push(action)
    return action==='turn.begin'?ok({turn_id:id,ticket:uuid()}):ok({id,state:'model_failed',error:p.reason})}},provider})
  runner.subscribe(s=>{if(s.hostPending===1 && s.phase==='beginning')runner.dispose()})
  await runner.run({turnId:id});await runner.whenIdle()
  assert.deepEqual(calls,[])
})

test('stop inside host-pending notification prevents unsent execute',async()=>{
  const id=uuid(),ticket=uuid(),calls=[];let stopped,entered=false
  const ready={id,state:'actions_ready',actions:[{id:uuid(),kind:'csv.audit',state:'ready'}]}
  const host={request(action,p){calls.push(action)
    if(action==='turn.begin')return ok({turn_id:id,ticket})
    if(action==='turn.accept')return ok(ready)
    if(action==='turn.execute')return ok(queued(id))
    if(action==='turn.stop')return ok({turn_id:id,permission_revoked:true,worker_exited:null,tasks:[]})
    if(action==='turn.fail-generation')return bad('stale_generation')
  }}
  const runner=createTurnRunner({host,provider})
  runner.subscribe(s=>{if(s.phase==='executing'&&s.hostPending===1&&!entered){entered=true;stopped=runner.stop()}})
  await runner.run({turnId:id});await stopped;await runner.whenIdle()
  assert.equal(calls.includes('turn.execute'),false);runner.dispose()
})

for(const stage of ['turn.begin','turn.accept','turn.execute'])test(`${stage} internal_error remains uncertain instead of admitting another run`,async()=>{
  const id=uuid(),calls=[]
  const host={request(action,p){calls.push(action)
    if(action===stage)return bad('internal_error')
    if(action==='turn.begin')return ok({turn_id:p.turn_id,ticket:uuid()})
    if(action==='turn.accept')return ok({id:p.turn_id,state:'actions_ready',actions:[{id:uuid(),kind:'csv.audit',state:'ready'}]})
    throw Error(action)
  }}
  const runner=createTurnRunner({host,provider})
  await runner.run({turnId:id});assert.equal(runner.snapshot().needsReconciliation,true)
  assert.equal((await runner.run({turnId:uuid()})).error,'reconciliation_required')
  assert.equal(calls.includes('turn.fail-generation'),false);runner.dispose()
})

test('definite invalid followup window ends only the owned generation',async()=>{
  const id=uuid(),ticket=uuid(),calls=[]
  const host={request(action,p){calls.push({action,p})
    if(action==='turn.begin')return ok({turn_id:id,ticket})
    if(action==='turn.accept')return bad('invalid_followup_window')
    if(action==='turn.fail-generation')return ok({id,state:'model_failed',error:p.reason})
  }}
  const runner=createTurnRunner({host,provider});const reply=await runner.run({turnId:id})
  assert.equal(reply.error,'invalid_followup_window')
  assert.equal(calls.filter(c=>c.action==='turn.fail-generation').length,1)
  assert.equal(calls.at(-1).p.ticket,ticket);runner.dispose()
})

for(const mode of ['run','local'])test(`${mode} final malformed turn cannot be reported as settled`,async()=>{
  const id=uuid(),ticket=uuid(),task=queued(id);let reads=0
  const host={request(action){
    if(action==='turn.begin')return ok({turn_id:id,ticket})
    if(action==='turn.accept')return ok({id,state:'actions_ready',actions:[{id:uuid(),kind:'csv.audit',state:'ready'}]})
    if(action==='turn.execute')return ok(task)
    if(action==='worker.run-next')return ok(null)
    if(action==='turn.read')return ok(mode==='local'&&++reads===1?task:{id,state:'invented',actions:[]})
  }}
  const runner=createTurnRunner({host,provider})
  const reply=await (mode==='run'?runner.run({turnId:id}):runner.runLocalOnce({turnId:id}))
  assert.equal(reply.error,'protocol_error');assert.equal(runner.snapshot().needsReconciliation,true)
  runner.dispose()
})

test('stop receipt with unknown task cancellation remains visible and blocks new work',async()=>{
  const id=uuid(),held=defer()
  const host={request(action,p){
    if(action==='turn.begin')return ok({turn_id:id,ticket:uuid()})
    if(action==='turn.stop')return ok({turn_id:id,permission_revoked:true,worker_exited:null,
      tasks:[{task_id:null,needs_reconciliation:true,cancel_requested:false}]})
    if(action==='turn.fail-generation')return ok({id,state:'model_failed',error:p.reason})
  }}
  const runner=createTurnRunner({host,provider:{configured:true,respond:()=>held.promise}})
  const running=runner.run({turnId:id});await flush();const stopped=await runner.stop()
  held.resolve({decision:{reply:'late'}});await running;await runner.whenIdle()
  assert.equal(stopped.result.needsReconciliation,true)
  assert.equal(runner.snapshot().needsReconciliation,true)
  assert.equal((await runner.run({turnId:uuid()})).error,'reconciliation_required');runner.dispose()
})

test('disposed snapshot counters reflect actual provider and host settlement',async()=>{
  const id=uuid(),held=defer()
  const host={request(action,p){return action==='turn.begin'?ok({turn_id:id,ticket:uuid()}):
    ok({id,state:'model_failed',error:p.reason})}}
  const runner=createTurnRunner({host,provider:{configured:true,respond:()=>held.promise}})
  const running=runner.run({turnId:id});await flush();runner.dispose()
  assert.equal(runner.snapshot().providerPending,true)
  held.resolve({decision:{reply:'late'}});await running;await runner.whenIdle()
  assert.equal(runner.snapshot().providerPending,false);assert.equal(runner.snapshot().hostPending,0)
})

test('uncertain begin arriving after disposal is retained without inventing a ticket',async()=>{
  const id=uuid(),held=defer(),calls=[]
  const host={request(action){calls.push(action);return held.promise}}
  const runner=createTurnRunner({host,provider})
  const running=runner.run({turnId:id});await flush();runner.dispose()
  held.resolve(bad('internal_error'));await running;await runner.whenIdle()
  assert.equal(runner.snapshot().needsReconciliation,true)
  assert.deepEqual(calls,['turn.begin'])
})

test('local worker success followed by failed readback requires reconciliation',async()=>{
  const id=uuid();let reads=0
  const host={request(action){
    if(action==='turn.read')return ++reads===1?ok(queued(id)):bad('transport_unavailable')
    if(action==='worker.run-next')return ok(null)
  }}
  const runner=createTurnRunner({host})
  assert.equal((await runner.runLocalOnce({turnId:id})).error,'transport_unavailable')
  assert.equal(runner.snapshot().needsReconciliation,true)
  assert.equal(runner.snapshot().phase,'needs_reconciliation');runner.dispose()
})

test('readback reentry is single flight and an observed unknown cannot enable new work',async()=>{
  const {id,read,calls,runner}=await completedWithHeldRead();let nested
  runner.subscribe(s=>{if(s.hostPending && !nested)nested=runner.reconcile()})
  const first=runner.reconcile();await flush();assert.strictEqual(nested,first)
  read.resolve(ok({id,state:'outcome_unknown',actions:[]}));await first
  assert.equal(calls.filter(a=>a==='turn.read').length,1)
  assert.equal(runner.snapshot().needsReconciliation,true)
  assert.equal((await runner.run({turnId:uuid()})).error,'reconciliation_required');runner.dispose()
})

test('real invalid followup window rolls back suggestions and closes the owned generation',async()=>{
  const workspace=path.resolve(fileURLToPath(new URL('../../..',import.meta.url)))
  const python=resolveRuntime('python')
  const parent=path.join(workspace,'.test-data');await fs.mkdir(parent,{recursive:true})
  const dataRoot=await fs.mkdtemp(path.join(parent,'core-004-architect-'))
  const host=createProductHost({python,workspace,dataRoot})
  const good=async(action,p={})=>{const reply=await host.request(action,p)
    assert.equal(reply.ok,true,JSON.stringify(reply));return reply.result}
  const runner=createTurnRunner({host,provider:{configured:true,respond:()=>({decision:{
    reply:'Synthetic response',memories:[{category:'work',content:'Fictional preference'}],
    followup:{topic:'work',purpose:'Synthetic followup',
      due_at:'2000-01-01T00:00:00Z',expires_at:'2000-01-02T00:00:00Z'}}})}})
  try{
    await good('bootstrap')
    const policy=await good('policy.read')
    await good('policy.replace',{expected_revision:policy.revision,policy:{...policy,proactive_enabled:true}})
    const turn=await good('turn.submit',{turn:{command_id:uuid(),conversation_id:uuid(),text:'Fictional input'}})
    assert.equal((await runner.run({turnId:turn.id})).error,'invalid_followup_window')
    const persisted=await good('turn.read',{turn_id:turn.id})
    assert.equal(persisted.state,'model_failed');assert.equal(persisted.error,'provider_invalid_output')
    assert.deepEqual(persisted.actions,[])
    assert.deepEqual(await good('contact.inspect'),[])
    assert.deepEqual(await good('memory.list'),[])
  }finally{runner.dispose();await runner.whenIdle();await host.dispose()}
})
