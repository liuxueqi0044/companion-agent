import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {randomUUID} from 'node:crypto'
import {createProductHost} from '../../../apps/desktop/product/host.mjs'

const exec=promisify(execFile)
const workspace=path.resolve(fileURLToPath(new URL('../../..',import.meta.url)))
const python=path.resolve(workspace,'../companion-agent/.venv/Scripts/python.exe')
const fresh=async()=>{const parent=path.join(workspace,'.test-data');await fs.mkdir(parent,{recursive:true})
  return fs.mkdtemp(path.join(parent,'core-005-host-'))}
const fixture=async(root,count=1)=>{
  const {stdout,stderr}=await exec(python,['-I','-B','tests/product/core005/prepare_fixture.py',
    workspace,root,String(count)],{cwd:workspace,windowsHide:true,encoding:'utf8'})
  assert.equal(stderr,'');return JSON.parse(stdout)
}
const good=async(host,action,payload={})=>{const reply=await host.request(action,payload)
  assert.equal(reply.ok,true,JSON.stringify(reply));return reply.result}

test('real stdio contact receipt verifies durable inbox relation and does not expose context',async()=>{
  const root=await fresh(),prepared=await fixture(root)
  const host=createProductHost({python,workspace,dataRoot:root})
  try{
    const job=await good(host,'contact.claim')
    assert.equal(job.id,prepared.plans[0].id)
    assert.equal((await good(host,'contact.claim')),null)
    const before=await good(host,'contact.read',{id:job.id})
    assert.deepEqual(Object.keys(before).sort(),['id','message_id','reason','state'])
    assert.equal(before.state,'evaluating')
    assert.doesNotMatch(JSON.stringify(before),/ticket|purpose|due_at|context|source/)
    const sent=await good(host,'contact.complete',{id:job.id,ticket:job.ticket,
      decision:{disposition:'send',text:'Fictional check-in',reason:'still_relevant'}})
    assert.equal(sent.state,'sent')
    assert.equal(sent.message_id,(await good(host,'inbox.list'))[0].id)
    assert.deepEqual(await good(host,'contact.read',{id:job.id}),sent)
    assert.equal((await host.request('contact.complete',{id:job.id,ticket:job.ticket,
      decision:{disposition:'send',text:'duplicate',reason:'still_relevant'}})).error.code,
      'stale_generation')
    const reminders=await good(host,'reminder.deliver-due')
    assert.equal(reminders.length,1)
    assert.deepEqual(await good(host,'reminder.deliver-due'),[])
    assert.equal((await good(host,'inbox.list')).length,2)
  }finally{await host.dispose()}
})

test('host classifies contact.read as read and every other new action as uncertain write',async()=>{
  const host=createProductHost({python:path.join(workspace,'missing-core005-runtime.exe'),
    workspace,dataRoot:await fresh()})
  try{
    assert.equal((await host.request('contact.read',{id:randomUUID()})).error.code,
      'transport_unavailable')
    for(const action of ['contact.claim','contact.complete','contact.fail-generation',
      'reminder.deliver-due'])
      assert.equal((await host.request(action,{})).error.code,'outcome_unknown')
  }finally{await host.dispose()}
})
