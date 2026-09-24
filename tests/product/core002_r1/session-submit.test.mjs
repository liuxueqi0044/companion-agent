import test from 'node:test'
import assert from 'node:assert/strict'
import { createProductSession } from '../../../apps/desktop/product/session.mjs'

const deferred = () => {
  let resolve
  const promise = new Promise(r => { resolve = r })
  return {promise,resolve}
}
const ok = payload => ({ok:true,result:{id:payload.turn.command_id,
  conversation_id:payload.turn.conversation_id,text:payload.turn.text,state:'queued',actions:[]}})
const fail = code => ({ok:false,error:{code}})

test('overlapping replay A is single flight; its receipt cannot clear later unknown B', async () => {
  const heldA = deferred(), sent = []
  let call = 0
  const host = {request(_action,payload) {
    sent.push(structuredClone(payload)); call++
    if (call === 1) return Promise.resolve(fail('outcome_unknown'))
    if (call === 2) return heldA.promise
    if (call === 3) return Promise.resolve(fail('outcome_unknown'))
    return Promise.resolve(ok(payload))
  }}
  const session = createProductSession({host})
  assert.equal((await session.submitTurn({text:'A'})).error,'outcome_unknown')
  const one = session.replaySubmit(), two = session.replaySubmit()
  assert.equal(sent.length,2)
  heldA.resolve(ok(sent[1]))
  assert.equal((await one).ok,true)
  assert.equal((await two).ok,true)
  assert.equal(sent.length,2)
  assert.equal((await session.submitTurn({text:'B',csv_text:'private,b\n1,2'})).error,'outcome_unknown')
  assert.equal(session.snapshot().submitUnknown,true)
  assert.equal((await session.replaySubmit()).ok,true)
  assert.deepEqual(sent[2],sent[3])
  assert.notEqual(sent[1].turn.command_id,sent[3].turn.command_id)
  assert.equal(session.snapshot().submitUnknown,false)
})

test('wrong success ID or conversation leaves original submission unknown', async () => {
  const sent = []
  const host = {request(_action,payload) {
    sent.push(structuredClone(payload))
    if (sent.length === 1) return Promise.resolve(fail('outcome_unknown'))
    if (sent.length === 2) return Promise.resolve(ok({...payload,turn:{...payload.turn,command_id:'wrong'}}))
    if (sent.length === 3) return Promise.resolve(ok({...payload,turn:{...payload.turn,conversation_id:'wrong'}}))
    return Promise.resolve(ok(payload))
  }}
  const session = createProductSession({host})
  await session.submitTurn({text:'original'})
  assert.equal((await session.replaySubmit()).error,'outcome_unknown')
  assert.equal((await session.replaySubmit()).error,'outcome_unknown')
  assert.equal(session.snapshot().submitUnknown,true)
  assert.equal((await session.submitTurn({text:'new'})).error,'submit_pending_reconciliation')
  assert.equal((await session.replaySubmit()).ok,true)
  assert.ok(sent.every(item => item.turn.command_id === sent[0].turn.command_id))
})

test('definite input failure clears only its record; transport uncertainty keeps data and grants', async () => {
  const sent = [], capabilities = ['csv.audit']
  let call = 0
  const host = {request(_action,payload) {
    sent.push(structuredClone(payload)); call++
    if (call === 1) return Promise.resolve(fail('invalid_request'))
    if (call === 2) return Promise.resolve(fail('transport_unavailable'))
    return Promise.resolve(ok(payload))
  }}
  const session = createProductSession({host,intent:()=>capabilities})
  assert.equal((await session.submitTurn({text:'bad'})).error,'invalid_request')
  assert.equal(session.snapshot().submitUnknown,false)
  const input = {text:'original',csv_text:'secret,amount\na,7'}
  assert.equal((await session.submitTurn(input)).error,'transport_unavailable')
  input.text = 'mutated'; input.csv_text = 'changed'; capabilities.pop()
  assert.equal(session.snapshot().submitUnknown,true)
  assert.equal((await session.replaySubmit()).ok,true)
  assert.deepEqual(sent[1],sent[2])
  assert.equal(sent[2].turn.text,'original')
  assert.equal(sent[2].turn.csv_text,'secret,amount\na,7')
  assert.deepEqual(sent[2].capabilities,['csv.audit'])
  assert.doesNotMatch(JSON.stringify(session.snapshot()),/secret,amount|capabilities|ticket/)
})

test('dispose ignores late submit receipt without closing shared host or notifying listeners', async () => {
  const pending = deferred()
  const host = {request() { return pending.promise }, dispose() { throw Error('shared host') }}
  const session = createProductSession({host})
  const seen = []
  session.subscribe(value => seen.push(value))
  const submitted = session.submitTurn({text:'private'})
  session.dispose()
  const count = seen.length
  pending.resolve(fail('outcome_unknown'))
  assert.equal((await submitted).error,'disposed')
  assert.equal(seen.length,count)
})
