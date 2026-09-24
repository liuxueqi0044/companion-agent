import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import {createProductHost} from '../../../apps/desktop/product/host.mjs'
import {projectActivity} from '../../../apps/desktop/product/application/activity.mjs'
import {createResultController} from '../../../apps/desktop/product/application/results.mjs'

const workspace=path.resolve(fileURLToPath(new URL('../../..',import.meta.url)))
const python=path.resolve(workspace,'../companion-agent/.venv/Scripts/python.exe')
const fresh=async()=>{await fs.mkdir(path.join(workspace,'.test-data'),{recursive:true});
  return fs.mkdtemp(path.join(workspace,'.test-data','core-003-result-'))}
const good=async(host,action,payload={})=>{const reply=await host.request(action,payload)
  assert.equal(reply.ok,true,JSON.stringify(reply));return reply.result}
const defer=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return{promise,resolve}}
const task=(taskId,attemptId,status)=>({task_id:taskId,current_attempt_id:attemptId,status,
  attempt_count:1,requirements_interpretation:'not_run',input_hash:'HIDDEN'})
const turn=(taskId,attemptId,status)=>({id:randomUUID(),state:'actions_recorded',
  reply:'The model claims everything is complete',provider_summary:null,
  actions:[{id:randomUUID(),kind:'csv.audit',state:'accepted',task:task(taskId,attemptId,status),
    events:{task_id:taskId,items:[],next_after_seq:null}}]})

test('activity keeps turn, action, task and stop facts separate across states',()=>{
  const tid=randomUUID(),aid=randomUUID()
  for(const status of ['queued','running','cancelling','completed','failed','interrupted']){
    const projected=projectActivity({turn:turn(tid,aid,status)})
    assert.equal(projected.taskStatus,status)
    assert.equal(projected.displayState,status)
    assert.equal(projected.workerExited,null)
    assert.equal(projected.progress,null)
    assert.equal(JSON.stringify(projected).includes('HIDDEN'),false)
  }
  for(const state of ['queued','generating','responded','model_failed','cancelled','outcome_unknown']){
    const projected=projectActivity({turn:{id:randomUUID(),state,reply:'completed!',actions:[]}})
    assert.notEqual(projected.displayState,'completed')
  }
  const running=projectActivity({turn:turn(tid,aid,'running'),stop:{permission_revoked:true,
    worker_exited:null,tasks:[{task_id:tid,cancel_requested:true,needs_reconciliation:false}]}})
  assert.equal(running.cancelRequested,true)
  assert.equal(running.taskStatus,'running')
  assert.equal(running.workerExited,null)
})

test('activity rejects foreign events and distinguishes historical attempts',()=>{
  const tid=randomUUID(),current=randomUUID(),historical=randomUUID()
  const sample=turn(tid,current,'completed')
  sample.actions[0].events={task_id:tid,next_after_seq:2,items:[
    {task_id:tid,attempt_id:historical,seq:1,kind:'interrupted',status:'interrupted'},
    {task_id:tid,attempt_id:historical,seq:1,kind:'interrupted',status:'interrupted'},
    {task_id:randomUUID(),attempt_id:current,seq:2,kind:'completed',status:'completed'}]}
  const projected=projectActivity({turn:sample})
  assert.equal(projected.protocolError,true)
  assert.equal(projected.events.length,1)
  assert.equal(projected.events[0].historical,true)
  assert.equal(projected.hasMoreEvents,true)
})

test('real CSV result preserves source and non-complete totals for mixed or missing columns',async()=>{
  const host=createProductHost({python,workspace,dataRoot:await fresh()})
  try{
    await good(host,'bootstrap')
    for(const [csv,expected] of [
      ['item,unit,qty,unit_price,currency\nA,x,2,3,CNY\nB,x,1,4,USD\n','mixed_currency'],
      ['item,qty,unit_price,currency\nA,2,3,CNY\n','partial']]){
      const id=randomUUID(),conv=randomUUID()
      await good(host,'turn.submit',{turn:{command_id:id,conversation_id:conv,text:'audit fictional CSV',
        csv_text:csv,temporary:false},capabilities:['csv.audit']})
      const context=await good(host,'turn.begin',{turn_id:id})
      await good(host,'turn.accept',{turn_id:id,ticket:context.ticket,
        decision:{reply:'I will audit it',actions:[{kind:'csv.audit'}]}})
      await good(host,'turn.execute',{turn_id:id})
      await good(host,'worker.run-next')
      const selected=await good(host,'turn.read',{turn_id:id})
      const taskId=selected.actions[0].task.task_id
      const control=createResultController({host})
      const opened=await control.open({turn:selected,taskId})
      assert.equal(opened.ok,true)
      assert.equal(opened.result.metadata.completeness,expected)
      assert.equal(opened.result.metadata.total,null)
      assert.equal(opened.result.metadata.requirements_interpretation,'not_run')
      assert.ok(opened.result.rows[0].source_refs)
      control.dispose()
    }
  }finally{await host.dispose()}
})

test('result selection and attempt binding reject stale or mismatched pages',async()=>{
  const idA=randomUUID(),idB=randomUUID(),attemptA=randomUUID(),attemptB=randomUUID()
  const first=defer()
  const host={request(action,payload){
    if(payload.task_id===idA)return first.promise
    return Promise.resolve({ok:true,result:{task_id:idB,attempt_id:attemptB,status:'completed',
      metadata:{completeness:'complete',total:'6',total_currency:'CNY'},
      rows:[{record_index:1,cells:{},source_refs:{},subtotal:'6',currency:'CNY',formula:null}],
      next_offset:null,issues:[],next_issue_offset:null}})
  }}
  const control=createResultController({host})
  const a=turn(idA,attemptA,'completed'),b=turn(idB,attemptB,'completed')
  const stale=control.open({turn:a,taskId:idA})
  const newest=control.open({turn:b,taskId:idB})
  first.resolve({ok:true,result:{task_id:idA,attempt_id:attemptA,status:'completed',
    metadata:{},rows:[],next_offset:null,issues:[],next_issue_offset:null}})
  assert.equal((await stale).error,'stale_view')
  assert.equal((await newest).ok,true)
  assert.equal(control.snapshot().taskId,idB)
  control.invalidate();assert.equal(control.snapshot().taskId,null)
  assert.equal((await control.open({turn:turn(idA,attemptA,'running'),taskId:idA})).error,
    'result_not_ready')
  control.dispose()
})

test('row and issue cursors advance independently and reject attempt drift',async()=>{
  const taskId=randomUUID(),attemptId=randomUUID(),calls=[]
  const meta={headers:['item'],completeness:'partial',total:null,requirements_interpretation:'not_run'}
  const row=n=>({record_index:n,cells:{item:String(n)},source_refs:{item:`row:${n}`},subtotal:null,
    currency:null,formula:null})
  const issue=n=>({code:'missing_column',column:`col${n}`,record_index:n,source:`row:${n}`})
  const host={request(action,payload){calls.push(structuredClone(payload))
    if(payload.offset===0 && payload.issue_offset===0)return Promise.resolve({ok:true,
      result:{task_id:taskId,attempt_id:attemptId,status:'completed',metadata:meta,
        rows:[row(1)],next_offset:1,issues:[issue(1)],next_issue_offset:1}})
    if(payload.limit===50)return Promise.resolve({ok:true,
      result:{task_id:taskId,attempt_id:attemptId,status:'completed',metadata:meta,
        rows:[row(2)],next_offset:null,issues:[issue(2)],next_issue_offset:null}})
    return Promise.resolve({ok:true,result:{task_id:taskId,attempt_id:attemptId,status:'completed',
      metadata:meta,rows:[row(2)],next_offset:null,issues:[issue(2)],next_issue_offset:null}})
  }}
  const control=createResultController({host})
  await control.open({turn:turn(taskId,attemptId,'completed'),taskId})
  const rows=control.loadMoreRows(),issues=control.loadMoreIssues()
  assert.equal((await rows).ok,true)
  assert.equal((await issues).ok,true)
  assert.equal(control.snapshot().rows.length,2)
  assert.equal(control.snapshot().issues.length,2)
  assert.equal((await control.loadMoreRows()).error,'no_more_pages')
  assert.equal((await control.loadMoreIssues()).error,'no_more_pages')
  assert.equal(calls.length,3)
  control.dispose()
})
