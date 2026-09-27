import {resolveRuntime} from '../../../apps/desktop/product/runtime-paths.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import {createProductHost} from '../../../apps/desktop/product/host.mjs'

const workspace=path.resolve(fileURLToPath(new URL('../../..',import.meta.url)))
const python=resolveRuntime('python')
const fresh=async()=>{const parent=path.join(workspace,'.test-data');await fs.mkdir(parent,{recursive:true})
  return fs.mkdtemp(path.join(parent,'core-004-host-'))}
const good=async(host,action,payload={})=>{const reply=await host.request(action,payload)
  assert.equal(reply.ok,true,JSON.stringify(reply));return reply.result}

test('real stdio failure acts only on its ticket and is a write-class action',async()=>{
  const root=await fresh(),host=createProductHost({python,workspace,dataRoot:root})
  try{
    await good(host,'bootstrap')
    const item=await good(host,'turn.submit',{turn:{command_id:randomUUID(),
      conversation_id:randomUUID(),text:'Fictional data'}})
    const first=await good(host,'turn.begin',{turn_id:item.id})
    const invalid=await host.request('turn.fail-generation',{turn_id:item.id,ticket:randomUUID(),
      reason:'provider_failed'})
    assert.deepEqual(invalid.error,{code:'stale_generation'})
    assert.equal((await good(host,'turn.read',{turn_id:item.id})).state,'generating')
    assert.deepEqual(await good(host,'turn.fail-generation',{turn_id:item.id,ticket:first.ticket,
      reason:'provider_failed'}),{id:item.id,state:'model_failed',error:'provider_failed'})
    const second=await good(host,'turn.begin',{turn_id:item.id})
    assert.notEqual(second.ticket,first.ticket)
    assert.equal((await host.request('turn.fail-generation',{turn_id:item.id,ticket:first.ticket,
      reason:'provider_aborted'})).error.code,'stale_generation')
    assert.equal((await good(host,'turn.read',{turn_id:item.id})).state,'generating')
  }finally{await host.dispose()}
  const broken=createProductHost({python:path.join(workspace,'missing-core004-runtime.exe'),
    workspace,dataRoot:await fresh()})
  try{
    assert.equal((await broken.request('turn.fail-generation',{turn_id:randomUUID(),
      ticket:randomUUID(),reason:'provider_failed'})).error.code,'outcome_unknown')
  }finally{await broken.dispose()}
})
