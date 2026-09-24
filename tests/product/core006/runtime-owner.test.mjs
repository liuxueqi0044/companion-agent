import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createProductRuntime} from '../../../apps/desktop/product/runtime/index.mjs'
import {createProductHost} from '../../../apps/desktop/product/host.mjs'
import {createContactRunner} from '../../../apps/desktop/product/execution/contact-runner.mjs'
import {createTurnRunner} from '../../../apps/desktop/product/execution/runner.mjs'

const workspace=path.resolve(fileURLToPath(new URL('../../..',import.meta.url)))
const python=path.resolve(workspace,'../companion-agent/.venv/Scripts/python.exe')
const fresh=async()=>{const parent=path.join(workspace,'.test-data');await fs.mkdir(parent,{recursive:true})
  return fs.mkdtemp(path.join(parent,'core-006-owner-'))}

test('construction and subscription are inert; duplicate runtime cannot own same host',async()=>{
  let requests=0,disposals=0
  const host={request(){requests++},dispose(){disposals++}}
  const runtime=createProductRuntime({host})
  let views=0
  const unsubscribe=runtime.subscribe(()=>{views++})
  assert.equal(requests,0)
  assert.equal(views>=1,true)
  assert.throws(()=>createProductRuntime({host}),/runtime_owned/)
  assert.doesNotMatch(JSON.stringify(runtime.snapshot()),/request|provider|ticket|csv_text|context/)
  unsubscribe()
  assert.equal(runtime.dispose().result.closed,true)
  assert.equal((await runtime.whenIdle()).result.closed,true)
  assert.equal(disposals,0)
  const next=createProductRuntime({host});next.dispose();await next.whenIdle()
})

test('a second runner construction failure rolls back only the newly created turn owner',async()=>{
  let requests=0,disposals=0
  const host={request(){requests++},dispose(){disposals++}}
  const external=createContactRunner({host})
  assert.throws(()=>createProductRuntime({host}),/runner_owned/)
  // The failed constructor must not strand its own turn owner or dispose the external one.
  const turn=createTurnRunner({host});turn.dispose();await turn.whenIdle()
  assert.equal(external.snapshot().disposed,false)
  assert.equal(disposals,0)
  external.dispose();await external.whenIdle()
  const runtime=createProductRuntime({host});runtime.dispose();await runtime.whenIdle()
  assert.equal(requests,0)
})

test('default unavailable providers still allow real identity/policy initialization',async()=>{
  const raw=createProductHost({python,workspace,dataRoot:await fresh()})
  const actions=[],host={request(action,payload){actions.push(action);return raw.request(action,payload)}}
  const runtime=createProductRuntime({host})
  try{
    assert.equal(actions.length,0)
    const initialized=await runtime.initialize()
    assert.equal(initialized.ok,true,JSON.stringify(initialized))
    assert.equal(runtime.snapshot().home.policy.proactive_enabled,false)
    assert.equal(typeof runtime.snapshot().home.profile.profile_id,'string')
    assert.deepEqual(actions,['bootstrap','policy.read'])
    assert.equal((await runtime.initialize()).ok,true)
    assert.deepEqual(actions,['bootstrap','policy.read'])
  }finally{runtime.dispose();await runtime.whenIdle();await raw.dispose()}
})
