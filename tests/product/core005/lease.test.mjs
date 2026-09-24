import test from 'node:test'
import assert from 'node:assert/strict'
import {registerExecutionOwner} from '../../../apps/desktop/product/execution/lease.mjs'
import {createTurnRunner} from '../../../apps/desktop/product/execution/runner.mjs'

test('same host has one owner per role and one shared slot without construction I/O',()=>{
  let calls=0
  const host={request(){calls++}}
  const turn=registerExecutionOwner(host,'turn')
  const contact=registerExecutionOwner(host,'contact')
  assert.equal(calls,0)
  assert.throws(()=>registerExecutionOwner(host,'turn'),/runner_owned/)
  assert.throws(()=>registerExecutionOwner(host,'contact'),/runner_owned/)
  const first=turn.claim()
  assert.equal(first.ok,true)
  assert.equal(contact.claim().error,'runner_busy')
  turn.dispose()
  assert.throws(()=>registerExecutionOwner(host,'turn'),/runner_owned/)
  first.lease.release()
  const replacement=registerExecutionOwner(host,'turn')
  const second=contact.claim()
  assert.equal(second.ok,true)
  assert.equal(replacement.claim().error,'runner_busy')
  second.lease.release();contact.dispose();replacement.dispose()
  assert.equal(calls,0)
})

test('unknown writes fence both roles after owner disposal; read-only lease cannot clear them',()=>{
  const host={request(){throw new Error('inert')}}
  const turn=registerExecutionOwner(host,'turn')
  const contact=registerExecutionOwner(host,'contact')
  turn.markUnknown()
  assert.equal(contact.claim().error,'reconciliation_required')
  const read=contact.claim({readOnly:true})
  assert.equal(read.ok,true)
  assert.equal(turn.claim({readOnly:true}).error,'runner_busy')
  read.lease.release()
  turn.dispose();contact.dispose()
  const reopened=registerExecutionOwner(host,'contact')
  assert.equal(reopened.claim().error,'reconciliation_required')
  reopened.dispose()
})

test('an owned turn runner also fences a separate contact lease',async()=>{
  const host={request(){throw new Error('should not send')}}
  const turn=createTurnRunner({host})
  const contact=registerExecutionOwner(host,'contact')
  assert.equal((await turn.run({turnId:'not-a-uuid'})).error,'invalid_request')
  const first=contact.claim()
  assert.equal(first.ok,true)
  assert.equal((await turn.runLocalOnce({turnId:'22f21e5e-0d03-487b-acd4-93a5afe99667'})).error,'runner_busy')
  first.lease.release();turn.dispose();contact.dispose()
})
