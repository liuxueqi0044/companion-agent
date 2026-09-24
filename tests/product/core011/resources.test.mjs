import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {setup,input,decision,deferred} from './helpers.mjs'
import {createInterfaceSession} from '../../../apps/desktop/product/interface/session.mjs'

test('resource reads observe two completed tasks without changing either view selection',async()=>{
  const x=await setup();let a,b
  try{
    const first=input(),second=input();await x.runtime.send(first);await x.runtime.send(second)
    a=await createInterfaceSession({runtime:x.runtime});b=await createInterfaceSession({runtime:x.runtime})
    await a.call('open',{panel:'conversation',turnId:first.command_id});await b.call('open',{panel:'conversation',turnId:second.command_id})
    for(const i of [first,second]){
      const r=await x.runtime.resources.turn({turnId:i.command_id});assert.equal(r.ok,true)
      const t=r.result.actions[0].task,binding={turnId:i.command_id,taskId:t.task_id,attemptId:t.current_attempt_id}
      const result=await x.runtime.resources.result(binding)
      assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.result.metadata.total,'6')
      assert.equal((await x.runtime.resources.task({...binding,attemptId:randomUUID()})).error,'stale_attempt')
      assert.equal((await x.runtime.resources.task({...binding,turnId:i===first?second.command_id:first.command_id})).error,'task_not_owned_by_turn')
    }
    await a.call('conversation.turns',{id:second.conversation_id})
    assert.equal(a.snapshot().conversation.selectedTurnId,first.command_id)
    assert.equal(b.snapshot().conversation.selectedTurnId,second.command_id)
    await a.call('open',{panel:'memory'})
    assert.equal(b.snapshot().panel,'conversation')
    assert.doesNotMatch(JSON.stringify(b.snapshot()),/csv_text|input_hash|"ticket"/)
  }finally{a?.dispose();b?.dispose();await x.close()}
})

test('unmount does not stop in-flight work; another interface reads its durable result',async()=>{
  const entered=deferred(),held=deferred(),x=await setup({configured:true,respond(){entered.resolve();return held.promise}})
  let a,b
  try{
    a=await createInterfaceSession({runtime:x.runtime});const i=input(),flight=a.call('send',i)
    await entered.promise;const runId=x.runtime.resources.execution().runId
    a.dispose();assert.equal(x.runtime.snapshot().runtime.executionBusy,true)
    b=await createInterfaceSession({runtime:x.runtime});await b.call('open',{panel:'memory'})
    assert.equal((await b.call('work.stop',{turnId:randomUUID(),runId})).error,'not_owned_run')
    assert.equal((await b.call('work.stop',{turnId:i.command_id,runId:randomUUID()})).error,'not_owned_run')
    held.resolve(decision);await flight;await x.runtime.whenIdle()
    const r=await b.call('turn.read',{turnId:i.command_id})
    assert.equal(r.result.actions[0].task.status,'completed')
    assert.equal((await a.call('send',input())).error,'interface_revoked')
  }finally{held.resolve(decision);a?.dispose();b?.dispose();await x.close()}
})

test('explicit run binding stops the owned run from a different view and stale run IDs are rejected',async()=>{
  const entered=deferred(),held=deferred(),x=await setup({configured:true,respond(){entered.resolve();return held.promise}})
  let a,b
  try{
    a=await createInterfaceSession({runtime:x.runtime});b=await createInterfaceSession({runtime:x.runtime})
    const i=input(),flight=a.call('send',i);await entered.promise
    const runId=x.runtime.resources.execution().runId
    await b.call('open',{panel:'memory'})
    const stopped=await b.call('work.stop',{turnId:i.command_id,runId})
    assert.equal(stopped.ok,true,JSON.stringify(stopped))
    held.resolve(decision);await flight;await x.runtime.whenIdle()
    assert.equal((await x.runtime.resources.turn({turnId:i.command_id})).result.state,'cancelled')
    const next=input();await b.call('send',next)
    assert.equal((await b.call('work.stop',{turnId:next.command_id,runId})).error,'not_owned_run')
  }finally{held.resolve(decision);a?.dispose();b?.dispose();await x.close()}
})

test('an interface cannot elevate its scopes with generic command names or panel navigation',async()=>{
  const x=await setup();let view
  try{
    view=await createInterfaceSession({runtime:x.runtime,scopes:['tasks']})
    assert.equal((await view.call('send',input())).error,'scope_denied')
    assert.equal((await view.call('open',{panel:'memory'})).error,'scope_denied')
    assert.equal((await view.call('host.request',{action:'turn.begin'})).error,'invalid_request')
    assert.equal((await view.call('work.start',{turnId:randomUUID()})).error,'scope_denied')
    assert.equal(view.snapshot().memory,null);assert.equal(view.snapshot().conversation,null)
  }finally{view?.dispose();await x.close()}
})
