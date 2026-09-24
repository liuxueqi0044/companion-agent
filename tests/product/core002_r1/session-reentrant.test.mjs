import test from 'node:test'
import assert from 'node:assert/strict'
import {createProductSession} from '../../../apps/desktop/product/session.mjs'

const ok = payload => ({ok:true,result:{id:payload.turn.command_id,
  conversation_id:payload.turn.conversation_id,state:'queued',text:payload.turn.text,actions:[]}})

test('synchronous submitting subscriber reuses the installed flight without duplicate transport', async () => {
  const sent=[]
  let trigger=false, reentered
  const session=createProductSession({host:{request(_action,payload) {
    sent.push(structuredClone(payload))
    return Promise.resolve(ok(payload))
  }}})
  session.subscribe(state => {
    if (state.submitting && !trigger) {
      trigger=true
      reentered=session.replaySubmit()
    }
  })
  const original=await session.submitTurn({text:'one intent'})
  const replay=await reentered
  assert.equal(sent.length,1)
  assert.equal(original.ok,true)
  assert.deepEqual(original,replay)
  assert.equal(session.snapshot().submitting,false)
  assert.equal(session.snapshot().submitUnknown,false)
  session.dispose()
})

test('disposing from submitting notification prevents a not-yet-issued transport write', async () => {
  let calls=0
  const session=createProductSession({host:{request(_action,payload) {
    calls++
    return Promise.resolve(ok(payload))
  }}})
  session.subscribe(state => {if(state.submitting) session.dispose()})
  assert.equal((await session.submitTurn({text:'stopped before dispatch'})).error,'disposed')
  assert.equal(calls,0)
  assert.equal(session.snapshot().submitting,false)
})

test('throwing presentation observer cannot strand submission or suppress other observers', async () => {
  let calls=0
  const seen=[]
  const session=createProductSession({host:{request(_action,payload) {
    calls++
    return Promise.resolve(ok(payload))
  }}})
  const unsubscribe=session.subscribe(() => {throw new Error('synthetic rendering failure')})
  session.subscribe(state => seen.push(state.submitting))
  assert.equal((await session.submitTurn({text:'first'})).ok,true)
  assert.equal((await session.submitTurn({text:'second'})).ok,true)
  assert.equal(calls,2)
  assert.deepEqual(seen,[false,true,false,true,false])
  assert.equal((await session.replaySubmit()).error,'nothing_to_replay')
  unsubscribe()
  session.dispose()
})
