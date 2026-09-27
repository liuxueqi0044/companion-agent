import {resolveRuntime} from '../../../apps/desktop/product/runtime-paths.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {randomUUID} from 'node:crypto'
import {createProductRuntime} from '../../../apps/desktop/product/runtime/index.mjs'
import {createProductHost} from '../../../apps/desktop/product/host.mjs'

const exec=promisify(execFile)
const workspace=path.resolve(fileURLToPath(new URL('../../..',import.meta.url)))
const python=resolveRuntime('python')
const fresh=async()=>{const parent=path.join(workspace,'.test-data');await fs.mkdir(parent,{recursive:true})
  return fs.mkdtemp(path.join(parent,'core-006-real-'))}
const good=async(host,action,payload={})=>{const reply=await host.request(action,payload)
  assert.equal(reply.ok,true,JSON.stringify(reply));return reply.result}
const fixture=async(root,count=1)=>{
  const {stdout,stderr}=await exec(python,['-I','-B','tests/product/core005/prepare_fixture.py',
    workspace,root,String(count)],{cwd:workspace,windowsHide:true,encoding:'utf8'})
  assert.equal(stderr,'');return JSON.parse(stdout)
}
const csv='item,unit,qty,unit_price,currency\nPen,piece,2,3,CNY\n'
const sendInput=()=>({command_id:randomUUID(),conversation_id:randomUUID(),
  text:'Audit fictional CSV',csv_text:csv})
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}}

test('send uses the real CSV chain and refreshes its selected result without manual read',async()=>{
  const raw=createProductHost({python,workspace,dataRoot:await fresh()})
  const actions=[],host={request(action,payload){actions.push(action);return raw.request(action,payload)}}
  let providerCalls=0
  const runtime=createProductRuntime({host,intent:()=>['csv.audit'],turnProvider:{configured:true,
    respond(context){providerCalls++;assert.equal(Object.hasOwn(context,'ticket'),false)
      return {decision:{reply:'I audited fictional rows.',actions:[{kind:'csv.audit'}]}}}}})
  try{
    await runtime.initialize()
    const entry=sendInput(),answer=await runtime.send(entry)
    assert.equal(answer.ok,true,JSON.stringify(answer))
    assert.equal(answer.result.turnId,entry.command_id)
    assert.equal(answer.result.execution.phase,'settled')
    assert.equal(answer.result.view.synced,true)
    assert.equal(runtime.snapshot().activity.taskStatus,'completed')
    const taskId=runtime.snapshot().activity.taskId
    const result=await runtime.ui.result.open({taskId})
    assert.equal(result.ok,true,JSON.stringify(result))
    assert.equal(result.result.metadata.total,'6')
    assert.equal(!!result.result.rows[0].source_refs,true)
    assert.equal(providerCalls,1)
    assert.equal(actions.filter(action=>action==='turn.submit').length,1)
    assert.equal(actions.filter(action=>action==='turn.begin').length,1)
    assert.equal(actions.filter(action=>action==='worker.run-next').length,1)
    assert.equal(actions.filter(action=>action==='turn.read').length>=2,true)
    assert.doesNotMatch(JSON.stringify(runtime.snapshot()),/csv_text|input_hash|ticket/)
  }finally{runtime.dispose();await runtime.whenIdle();await raw.dispose()}
})

test('switching from A to B during execution never rebinds A onto B',async()=>{
  const raw=createProductHost({python,workspace,dataRoot:await fresh()})
  const held=deferred(),entered=deferred(),actions=[]
  const host={request(action,payload){actions.push({action,payload});return raw.request(action,payload)}}
  const runtime=createProductRuntime({host,intent:()=>['csv.audit'],turnProvider:{configured:true,
    respond(){entered.resolve();return held.promise}}})
  try{
    await runtime.initialize()
    const b=sendInput(),a=sendInput()
    await good(host,'turn.submit',{turn:{command_id:b.command_id,
      conversation_id:b.conversation_id,text:'Fictional B',csv_text:null},capabilities:[]})
    const running=runtime.send(a)
    await entered.promise
    assert.equal((await runtime.open({panel:'conversation',turnId:b.command_id})).ok,true)
    held.resolve({decision:{reply:'A audit',actions:[{kind:'csv.audit'}]}})
    const answer=await running
    assert.equal(answer.ok,true,JSON.stringify(answer))
    assert.equal(answer.result.view.synced,false)
    assert.equal(runtime.snapshot().conversation.turn.id,b.command_id)
    assert.equal(runtime.snapshot().activity.taskStatus,null)
    assert.equal((await good(host,'turn.read',{turn_id:a.command_id})).actions[0].task.status,
      'completed')
  }finally{runtime.dispose();await runtime.whenIdle();await raw.dispose()}
})

test('explicit contact pulse syncs committed inbox and unread; defer/cancel do not fake messages',async()=>{
  const root=await fresh(),prepared=await fixture(root,3)
  const raw=createProductHost({python,workspace,dataRoot:root})
  const actions=[],host={request(action,payload){actions.push(action);return raw.request(action,payload)}}
  let calls=0
  const runtime=createProductRuntime({host,contactProvider:{configured:true,
    reassess(context){calls++
      const index=Number(context.purpose.at(-1))
      if(index===0)return {decision:{disposition:'send',text:'Fictional caring note',
        reason:'still_relevant'}}
      if(index===1)return {decision:{disposition:'defer',
        due_at:new Date(Date.now()+60_000).toISOString(),reason:'later'}}
      return {decision:{disposition:'cancel',reason:'not_useful'}}
    }}})
  try{
    await runtime.initialize()
    await runtime.open({panel:'inbox'})
    assert.equal(runtime.snapshot().inbox.items.length,0)
    assert.equal(actions.includes('contact.claim'),false)
    const first=await runtime.pulseContact()
    assert.equal(first.ok,true,JSON.stringify(first))
    assert.equal(first.result.plan.state,'sent')
    assert.equal(first.result.view.homeSynced,true)
    assert.equal(first.result.view.inboxSynced,true)
    assert.equal(runtime.snapshot().home.unreadCount,2)
    assert.equal(runtime.snapshot().inbox.items.length,2)
    const message=runtime.snapshot().inbox.items.find(item=>item.kind==='proactive')
    assert.equal(message.id,first.result.plan.messageId)
    assert.equal((await runtime.ui.inbox.select({id:message.id})).ok,true)
    assert.equal((await runtime.ui.inbox.explainSelected()).result.basis,
      'opt_in_and_model_reassessment')
    const second=await runtime.pulseContact(),third=await runtime.pulseContact()
    assert.equal(second.result.plan.state,'pending')
    assert.equal(third.result.plan.state,'cancelled')
    assert.equal(runtime.snapshot().home.unreadCount,2)
    assert.equal(runtime.snapshot().inbox.items.length,2)
    assert.equal(calls,3)
    assert.equal((await runtime.ui.inbox.markRead({id:message.id})).ok,true)
    assert.equal(runtime.snapshot().home.unreadCount,1)
    assert.equal((await good(host,'contact.read',{id:prepared.plans[0].id})).state,'sent')
    assert.doesNotMatch(JSON.stringify(runtime.snapshot()),/Fictional follow-up|expires_at|ticket/)
  }finally{runtime.dispose();await runtime.whenIdle();await raw.dispose()}
})

test('cancelSend during a real turn revokes permission without claiming provider or worker exit',async()=>{
  const raw=createProductHost({python,workspace,dataRoot:await fresh()})
  const held=deferred(),entered=deferred(),actions=[]
  const host={request(action,payload){actions.push(action);return raw.request(action,payload)}}
  const runtime=createProductRuntime({host,intent:()=>['csv.audit'],turnProvider:{configured:true,
    respond(){entered.resolve();return held.promise}}})
  try{
    await runtime.initialize()
    const input=sendInput(),running=runtime.send(input)
    await entered.promise
    const stopped=await runtime.cancelSend({commandId:input.command_id})
    assert.equal(stopped.ok,true,JSON.stringify(stopped))
    assert.equal(stopped.result.permissionRevoked,true)
    assert.equal(stopped.result.workerExited,null)
    assert.equal(stopped.result.cancelRequested,true)
    const sent=await running
    assert.equal(sent.ok,false)
    assert.equal(sent.submission,'confirmed')
    assert.equal(actions.includes('turn.accept'),false)
    assert.equal(actions.includes('worker.run-next'),false)
    assert.equal((await good(host,'turn.read',{turn_id:input.command_id})).state,'cancelled')
    assert.equal(runtime.diagnostics().turn.providerPending,true)
  }finally{
    runtime.dispose()
    held.resolve({decision:{reply:'Ignored late answer',actions:[{kind:'csv.audit'}]}})
    await runtime.whenIdle()
    await raw.dispose()
  }
})

test('pulse receipt waits for the latest committed message readback after an earlier stale home read',async()=>{
  const root=await fresh();await fixture(root)
  const raw=createProductHost({python,workspace,dataRoot:root})
  const firstHomeStarted=deferred(),firstHomeRelease=deferred(),
    secondHomeStarted=deferred(),secondHomeRelease=deferred(),completed=deferred()
  let duringPulse=false,homeReads=0,firstUnread=null,secondUnread=null
  const host={request(action,payload){
    if(action==='home' && duringPulse){
      const number=++homeReads
      return raw.request(action,payload).then(reply=>{
        if(number===1){firstUnread=reply.result.unread_count;firstHomeStarted.resolve()
          return firstHomeRelease.promise.then(()=>reply)}
        if(number===2){secondUnread=reply.result.unread_count;secondHomeStarted.resolve()
          return secondHomeRelease.promise.then(()=>reply)}
        return reply
      })
    }
    if(action==='contact.complete')return raw.request(action,payload).then(reply=>{
      completed.resolve();return reply})
    return raw.request(action,payload)
  }}
  const runtime=createProductRuntime({host,contactProvider:{configured:true,
    async reassess(){await firstHomeStarted.promise
      return {decision:{disposition:'send',text:'Fictional check-in',reason:'still_relevant'}}}}})
  try{
    await runtime.initialize()
    await runtime.open({panel:'inbox'})
    duringPulse=true
    let resolved=false
    const pulse=runtime.pulseContact().then(reply=>{resolved=true;return reply})
    await completed.promise
    assert.equal(firstUnread,1)
    firstHomeRelease.resolve()
    await secondHomeStarted.promise
    assert.equal(secondUnread,2)
    assert.equal(resolved,false)
    secondHomeRelease.resolve()
    const answer=await pulse
    assert.equal(answer.ok,true,JSON.stringify(answer))
    assert.equal(answer.result.view.homeSynced,true)
    assert.equal(answer.result.view.inboxSynced,true)
    assert.equal(runtime.snapshot().home.unreadCount,2)
    assert.equal(runtime.snapshot().inbox.items.length,2)
    assert.equal(homeReads,2)
  }finally{
    firstHomeRelease.resolve();secondHomeRelease.resolve()
    runtime.dispose();await runtime.whenIdle();await raw.dispose()
  }
})
