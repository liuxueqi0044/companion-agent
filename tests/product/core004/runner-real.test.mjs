import {resolveRuntime} from '../../../apps/desktop/product/runtime-paths.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import {createProductHost} from '../../../apps/desktop/product/host.mjs'
import {createTurnRunner} from '../../../apps/desktop/product/execution/runner.mjs'

const workspace=path.resolve(fileURLToPath(new URL('../../..',import.meta.url)))
const python=resolveRuntime('python')
const csv='item,unit,qty,unit_price,currency\nPen,piece,2,3,CNY\n'
const fresh=async()=>{const parent=path.join(workspace,'.test-data');await fs.mkdir(parent,{recursive:true})
  return fs.mkdtemp(path.join(parent,'core-004-runner-'))}
const good=async(host,action,payload={})=>{const reply=await host.request(action,payload)
  assert.equal(reply.ok,true,JSON.stringify(reply));return reply.result}
const submit=(host,{conversationId=randomUUID(),grant=true}={})=>good(host,'turn.submit',{
  turn:{command_id:randomUUID(),conversation_id:conversationId,text:'Audit fictional input',csv_text:csv},
  ...(grant ? {capabilities:['csv.audit']} : {})})

test('synthetic provider drives real CSV, task, message and reopen without manual stage calls',async()=>{
  const dataRoot=await fresh(),host=createProductHost({python,workspace,dataRoot})
  let id,taskId,providerCalls=0
  const runner=createTurnRunner({host,provider:{configured:true,respond(context){providerCalls++
    assert.equal(Object.hasOwn(context,'ticket'),false)
    return {decision:{reply:'Checking fictional rows.',actions:[{kind:'csv.audit'}]},
      displayableSummary:'Public audit summary.'}}}})
  try{
    await good(host,'bootstrap')
    id=(await submit(host)).id
    const reply=await runner.run({turnId:id})
    assert.equal(reply.ok,true,JSON.stringify(reply))
    assert.equal(reply.result.phase,'settled')
    assert.equal(providerCalls,1)
    const turn=await good(host,'turn.read',{turn_id:id})
    assert.equal(turn.state,'actions_recorded')
    assert.equal(turn.provider_summary,'Public audit summary.')
    taskId=turn.actions[0].task.task_id
    assert.equal(turn.actions[0].task.status,'completed')
    assert.equal((await good(host,'task.result',{task_id:taskId})).metadata.total,'6')
    assert.equal((await good(host,'inbox.list')).length,1)
    assert.equal(runner.snapshot().activity.taskStatus,'completed')
    assert.doesNotMatch(JSON.stringify(runner.snapshot()),/ticket|csv_text|grants|context_signature/)
  }finally{runner.dispose();await runner.whenIdle();await host.dispose()}
  const reopened=createProductHost({python,workspace,dataRoot})
  try{
    assert.equal((await good(reopened,'turn.read',{turn_id:id})).actions[0].task.status,'completed')
    assert.equal((await good(reopened,'task.result',{task_id:taskId})).metadata.total,'6')
  }finally{await reopened.dispose()}
})

test('no grant cannot acquire a task; no-action reply does not execute or run worker',async()=>{
  const dataRoot=await fresh(),real=createProductHost({python,workspace,dataRoot}),actions=[]
  const host={request(action,payload){actions.push(action);return real.request(action,payload)}}
  try{
    await good(host,'bootstrap')
    const denied=await submit(host,{grant:false})
    const runner=createTurnRunner({host,provider:{configured:true,respond:()=>({
      decision:{reply:'Cannot execute this action.',actions:[{kind:'csv.audit'}]}})}})
    const failed=await runner.run({turnId:denied.id})
    assert.equal(failed.ok,false)
    assert.equal(failed.error,'permission_denied')
    assert.equal((await good(host,'turn.read',{turn_id:denied.id})).state,'model_failed')
    assert.equal(actions.includes('turn.execute'),false)
    assert.equal(actions.includes('worker.run-next'),false)
    runner.dispose()
    await runner.whenIdle()
    const plain=await submit(host)
    const replyRunner=createTurnRunner({host,provider:{configured:true,respond:()=>({
      decision:{reply:'No tool is needed.'},displayableSummary:null})}})
    assert.equal((await replyRunner.run({turnId:plain.id})).result.phase,'responded')
    assert.equal((await good(host,'turn.read',{turn_id:plain.id})).provider_summary,null)
    assert.equal(actions.includes('turn.execute'),false)
    replyRunner.dispose();await replyRunner.whenIdle()
  }finally{await real.dispose()}
})

test('context change is a business failure even when accept envelope succeeds',async()=>{
  const dataRoot=await fresh(),real=createProductHost({python,workspace,dataRoot}),actions=[]
  const host={request(action,payload){actions.push(action);return real.request(action,payload)}}
  try{
    await good(host,'bootstrap')
    const conversationId=randomUUID(),original=await submit(host,{conversationId})
    const runner=createTurnRunner({host,provider:{configured:true,async respond(){
      await submit(host,{conversationId})
      return {decision:{reply:'Late decision',actions:[{kind:'csv.audit'}]}}
    }}})
    const reply=await runner.run({turnId:original.id})
    assert.equal(reply.error,'context_changed')
    assert.equal((await good(host,'turn.read',{turn_id:original.id})).state,'model_failed')
    assert.equal(actions.includes('turn.execute'),false)
    assert.equal(actions.includes('worker.run-next'),false)
    runner.dispose();await runner.whenIdle()
  }finally{await real.dispose()}
})

test('real CSV tool failure is reported as failed task, never completed work',async()=>{
  const dataRoot=await fresh(),host=createProductHost({python,workspace,dataRoot})
  const runner=createTurnRunner({host,provider:{configured:true,respond:()=>({
    decision:{reply:'Checking data.',actions:[{kind:'csv.audit'}]}})}})
  try{
    await good(host,'bootstrap')
    const id=randomUUID()
    await good(host,'turn.submit',{turn:{command_id:id,conversation_id:randomUUID(),
      text:'Audit fictional malformed CSV',csv_text:'item,item,qty,unit_price,currency\nA,A,2,3,CNY\n'},
      capabilities:['csv.audit']})
    const reply=await runner.run({turnId:id})
    assert.equal(reply.ok,true)
    assert.equal(reply.result.activity.taskStatus,'failed')
    assert.equal(reply.result.activity.displayState,'failed')
    assert.equal((await good(host,'turn.read',{turn_id:id})).actions[0].task.status,'failed')
  }finally{runner.dispose();await runner.whenIdle();await host.dispose()}
})

test('one worker pass may finish an earlier turn; explicit local pass advances current turn once',async()=>{
  const dataRoot=await fresh(),host=createProductHost({python,workspace,dataRoot})
  const runner=createTurnRunner({host,provider:{configured:true,respond:()=>({
    decision:{reply:'Checking current data.',actions:[{kind:'csv.audit'}]}})}})
  try{
    await good(host,'bootstrap')
    const older=await submit(host)
    const prior=await good(host,'turn.begin',{turn_id:older.id})
    await good(host,'turn.accept',{turn_id:older.id,ticket:prior.ticket,
      decision:{reply:'Older task',actions:[{kind:'csv.audit'}]}})
    await good(host,'turn.execute',{turn_id:older.id})
    const current=await submit(host)
    const first=await runner.run({turnId:current.id})
    assert.equal(first.ok,true)
    assert.equal(first.result.phase,'waiting_for_worker')
    assert.equal(first.result.activity.taskStatus,'queued')
    assert.equal((await good(host,'turn.read',{turn_id:older.id})).actions[0].task.status,'completed')
    const second=await runner.runLocalOnce({turnId:current.id})
    assert.equal(second.result.activity.taskStatus,'completed')
    assert.equal((await good(host,'turn.read',{turn_id:current.id})).actions[0].task.status,'completed')
  }finally{runner.dispose();await runner.whenIdle();await host.dispose()}
})
