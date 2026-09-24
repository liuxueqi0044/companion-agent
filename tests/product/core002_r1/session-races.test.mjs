import test from 'node:test'
import assert from 'node:assert/strict'
import { createProductSession } from '../../../apps/desktop/product/session.mjs'

const deferred = () => {
  let resolve
  const promise = new Promise(r => { resolve = r })
  return {promise,resolve}
}
const ok = result => ({ok:true,result})
const fail = code => ({ok:false,error:{code}})
const view = state => ({id:'A',conversation_id:'conversation',text:'fixture',reply:'reply',state,actions:[]})

test('same target newest refresh owns success and error in all response orders', async () => {
  for (const [older,newer,expectedState,expectedError] of [
    [ok(view('actions_ready')),ok(view('cancelled')),'cancelled',null],
    [fail('transport_unavailable'),ok(view('cancelled')),'cancelled',null],
    [ok(view('actions_ready')),fail('transport_unavailable'),'queued','transport_unavailable'],
  ]) {
    const requests = []
    const host = {request() {
      if (requests.length === 0) { requests.push(null); return Promise.resolve(ok(view('queued'))) }
      const item = deferred(); requests.push(item); return item.promise
    }}
    const session = createProductSession({host})
    await session.selectTurn('A')
    const first = session.refreshSelected()
    const second = session.refreshSelected()
    requests[2].resolve(newer)
    await second
    assert.equal(session.snapshot().refreshing,false)
    requests[1].resolve(older)
    assert.equal((await first).error,'stale_view')
    assert.equal(session.snapshot().turn.state,expectedState)
    assert.equal(session.snapshot().error,expectedError)
    assert.equal(session.snapshot().refreshing,false)
  }
})

test('stop invalidates earlier read and blocks refresh until its real readback', async () => {
  const beforeStop = deferred(), stop = deferred(), afterStop = deferred()
  let reads = 0
  const host = {request(action) {
    if (action === 'turn.stop') return stop.promise
    reads++
    return reads === 1 ? Promise.resolve(ok(view('queued'))) :
      reads === 2 ? beforeStop.promise : afterStop.promise
  }}
  const session = createProductSession({host})
  await session.selectTurn('A')
  const oldRead = session.refreshSelected()
  const stopping = session.stopSelected()
  assert.equal(session.snapshot().refreshing,false)
  assert.equal(session.snapshot().stopping,true)
  assert.equal((await session.refreshSelected()).error,'stop_in_progress')
  stop.resolve(ok({permission_revoked:true,tasks:[],worker_exited:null}))
  await Promise.resolve()
  beforeStop.resolve(ok(view('actions_ready')))
  assert.equal((await oldRead).error,'stale_view')
  afterStop.resolve(ok(view('cancelled')))
  await stopping
  assert.equal(session.snapshot().turn.state,'cancelled')
  assert.equal(session.snapshot().stopping,false)
  assert.equal(session.snapshot().refreshing,false)
})

test('repeat stop uses one command ID and older stop error cannot hide newer readback', async () => {
  const stopA = deferred(), stopB = deferred(), calls = []
  const host = {request(action,payload) {
    if (action === 'turn.stop') {
      calls.push(payload)
      return calls.length === 1 ? stopA.promise : stopB.promise
    }
    return Promise.resolve(ok(view(calls.length >= 2 ? 'cancelled' : 'queued')))
  }}
  const session = createProductSession({host})
  await session.selectTurn('A')
  const first = session.stopSelected()
  const second = session.stopSelected()
  assert.equal(calls.length,2)
  assert.equal(calls[0].command_id,calls[1].command_id)
  stopB.resolve(ok({permission_revoked:true,tasks:[],worker_exited:null}))
  await second
  assert.equal(session.snapshot().turn.state,'cancelled')
  stopA.resolve(fail('transport_unavailable'))
  await first
  assert.equal(session.snapshot().turn.state,'cancelled')
  assert.equal(session.snapshot().error,null)
  assert.equal(session.snapshot().stop.permission_revoked,true)
})
