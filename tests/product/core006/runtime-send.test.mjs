import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import {createProductRuntime} from '../../../apps/desktop/product/runtime/index.mjs'
import {createProductHost} from '../../../apps/desktop/product/host.mjs'

const workspace=path.resolve(fileURLToPath(new URL('../../..',import.meta.url)))
const python=path.resolve(workspace,'../companion-agent/.venv/Scripts/python.exe')
const fresh=async()=>{const parent=path.join(workspace,'.test-data');await fs.mkdir(parent,{recursive:true})
  return fs.mkdtemp(path.join(parent,'core-006-send-'))}
const ok=result=>({ok:true,result})
const bad=code=>({ok:false,error:{code}})
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}}
const tick=()=>new Promise(resolve=>setImmediate(resolve))
const policy={revision:1,memory_enabled:true,memory_categories:['work','preferences','goals'],
  proactive_enabled:false,timezone:'UTC',start_minute:540,end_minute:1260,daily_limit:1,
  daily_evaluation_limit:3,topics:['work','daily','wellbeing'],paused_until:null}
const home={profile:{profile_id:randomUUID(),revision:1,
  preferences:{ai_name:'AI',address_user_as:'friend'}},policy,unread_count:0,
  experience_revision:1,model_status:'not_configured',runtime:'local_device',native_isolation:'not_run'}
const input=()=>({command_id:randomUUID(),conversation_id:randomUUID(),text:'Fictional task',
  csv_text:'item,unit,qty,unit_price,currency\nPen,piece,2,3,CNY\n'})
const turn=value=>({id:value.command_id,conversation_id:value.conversation_id,
  text:value.text,state:'queued',actions:[]})

test('unconfigured send persists exactly one real input and reports execution unavailability',async()=>{
  const root=await fresh(),raw=createProductHost({python,workspace,dataRoot:root})
  const actions=[],host={request(action,payload){actions.push(action);return raw.request(action,payload)}}
  const runtime=createProductRuntime({host,intent:()=>['csv.audit']})
  try{
    await runtime.initialize()
    const entry=input()
    assert.equal((await runtime.send({...entry,capabilities:['csv.audit']})).error,'invalid_request')
    const first=await runtime.send(entry)
    assert.equal(first.ok,false)
    assert.equal(first.error,'model_not_configured')
    assert.equal(first.stage,'execution')
    assert.equal(first.submission,'confirmed')
    assert.equal(first.turnId,entry.command_id)
    assert.equal(runtime.snapshot().conversation.turn.id,entry.command_id)
    assert.equal(runtime.snapshot().conversation.turn.state,'queued')
    assert.equal(actions.filter(action=>action==='turn.submit').length,1)
    assert.equal(actions.includes('turn.begin'),false)
    assert.equal((await runtime.send(entry)).result.execution.phase,'already_submitted')
    assert.equal((await runtime.send({...entry,text:'Changed'})).error,'idempotency_conflict')
    assert.equal(actions.filter(action=>action==='turn.submit').length,1)
  }finally{runtime.dispose();await runtime.whenIdle();await raw.dispose()}
})

test('same command reentry is one flight; another command is busy before submit',async()=>{
  const held=deferred(),entry=input(),calls=[]
  const host={request(action,payload){calls.push({action,payload})
    if(action==='bootstrap')return ok(home)
    if(action==='policy.read')return ok(policy)
    if(action==='turn.submit')return held.promise
    if(action==='turn.read')return ok(turn(entry))
    throw Error(action)}}
  const runtime=createProductRuntime({host})
  try{
    await runtime.initialize()
    let nested
    runtime.subscribe(view=>{if(view.runtime.send?.phase==='registered' && !nested)
      nested=runtime.send(entry)})
    const first=runtime.send(entry)
    assert.strictEqual(nested,first)
    assert.strictEqual(runtime.send(entry),first)
    assert.equal((await runtime.send({...entry,text:'Other'})).error,'idempotency_conflict')
    assert.equal((await runtime.send(input())).error,'runner_busy')
    await tick()
    assert.equal(calls.filter(row=>row.action==='turn.submit').length,1)
    held.resolve(ok(turn(entry)))
    assert.equal((await first).error,'model_not_configured')
    assert.equal(calls.filter(row=>row.action==='turn.submit').length,1)
  }finally{runtime.dispose();await runtime.whenIdle()}
})

test('cancel before send prevents transport; cancellation of in-flight submit preserves queued input',async()=>{
  const entry=input(),calls=[]
  const host={request(action,payload){calls.push(action)
    if(action==='bootstrap')return ok(home)
    if(action==='policy.read')return ok(policy)
    if(action==='turn.read')return ok(turn(entry))
    if(action==='turn.submit')throw Error('must_not_submit')
    throw Error(action)}}
  const runtime=createProductRuntime({host})
  try{
    await runtime.initialize()
    let cancel
    runtime.subscribe(view=>{if(view.runtime.send?.phase==='registered' && !cancel)
      cancel=runtime.cancelSend({commandId:entry.command_id})})
    const sent=await runtime.send(entry)
    assert.equal(sent.error,'send_cancelled')
    assert.equal(sent.submission,'not_sent')
    assert.equal((await cancel).result.permissionRevoked,false)
    assert.equal(calls.includes('turn.submit'),false)
  }finally{runtime.dispose();await runtime.whenIdle()}

  const pending=deferred(),seen=[]
  const secondHost={request(action,payload){seen.push({action,payload})
    if(action==='bootstrap')return ok(home)
    if(action==='policy.read')return ok(policy)
    if(action==='turn.submit')return pending.promise
    throw Error(action)}}
  const second=createProductRuntime({host:secondHost})
  try{
    await second.initialize()
    const running=second.send(entry)
    await tick()
    assert.equal(seen.filter(row=>row.action==='turn.submit').length,1)
    const cancel=second.cancelSend({commandId:entry.command_id})
    pending.resolve(ok(turn(entry)))
    assert.equal((await running).error,'send_cancelled')
    const stopped=await cancel
    assert.equal(stopped.result.submission,'confirmed')
    assert.equal(stopped.result.permissionRevoked,false)
    assert.equal(seen.some(row=>row.action==='turn.begin'),false)
  }finally{second.dispose();await second.whenIdle()}
})

test('unknown submit needs explicit original replay and never auto-begins',async()=>{
  const entry=input(),calls=[]
  const host={request(action,payload){calls.push({action,payload})
    if(action==='bootstrap')return ok(home)
    if(action==='policy.read')return ok(policy)
    if(action==='turn.submit')return calls.filter(row=>row.action==='turn.submit').length===1
      ? bad('outcome_unknown'):ok(turn(entry))
    throw Error(action)}}
  const runtime=createProductRuntime({host})
  try{
    await runtime.initialize()
    const lost=await runtime.send(entry)
    assert.equal(lost.stage,'submission')
    assert.equal(lost.submission,'unknown')
    assert.equal((await runtime.send(entry)).error,'submit_pending_reconciliation')
    const replay=await runtime.ui.conversation.replaySubmit()
    assert.equal(replay.ok,true)
    assert.equal(replay.result.id,entry.command_id)
    assert.equal(calls.filter(row=>row.action==='turn.submit').length,2)
    assert.deepEqual(calls.filter(row=>row.action==='turn.submit').map(row=>row.payload),
      [calls[2].payload,calls[2].payload])
    assert.equal(calls.some(row=>row.action==='turn.begin'),false)
    assert.equal((await runtime.send(entry)).result.execution.phase,'already_submitted')
  }finally{runtime.dispose();await runtime.whenIdle()}
})

test('existing responded turn is not generated a second time',async()=>{
  const entry=input(),calls=[]
  const host={request(action){calls.push(action)
    if(action==='bootstrap')return ok(home)
    if(action==='policy.read')return ok(policy)
    if(action==='turn.submit' || action==='turn.read')return ok({...turn(entry),state:'responded',reply:'Done'})
    throw Error(action)}}
  const runtime=createProductRuntime({host,turnProvider:{configured:true,
    respond(){throw Error('must_not_generate')}}})
  try{
    await runtime.initialize()
    const result=await runtime.send(entry)
    assert.equal(result.ok,true)
    assert.equal(result.result.execution.phase,'already_submitted')
    assert.equal(calls.includes('turn.begin'),false)
  }finally{runtime.dispose();await runtime.whenIdle()}
})
