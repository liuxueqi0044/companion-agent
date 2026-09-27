import {resolveRuntime} from '../../../apps/desktop/product/runtime-paths.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createProductHost} from '../../../apps/desktop/product/host.mjs'
import {createPolicyController} from '../../../apps/desktop/product/application/policy.mjs'

const workspace = path.resolve(fileURLToPath(new URL('../../..',import.meta.url)))
const python = resolveRuntime('python')
const fresh = async () => {
  await fs.mkdir(path.join(workspace,'.test-data'),{recursive:true})
  return fs.mkdtemp(path.join(workspace,'.test-data','core-003-policy-'))
}
const policy = {revision:1,memory_enabled:true,memory_categories:['work','preferences','goals'],
  proactive_enabled:false,timezone:'UTC',start_minute:540,end_minute:1260,daily_limit:1,
  daily_evaluation_limit:3,topics:['work','daily','wellbeing'],paused_until:null}
const defer = () => { let resolve; const promise = new Promise(done => {resolve=done}); return {promise,resolve} }

test('policy construction is inert; synchronous reentry is one flight and observers cannot strand it', async () => {
  const delayed = defer(), calls = []
  const host = {request(action,payload) {
    calls.push({action,payload})
    if (action === 'policy.read') return Promise.resolve({ok:true,result:policy})
    return delayed.promise
  }}
  const controller = createPolicyController({host})
  assert.equal(calls.length,0)
  await controller.refresh()
  let nested
  controller.subscribe(snapshot => {
    if (snapshot.busy && !nested) nested = controller.updateMemory({expectedRevision:1,patch:{memory_enabled:false}})
  })
  controller.subscribe(() => { throw new Error('display error with secret/path') })
  const flight = controller.updateMemory({expectedRevision:1,patch:{memory_enabled:false}})
  assert.strictEqual(nested,flight)
  await Promise.resolve()
  assert.equal(calls.filter(item => item.action === 'policy.replace').length,1)
  delayed.resolve({ok:true,result:{...policy,revision:2,memory_enabled:false}})
  assert.equal((await flight).ok,true)
  assert.equal(controller.snapshot().policy.memory_enabled,false)
  controller.dispose()
  assert.equal((await controller.refresh()).error,'disposed')
})

test('dispose during busy notification prevents unsent policy write', async () => {
  let calls = 0
  const controller = createPolicyController({host:{request(action) {
    calls++
    return Promise.resolve({ok:true,result:policy})
  }}})
  await controller.refresh()
  controller.subscribe(snapshot => { if (snapshot.busy) controller.dispose() })
  assert.equal((await controller.updateMemory({expectedRevision:1,patch:{memory_enabled:false}})).error,'disposed')
  assert.equal(calls,1)
})

test('real policy CAS shares memory/contact revision; conflict refreshes without overwrite', async () => {
  const host = createProductHost({python,workspace,dataRoot:await fresh()})
  try {
    assert.equal((await host.request('bootstrap',{})).ok,true)
    const control = createPolicyController({host})
    assert.equal((await control.refresh()).ok,true)
    assert.equal(control.snapshot().policy.memory_enabled,true)
    assert.equal(control.snapshot().policy.proactive_enabled,false)
    assert.equal((await control.updateMemory({expectedRevision:1,patch:{memory_enabled:false}})).ok,true)
    assert.equal(control.snapshot().policy.revision,2)
    assert.equal((await control.updateContact({expectedRevision:2,patch:{proactive_enabled:true}})).ok,true)
    assert.equal(control.snapshot().policy.memory_enabled,false)
    const external = {...(await host.request('policy.read',{})).result,memory_enabled:true}
    assert.equal((await host.request('policy.replace',{expected_revision:3,policy:external})).ok,true)
    const conflict = await control.updateContact({expectedRevision:3,patch:{proactive_enabled:false}})
    assert.equal(conflict.error,'revision_conflict')
    assert.equal(control.snapshot().policy.revision,4)
    assert.equal(control.snapshot().policy.proactive_enabled,true)
    assert.equal((await control.refreshContact()).ok,true)
    assert.deepEqual(control.snapshot().blockedTopics,[])
    assert.equal((await control.blockTopic({topic:'daily'})).ok,true)
    assert.deepEqual(control.snapshot().blockedTopics,['daily'])
    assert.equal((await control.unblockTopic({topic:'daily'})).ok,true)
    control.dispose()
  } finally { await host.dispose() }
})

test('field whitelist and hostile transport errors stay within safe codes', async () => {
  const host = {request(action) { return action === 'policy.read'
    ? Promise.resolve({ok:true,result:policy})
    : Promise.resolve({ok:false,error:{code:'Error: C:\\secret\\key'}}) }}
  const control = createPolicyController({host})
  await control.refresh()
  assert.equal((await control.updateMemory({expectedRevision:1,patch:{proactive_enabled:true}})).error,'invalid_request')
  assert.equal((await control.updateContact({expectedRevision:1,patch:{ticket:'x'}})).error,'invalid_request')
  assert.equal((await control.updateContact({expectedRevision:1,patch:{proactive_enabled:true}})).error,
    'transport_unavailable')
  assert.doesNotMatch(JSON.stringify(control.snapshot()),/secret|ticket|followup|due_at/)
  control.dispose()
})

test('uncertain policy write needs explicit read and an external policy bump preserves stale state',async()=>{
  const held=defer()
  let version=1,reads=0
  const host={request(action){
    if(action==='policy.read'){reads++;return Promise.resolve({ok:true,result:{...policy,revision:version}})}
    return held.promise
  }}
  const control=createPolicyController({host})
  await control.refresh()
  const writing=control.updateMemory({expectedRevision:1,patch:{memory_enabled:false}})
  control.markStale()
  held.resolve({ok:true,result:{...policy,revision:2,memory_enabled:false}})
  assert.equal((await writing).ok,true)
  assert.equal(control.snapshot().stale,true)
  version=3
  await control.refresh()
  assert.equal(control.snapshot().policy.revision,3)
  assert.ok(reads>=2)
  control.dispose()
  const uncertainHost={request(action){return Promise.resolve(action==='policy.read'
    ? {ok:true,result:policy}:{ok:false,error:{code:'outcome_unknown'}})}}
  const other=createPolicyController({host:uncertainHost})
  await other.refresh()
  assert.equal((await other.updateMemory({expectedRevision:1,patch:{memory_enabled:false}})).error,'outcome_unknown')
  assert.equal((await other.updateContact({expectedRevision:1,patch:{proactive_enabled:true}})).error,'policy_stale')
  await other.refresh()
  assert.equal(other.snapshot().stale,false)
  other.dispose()
})
