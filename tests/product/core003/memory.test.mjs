import {resolveRuntime} from '../../../apps/desktop/product/runtime-paths.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import {createProductHost} from '../../../apps/desktop/product/host.mjs'
import {createPolicyController} from '../../../apps/desktop/product/application/policy.mjs'
import {createMemoryController} from '../../../apps/desktop/product/application/memory.mjs'

const workspace = path.resolve(fileURLToPath(new URL('../../..',import.meta.url)))
const python = resolveRuntime('python')
const fresh = async () => {
  await fs.mkdir(path.join(workspace,'.test-data'),{recursive:true})
  return fs.mkdtemp(path.join(workspace,'.test-data','core-003-memory-'))
}
const good = async (host,action,payload={}) => {
  const reply = await host.request(action,payload)
  assert.equal(reply.ok,true,JSON.stringify(reply))
  return reply.result
}
const defer = () => { let resolve; const promise = new Promise(done => {resolve=done}); return {promise,resolve} }

test('real memory add/edit/forget/clear and policy OFF still permit management', async () => {
  const host = createProductHost({python,workspace,dataRoot:await fresh()})
  try {
    const identity = (await good(host,'bootstrap')).profile.profile_id
    const policy = createPolicyController({host})
    await policy.refresh()
    const memory = createMemoryController({host,policy})
    assert.equal((await memory.add({content:'first'})).ok,true)
    assert.equal((await memory.refresh()).ok,true)
    const id = memory.snapshot().items[0].id
    assert.equal((await memory.select({id})).ok,true)
    assert.equal((await memory.edit({content:'revised'})).ok,true)
    assert.equal(memory.snapshot().selected.content,'revised')
    assert.equal((await policy.updateMemory({expectedRevision:policy.snapshot().policy.revision,
      patch:{memory_enabled:false}})).ok,true)
    assert.equal((await memory.refresh()).ok,true)
    assert.equal(memory.snapshot().items[0].content,'revised')
    assert.equal((await memory.forget()).ok,true)
    assert.equal(memory.snapshot().items.length,0)
    assert.equal((await memory.add({content:'clear me'})).ok,true)
    const revision = policy.snapshot().policy.revision
    assert.equal((await memory.clear({confirmed:false,expectedPolicyRevision:revision})).error,
      'confirmation_required')
    assert.equal((await memory.clear({confirmed:true,expectedPolicyRevision:revision})).ok,true)
    assert.equal((await good(host,'memory.list')).length,0)
    assert.equal((await good(host,'home')).profile.profile_id,identity)
    memory.dispose(); policy.dispose()
  } finally { await host.dispose() }
})

test('lost real add receipt is unknown; refresh does not claim text match and ack is explicit', async () => {
  const host = createProductHost({python,workspace,dataRoot:await fresh()})
  try {
    await good(host,'bootstrap')
    let dropped = false, addCalls = 0
    const transport = {async request(action,payload) {
      const reply = await host.request(action,payload)
      if (action === 'memory.add') {
        addCalls++
        if (!dropped) { dropped = true; assert.equal(reply.ok,true); return {ok:false,error:{code:'outcome_unknown'}} }
      }
      return reply
    }}
    const policy = createPolicyController({host:transport})
    await policy.refresh()
    const memory = createMemoryController({host:transport,policy})
    assert.equal((await memory.add({content:'same text'})).error,'outcome_unknown')
    const operationId = memory.snapshot().unknown.operationId
    assert.equal((await memory.acknowledgeUnknown({operationId})).error,'reconciliation_required')
    assert.equal((await memory.add({content:'same text'})).error,'reconciliation_required')
    assert.equal((await memory.refresh()).ok,true)
    assert.equal(memory.snapshot().items.length,1)
    assert.equal(memory.snapshot().unknown.phase,'unknown')
    assert.equal((await memory.acknowledgeUnknown({operationId:randomUUID()})).error,'unknown_operation')
    assert.equal((await memory.acknowledgeUnknown({operationId})).result.confirmed,false)
    assert.equal(addCalls,1)
    assert.equal((await good(host,'memory.list')).length,1)
    memory.dispose(); policy.dispose()
  } finally { await host.dispose() }
})

test('page and selection generations reject old reads and freeze clicked edit target', async () => {
  const a = {cursor:2,id:randomUUID(),source_id:'manual:a',category:'preferences',content:'A',revision:1}
  const b = {cursor:1,id:randomUUID(),source_id:'manual:b',category:'preferences',content:'B',revision:1}
  const old = defer(), edit = defer()
  let listCount = 0, editPayload
  const host = {request(action,payload) {
    if (action === 'memory.list') return ++listCount === 1 ? Promise.resolve({ok:true,result:[a,b]})
      : listCount === 2 ? old.promise : Promise.resolve({ok:true,result:[b]})
    if (action === 'memory.edit') { editPayload = payload; return edit.promise }
    return Promise.resolve({ok:true,result:null})
  }}
  const policy = {markStale(){},refresh:async()=>({ok:true}),snapshot:()=>({policy:{revision:1},stale:false})}
  const memory = createMemoryController({host,policy})
  await memory.refresh()
  await memory.select({id:a.id})
  const stale = memory.refresh()
  const current = memory.refresh()
  old.resolve({ok:true,result:[a,b]})
  assert.equal((await stale).error,'stale_view')
  assert.equal((await current).ok,true)
  assert.equal(memory.snapshot().items[0].id,b.id)
  // Restore A for a frozen click, then switch selection before the receipt.
  a.cursor = 3
  await memory.refresh()
  // The third and later mock page currently contains only B, so inject a new controller.
  memory.dispose()
  const host2 = {request(action,payload) {
    if (action === 'memory.list') return Promise.resolve({ok:true,result:[a,b]})
    if (action === 'memory.edit') { editPayload = payload; return edit.promise }
  }}
  const second = createMemoryController({host:host2,policy})
  await second.refresh(); await second.select({id:a.id})
  const writing = second.edit({content:'new A'})
  await second.select({id:b.id})
  await Promise.resolve()
  assert.equal(editPayload.id,a.id)
  edit.resolve({ok:true,result:{id:a.id,revision:2}})
  assert.equal((await writing).ok,true)
  assert.equal(second.snapshot().selected.id,b.id)
  second.deactivate()
  assert.deepEqual(second.snapshot().items,[])
  second.dispose()
})

test('synchronous add reentry is one transport and hidden panel stays empty after late receipt',async()=>{
  const held=defer(),id=randomUUID()
  let calls=0,nested
  const host={request(action){
    if(action==='memory.add'){calls++;return held.promise}
    if(action==='memory.list')return Promise.resolve({ok:true,result:[]})
  }}
  const policy={markStale(){},refresh:async()=>({ok:true}),snapshot:()=>({policy:{revision:1},stale:false})}
  const memory=createMemoryController({host,policy})
  memory.subscribe(snapshot=>{if(snapshot.busy && !nested)nested=memory.add({content:'A'})})
  const first=memory.add({content:'A'})
  assert.strictEqual(nested,first)
  await Promise.resolve();assert.equal(calls,1)
  memory.deactivate()
  held.resolve({ok:true,result:{id,revision:1}})
  assert.equal((await first).ok,true)
  assert.deepEqual(memory.snapshot().items,[])
  assert.equal(memory.snapshot().active,false)
  memory.dispose()
})
