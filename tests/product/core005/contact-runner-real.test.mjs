import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {createProductHost} from '../../../apps/desktop/product/host.mjs'
import {createContactRunner} from '../../../apps/desktop/product/execution/contact-runner.mjs'

const exec=promisify(execFile)
const workspace=path.resolve(fileURLToPath(new URL('../../..',import.meta.url)))
const python=path.resolve(workspace,'../companion-agent/.venv/Scripts/python.exe')
const fresh=async()=>{const parent=path.join(workspace,'.test-data');await fs.mkdir(parent,{recursive:true})
  return fs.mkdtemp(path.join(parent,'core-005-contact-'))}
const prepare=async(root,count=1)=>{
  const {stdout,stderr}=await exec(python,['-I','-B','tests/product/core005/prepare_fixture.py',
    workspace,root,String(count)],{cwd:workspace,windowsHide:true,encoding:'utf8'})
  assert.equal(stderr,'');return JSON.parse(stdout)
}
const good=async(host,action,payload={})=>{const reply=await host.request(action,payload)
  assert.equal(reply.ok,true,JSON.stringify(reply));return reply.result}

test('unconfigured pulse delivers explicit reminder without claiming or evaluating plan',async()=>{
  const root=await fresh(),fixture=await prepare(root),raw=createProductHost({python,workspace,dataRoot:root})
  const calls=[],host={request(action,payload){calls.push(action);return raw.request(action,payload)}}
  const contact=createContactRunner({host})
  try{
    const first=await contact.pulse()
    assert.equal(first.ok,true,JSON.stringify(first))
    assert.equal(first.result.modelAvailable,false)
    assert.equal(first.result.reminderMessageIds.length,1)
    assert.equal(calls.includes('contact.claim'),false)
    assert.equal((await good(host,'contact.read',{id:fixture.plans[0].id})).state,'pending')
    assert.equal((await good(host,'inbox.list')).length,1)
    const events=await good(host,'events')
    assert.equal(events.some(item=>item.kind==='contact.evaluating'),false)
  }finally{contact.dispose();await contact.whenIdle();await raw.dispose()}
})

test('one synthetic reassessment sends a durable message; reopen does not send again',async()=>{
  const root=await fresh(),fixture=await prepare(root),raw=createProductHost({python,workspace,dataRoot:root})
  const calls=[],host={request(action,payload){calls.push(action);return raw.request(action,payload)}}
  let syntheticProviderCalls=0
  const contact=createContactRunner({host,provider:{configured:true,reassess(context){
    syntheticProviderCalls++
    assert.equal(Object.hasOwn(context,'ticket'),false)
    assert.equal(context.purpose,'Fictional follow-up 0')
    return {decision:{disposition:'send',text:'Fictional caring message',reason:'still_relevant'}}
  }}})
  let messageId
  try{
    const first=await contact.pulse()
    assert.equal(first.ok,true,JSON.stringify(first))
    assert.equal(first.result.plan.state,'sent')
    messageId=first.result.plan.messageId
    assert.equal(first.result.reminderMessageIds.length,1)
    assert.equal(syntheticProviderCalls,1)
    assert.equal(calls.filter(name=>name==='contact.claim').length,1)
    assert.equal(calls.filter(name=>name==='contact.complete').length,1)
    assert.equal(calls.filter(name=>name==='contact.read').length,1)
    assert.doesNotMatch(JSON.stringify(contact.snapshot()),/ticket|purpose|due_at|expires_at|source|Fictional caring/)
    assert.equal((await good(host,'inbox.list')).filter(item=>item.kind==='proactive')[0].id,messageId)
    assert.equal((await good(host,'inbox.explain',{id:messageId})).basis,
      'opt_in_and_model_reassessment')
    const second=await contact.pulse()
    assert.equal(second.ok,true)
    assert.equal(second.result.plan,null)
    assert.equal(second.result.reminderMessageIds.length,0)
    assert.equal(syntheticProviderCalls,1)
  }finally{contact.dispose();await contact.whenIdle();await raw.dispose()}
  const reopened=createProductHost({python,workspace,dataRoot:root})
  try{
    const receipt=await good(reopened,'contact.read',{id:fixture.plans[0].id})
    assert.equal(receipt.state,'sent')
    assert.equal(receipt.message_id,messageId)
    assert.equal((await good(reopened,'home')).profile.profile_id,fixture.profile_id)
  }finally{await reopened.dispose()}
})

test('defer and cancel are genuine non-send results, not invented deliveries',async()=>{
  const root=await fresh(),fixture=await prepare(root,2),host=createProductHost({python,workspace,dataRoot:root})
  let calls=0
  const runner=createContactRunner({host,provider:{configured:true,reassess(context){
    calls++
    return context.purpose.endsWith('0') ? {decision:{disposition:'defer',
      due_at:new Date(Date.now()+60_000).toISOString(),reason:'later'}} :
      {decision:{disposition:'cancel',reason:'not_useful'}}
  }}})
  try{
    const first=await runner.pulse(),second=await runner.pulse()
    assert.equal(first.result.plan.state,'pending')
    assert.equal(first.result.plan.messageId,null)
    assert.equal(second.result.plan.state,'cancelled')
    assert.equal(second.result.plan.messageId,null)
    assert.equal(calls,2)
    assert.equal((await good(host,'inbox.list')).filter(item=>item.kind==='proactive').length,0)
    assert.equal((await good(host,'contact.read',{id:fixture.plans[0].id})).state,'pending')
    assert.equal((await good(host,'contact.read',{id:fixture.plans[1].id})).state,'cancelled')
  }finally{runner.dispose();await runner.whenIdle();await host.dispose()}
})

test('revoked proactive permission blocks claim while explicit due reminder still arrives',async()=>{
  const root=await fresh(),fixture=await prepare(root),raw=createProductHost({python,workspace,dataRoot:root})
  const calls=[],host={request(action,payload){calls.push(action);return raw.request(action,payload)}}
  let providerCalls=0
  const runner=createContactRunner({host,provider:{configured:true,reassess(){providerCalls++}}})
  try{
    const current=await good(host,'policy.read')
    await good(host,'policy.replace',{expected_revision:current.revision,
      policy:{...current,proactive_enabled:false}})
    const result=await runner.pulse()
    assert.equal(result.ok,true)
    assert.equal(result.result.plan,null)
    assert.equal(result.result.reminderMessageIds.length,1)
    assert.equal(providerCalls,0)
    assert.equal((await good(host,'contact.read',{id:fixture.plans[0].id})).state,'cancelled')
    assert.equal((await good(host,'inbox.list')).filter(item=>item.kind==='proactive').length,0)
    assert.equal((await good(host,'inbox.list')).filter(item=>item.kind==='reminder').length,1)
    assert.equal(calls.filter(item=>item==='contact.claim').length,1)
    assert.doesNotMatch(JSON.stringify(await good(host,'home')),/Fictional follow-up|due_at/)
  }finally{runner.dispose();await runner.whenIdle();await raw.dispose()}
})
