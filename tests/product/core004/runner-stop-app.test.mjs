import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {createTurnRunner} from '../../../apps/desktop/product/execution/runner.mjs'
import {createProductApplication} from '../../../apps/desktop/product/application/index.mjs'

const ok=result=>({ok:true,result})
const bad=code=>({ok:false,error:{code}})
const defer=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}}
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()}
const until=async predicate=>{for(let i=0;i<80&&!predicate();i++)await Promise.resolve()
  assert.equal(predicate(),true,'expected stage not reached')}
const policy={revision:1,memory_enabled:true,memory_categories:['work','preferences','goals'],
  proactive_enabled:false,timezone:'UTC',start_minute:540,end_minute:1260,daily_limit:1,
  daily_evaluation_limit:3,topics:['work','daily','wellbeing'],paused_until:null}
const home={profile:{profile_id:randomUUID(),revision:1,preferences:{ai_name:'AI',address_user_as:'friend'}},
  policy,unread_count:0,experience_revision:1,model_status:'not_configured',
  runtime:'local_device',native_isolation:'not_run'}

test('stop before begin returns cannot start provider; ticket cleanup remains narrow',async()=>{
  const id=randomUUID(),ticket=randomUUID(),held=defer(),calls=[]
  let generated=0
  const host={request(action,payload){calls.push({action,payload})
    if(action==='turn.begin')return held.promise
    if(action==='turn.stop')return ok({turn_id:id,permission_revoked:true,worker_exited:null,tasks:[]})
    if(action==='turn.fail-generation')return bad('stale_generation')
    throw new Error(action)}}
  const runner=createTurnRunner({host,provider:{configured:true,respond(){generated++}}})
  const running=runner.run({turnId:id});await flush()
  const stopped=await runner.stop()
  assert.equal(stopped.result.permissionRevoked,true)
  assert.equal(stopped.result.workerExited,null)
  held.resolve(ok({turn_id:id,ticket}));assert.equal((await running).error,'provider_aborted')
  await runner.whenIdle()
  assert.equal(generated,0)
  assert.equal(calls.filter(item=>item.action==='turn.fail-generation').length,1)
  runner.dispose()
})

for(const stage of ['turn.accept','turn.execute','worker.run-next'])
  test(`stop while ${stage} is pending never starts the next stage`,async()=>{
    const id=randomUUID(),ticket=randomUUID(),held=defer(),calls=[]
    const action={id:randomUUID(),kind:'csv.audit',state:stage==='turn.accept'?'ready':'accepted',
      task:{task_id:randomUUID(),current_attempt_id:randomUUID(),status:'queued',attempt_count:0}}
    const host={request(name,payload){calls.push({name,payload})
      if(name===stage)return held.promise
      if(name==='turn.begin')return ok({turn_id:id,ticket})
      if(name==='turn.accept')return ok({id,state:'actions_ready',actions:[{...action,state:'ready'}]})
      if(name==='turn.execute')return ok({id,state:'actions_recorded',actions:[action]})
      if(name==='turn.stop')return ok({turn_id:id,permission_revoked:true,worker_exited:null,tasks:[]})
      if(name==='turn.fail-generation')return bad('stale_generation')
      if(name==='turn.read')return ok({id,state:'actions_recorded',actions:[action]})
      throw new Error(name)}}
    const runner=createTurnRunner({host,provider:{configured:true,respond:()=>({
      decision:{reply:'x',actions:[{kind:'csv.audit'}]}})}})
    const running=runner.run({turnId:id})
    await until(()=>calls.some(item=>item.name===stage))
    const stopping=runner.stop()
    assert.strictEqual(runner.stop(),stopping)
    assert.equal((await stopping).result.workerExited,null)
    held.resolve(stage==='turn.accept' ? ok({id,state:'actions_ready',actions:[{...action,state:'ready'}]}) :
      stage==='turn.execute' ? ok({id,state:'actions_recorded',actions:[action]}) : ok({status:'completed'}))
    assert.equal((await running).error,'provider_aborted')
    await runner.whenIdle()
    assert.equal(calls.some(item=>item.name==='turn.read'),false)
    if(stage==='turn.accept')assert.equal(calls.some(item=>item.name==='turn.execute'),false)
    if(stage==='turn.execute')assert.equal(calls.some(item=>item.name==='worker.run-next'),false)
    runner.dispose()
  })

test('A running while B is selected stays with A; app disposal leaves runner and host owned outside',async()=>{
  const a=randomUUID(),b=randomUUID(),conv=randomUUID(),ticket=randomUUID(),held=defer(),calls=[]
  const turn=id=>({id,conversation_id:conv,text:'fictional',state:'queued',actions:[]})
  const host={request(action,payload){calls.push(action)
    if(action==='bootstrap')return ok(home)
    if(action==='policy.read')return ok(policy)
    if(action==='turn.read')return ok(turn(payload.turn_id))
    if(action==='turn.begin')return ok({turn_id:a,ticket})
    if(action==='turn.accept')return ok({id:a,state:'responded',actions:[]})
    if(action==='turn.fail-generation')return ok({id:a,state:'model_failed',error:payload.reason})
    throw new Error(action)}}
  const runner=createTurnRunner({host,provider:{configured:true,respond:()=>held.promise}})
  const app=createProductApplication({host,runner})
  await app.initialize();await app.open({panel:'conversation',turnId:a})
  const run=app.work.startSelected();await flush()
  assert.equal(app.work.snapshot().selected,true)
  await app.open({panel:'conversation',turnId:b})
  assert.deepEqual(app.work.snapshot(),{available:true,selected:false})
  assert.equal((await app.work.stopSelected()).error,'not_owned_turn')
  held.resolve({decision:{reply:'A replied'}})
  assert.equal((await run).ok,true)
  assert.deepEqual(app.work.snapshot(),{available:true,selected:false})
  assert.equal(app.snapshot().conversation.turn.id,b)
  app.dispose()
  assert.equal((await runner.reconcile()).ok,true)
  runner.dispose();await runner.whenIdle()
  assert.equal(calls.includes('turn.stop'),false)
})

test('ordinary app navigation with no runner is inert',async()=>{
  const id=randomUUID(),calls=[]
  const host={request(action,payload){calls.push(action)
    if(action==='bootstrap')return ok(home)
    if(action==='policy.read')return ok(policy)
    if(action==='turn.read')return ok({id,conversation_id:randomUUID(),state:'queued',actions:[]})
    return ok(home)}}
  const app=createProductApplication({host})
  await app.initialize();await app.open({panel:'conversation',turnId:id})
  assert.equal((await app.work.startSelected()).error,'model_not_configured')
  assert.equal(calls.includes('turn.begin'),false)
  assert.equal(calls.includes('worker.run-next'),false)
  app.dispose()
})
