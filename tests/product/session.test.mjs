import test from 'node:test'
import assert from 'node:assert/strict'
import { createProductSession } from '../../apps/desktop/product/session.mjs'

const deferred = () => {
  let resolve
  const promise = new Promise(r => { resolve = r })
  return {promise,resolve}
}
const ok = result => ({ok:true,result})
const fail = code => ({ok:false,error:{code}})
const turn = (id, conversation_id = 'conversation') => ({id,conversation_id,text:`text-${id}`,
  reply:'reply',state:'responded',actions:[],ticket:'SECRET_TICKET',grants:['csv.audit'],
  due_at:'SECRET_PLAN_TIME'})

test('A late success and failure cannot replace selected B or enable stopping B while loading', async () => {
  for (const late of [ok(turn('A')),fail('internal_error')]) {
    const a = deferred(), b = deferred(), calls = []
    const host = {request(action,payload) {
      calls.push([action,payload]); return action === 'turn.read' && payload.turn_id === 'A' ? a.promise : b.promise
    }}
    const session = createProductSession({host})
    const first = session.selectTurn('A')
    const second = session.selectTurn('B')
    assert.equal(session.snapshot().turn,null)
    assert.equal((await session.stopSelected()).error,'selection_not_ready')
    a.resolve(late)
    assert.equal((await first).error,'stale_view')
    assert.equal(session.snapshot().selectedTurnId,'B')
    assert.equal(session.snapshot().loading,true)
    b.resolve(ok(turn('B')))
    assert.equal((await second).result.id,'B')
    assert.equal(session.snapshot().turn.id,'B')
    assert.deepEqual(calls.map(([action]) => action),['turn.read','turn.read'])
  }
})

test('stop freezes A command across view switch, refresh and retry', async () => {
  const stop = deferred(), refresh = deferred(), calls = []
  let readsOfA = 0
  const host = {request(action,payload) {
    calls.push([action,payload])
    if (action === 'turn.stop') return stop.promise
    if (action === 'turn.read' && payload.turn_id === 'A' && ++readsOfA === 3) return refresh.promise
    return Promise.resolve(ok(turn(payload.turn_id)))
  }}
  const session = createProductSession({host})
  await session.selectTurn('A')
  const stopping = session.stopSelected()
  await session.selectTurn('B')
  stop.resolve(ok({permission_revoked:true,tasks:[],cancel_command_id:'SECRET_COMMAND'}))
  assert.equal((await stopping).result.permission_revoked,true)
  assert.equal(session.snapshot().turn.id,'B')
  assert.equal(session.snapshot().stop,null)
  assert.equal(calls.find(([action]) => action === 'turn.stop')[1].turn_id,'A')
  assert.doesNotMatch(JSON.stringify(session.snapshot()),/SECRET_COMMAND|SECRET_TICKET|SECRET_PLAN_TIME/)
  await session.selectTurn('A')
  const pending = session.refreshSelected()
  await session.selectTurn('B')
  refresh.resolve(ok(turn('A')))
  assert.equal((await pending).error,'stale_view')
  assert.equal(session.snapshot().turn.id,'B')
})

test('unknown submit reuses exactly the original request; default capabilities empty', async () => {
  const sent = []
  let first = true
  const host = {request(action,payload) {
    sent.push([action,payload])
    if (first) { first = false; return Promise.resolve(fail('outcome_unknown')) }
    return Promise.resolve(ok(turn(payload.turn.command_id,payload.turn.conversation_id)))
  }}
  const session = createProductSession({host})
  assert.equal((await session.submitTurn({text:'real input',csv_text:'a,b\n1,2'})).error,'outcome_unknown')
  assert.equal(session.snapshot().submitUnknown,true)
  assert.equal((await session.replaySubmit()).ok,true)
  assert.deepEqual(sent[0],sent[1])
  assert.deepEqual(sent[0][1].capabilities,[])
  assert.equal(session.snapshot().submitUnknown,false)
  assert.doesNotMatch(JSON.stringify(session.snapshot()),/csv_text|capabilities/)
  assert.equal((await session.submitTurn({text:'x',capabilities:['csv.audit']})).error,'invalid_request')
})

test('loading, stale list and dispose never call shared host disposal or listeners late', async () => {
  const one = deferred(), two = deferred(), calls = []
  const host = {request(_action,payload) {calls.push(payload); return calls.length === 1 ? one.promise : two.promise},
    dispose() { throw Error('shared_host_must_survive') }}
  const session = createProductSession({host})
  const seen = []
  session.subscribe(value => seen.push(value))
  const old = session.loadConversations()
  const current = session.loadConversations()
  one.resolve(ok({items:[{conversation_id:'old'}],snapshot:1,next_before:null}))
  assert.equal((await old).error,'stale_view')
  two.resolve(ok({items:[{conversation_id:'new',raw_csv:'SECRET'}],snapshot:2,next_before:null}))
  await current
  assert.equal(session.snapshot().conversations[0].conversation_id,'new')
  assert.doesNotMatch(JSON.stringify(session.snapshot()),/SECRET/)
  session.dispose()
  const count = seen.length
  assert.equal((await session.loadConversations()).error,'disposed')
  assert.equal(seen.length,count)
})
