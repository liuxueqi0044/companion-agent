import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {createTurnRunner} from '../../../apps/desktop/product/execution/runner.mjs'

const ok=result=>({ok:true,result})
const bad=code=>({ok:false,error:{code}})
const decision={decision:{reply:'Fictional response',actions:[{kind:'csv.audit'}]}}

test('unknown begin has no ticket, provider or cleanup; reconcile stays read-only',async()=>{
  const id=randomUUID(),actions=[],host={request(action){actions.push(action)
    return action==='turn.begin' ? bad('outcome_unknown') : ok({id,state:'queued',actions:[]})}}
  let generated=0
  const runner=createTurnRunner({host,provider:{configured:true,respond(){generated++}}})
  assert.equal((await runner.run({turnId:id})).error,'outcome_unknown')
  assert.equal(runner.snapshot().needsReconciliation,true)
  assert.equal(generated,0)
  assert.equal((await runner.reconcile()).ok,true)
  assert.equal(runner.snapshot().needsReconciliation,true)
  assert.deepEqual(actions,['turn.begin','turn.read'])
  runner.dispose()
})

test('wrong begin target never reaches provider',async()=>{
  const id=randomUUID(),actions=[]
  const host={request(action){actions.push(action);return ok({turn_id:randomUUID(),ticket:randomUUID()})}}
  let sends=0
  const runner=createTurnRunner({host,provider:{configured:true,respond(){sends++}}})
  assert.equal((await runner.run({turnId:id})).error,'protocol_error')
  assert.deepEqual(actions,['turn.begin'])
  assert.equal(sends,0)
  runner.dispose()
})

test('failed or invalid provider output is narrowed to its own ticket once',async()=>{
  for(const [respond,reason] of [[()=>{throw new Error('private_failure')},'provider_failed'],
    [()=>({decision:{reply:'x'},provider_summary:'forged'}),'provider_invalid_output']]){
    const id=randomUUID(),ticket=randomUUID(),actions=[]
    const host={request(action,payload){actions.push({action,payload})
      if(action==='turn.begin')return ok({turn_id:id,ticket})
      if(action==='turn.fail-generation')return ok({id,state:'model_failed',error:payload.reason})
      throw new Error('unexpected '+action)}}
    const runner=createTurnRunner({host,provider:{configured:true,respond}})
    assert.equal((await runner.run({turnId:id})).error,reason)
    assert.equal(runner.snapshot().phase,'failed')
    assert.deepEqual(actions.map(item=>item.action),['turn.begin','turn.fail-generation'])
    assert.deepEqual(actions[1].payload,{turn_id:id,ticket,reason})
    assert.doesNotMatch(JSON.stringify(runner.snapshot()),/private_failure|ticket/)
    runner.dispose()
  }
})

test('uncertain accept is never replayed or executed, even when read sees actions ready',async()=>{
  const id=randomUUID(),ticket=randomUUID(),actions=[]
  const host={request(action){actions.push(action)
    if(action==='turn.begin')return ok({turn_id:id,ticket})
    if(action==='turn.accept')return bad('outcome_unknown')
    if(action==='turn.read')return ok({id,state:'actions_ready',actions:[{id:randomUUID(),kind:'csv.audit',state:'ready'}]})
    throw new Error('unexpected '+action)}}
  const runner=createTurnRunner({host,provider:{configured:true,respond:()=>decision}})
  assert.equal((await runner.run({turnId:id})).error,'outcome_unknown')
  assert.equal((await runner.reconcile()).ok,true)
  assert.equal((await runner.runLocalOnce({turnId:id})).error,'reconciliation_required')
  assert.deepEqual(actions,['turn.begin','turn.accept','turn.read'])
  runner.dispose()
})

test('wrong accept target, malformed ready action and unknown execute never advance work',async()=>{
  for(const defect of ['foreign_target','bad_action','unknown_execute']){
    const id=randomUUID(),ticket=randomUUID(),calls=[]
    const validAction={id:randomUUID(),kind:'csv.audit',state:'ready'}
    const host={request(action){calls.push(action)
      if(action==='turn.begin')return ok({turn_id:id,ticket})
      if(action==='turn.accept')return ok({id:defect==='foreign_target'?randomUUID():id,
        state:'actions_ready',actions:[defect==='bad_action' ? {...validAction,id:'bad'} : validAction]})
      if(action==='turn.execute')return bad('outcome_unknown')
      throw new Error('unexpected '+action)}}
    const runner=createTurnRunner({host,provider:{configured:true,respond:()=>decision}})
    assert.equal((await runner.run({turnId:id})).error,
      defect==='unknown_execute'?'outcome_unknown':'protocol_error')
    assert.equal(runner.snapshot().needsReconciliation,true)
    assert.equal(calls.includes('worker.run-next'),false)
    assert.equal(calls.includes('turn.read'),false)
    if(defect!=='unknown_execute')assert.equal(calls.includes('turn.execute'),false)
    runner.dispose()
  }
})

test('worker may process another queued task; one local advance never claims this task completed',async()=>{
  const id=randomUUID(),taskId=randomUUID(),attemptId=randomUUID(),actionId=randomUUID(),calls=[]
  const queued={id,state:'actions_recorded',actions:[{id:actionId,kind:'csv.audit',state:'accepted',
    task:{task_id:taskId,current_attempt_id:attemptId,status:'queued',attempt_count:0}}]}
  const host={request(action){calls.push(action)
    if(action==='turn.read')return ok(queued)
    if(action==='worker.run-next')return ok({task_id:randomUUID(),status:'completed'})
    throw new Error('unexpected '+action)}}
  const runner=createTurnRunner({host})
  const first=await runner.runLocalOnce({turnId:id})
  assert.equal(first.result.phase,'waiting_for_worker')
  assert.equal(first.result.activity.taskStatus,'queued')
  assert.deepEqual(calls,['turn.read','worker.run-next','turn.read'])
  runner.dispose()
})

test('local advance needs a queued task; worker unknown cannot be reported complete',async()=>{
  const id=randomUUID(),ticket=randomUUID(),taskId=randomUUID(),attemptId=randomUUID()
  const action={id:randomUUID(),kind:'csv.audit',state:'accepted',
    task:{task_id:taskId,current_attempt_id:attemptId,status:'queued',attempt_count:0}}
  const calls=[]
  const host={request(name){calls.push(name)
    if(name==='turn.read')return ok({id,state:'actions_recorded',actions:[action]})
    if(name==='worker.run-next')return bad('outcome_unknown')
    throw new Error(name)}}
  const runner=createTurnRunner({host})
  assert.equal((await runner.runLocalOnce({turnId:id})).error,'outcome_unknown')
  assert.equal(runner.snapshot().needsReconciliation,true)
  assert.deepEqual(calls,['turn.read','worker.run-next'])
  runner.dispose()
  const noTaskHost={request:()=>ok({id,state:'responded',actions:[]})}
  const noTaskRunner=createTurnRunner({host:noTaskHost})
  assert.equal((await noTaskRunner.runLocalOnce({turnId:id})).error,'no_queued_task')
  noTaskRunner.dispose()
})
