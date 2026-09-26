import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {createProductHost} from '../../../apps/desktop/product/host.mjs'
import {createProductRuntime} from '../../../apps/desktop/product/runtime/index.mjs'
import {createInterfaceSession} from '../../../apps/desktop/product/interface/session.mjs'
import {createDeepSeekProviders} from '../../../apps/desktop/product/providers/deepseek.mjs'
import {createRequestLedger} from '../../../apps/desktop/product/providers/request-ledger.mjs'
import {projectActivity} from '../../../apps/desktop/product/application/activity.mjs'
import {turnView} from '../../../apps/desktop/product/application/index.mjs'
import {presentActivity,currentStop} from '../../../apps/desktop/personal-space/activity.mjs'

const csv='name,qty\nA,2\nA,3\nB,4\n'
const query=(sql='SELECT name,sum(num(qty)) AS total FROM data GROUP BY name ORDER BY name')=>({kind:'data.query',title:'汇总',sql})
const reply=(actions=[],other={})=>({decision:{reply:'公开回应',actions,...other},displayableSummary:'根据回执处理当前步骤。'})
const deferred=()=>{let resolve;return {promise:new Promise(r=>{resolve=r}),resolve:(...a)=>resolve(...a)}}
async function fixture(respond,wrap=x=>x){
  const root=await fs.mkdtemp(path.resolve('.test-data/core014-'))
  const real=createProductHost({python:path.resolve('../companion-agent/.venv/Scripts/python.exe'),workspace:process.cwd(),dataRoot:root})
  const host=wrap(real),runtime=createProductRuntime({host,intent:()=>['task.loop','data.query','artifact.create','tool.save','tool.run'],turnProvider:{configured:true,respond}})
  assert.ok((await runtime.initialize()).ok)
  return {root,host,real,runtime,input:{command_id:randomUUID(),conversation_id:randomUUID(),text:'检查附件、汇总并保存报告',csv_text:csv},
    async close(){runtime.dispose();await runtime.whenIdle();await real.dispose()}}
}

test('actual serial loop repairs, observes, saves, finishes and projects through shared SDK',async()=>{
  const contexts=[]
  const x=await fixture(c=>{
    contexts.push(c)
    if(c.workflow.step===1)return reply([query('SELECT missing FROM data')],{plan:['检查附件','计算汇总','保存报告']})
    if(c.workflow.step===2){assert.equal(c.workflow.receipts[0].error,'tool_query_rejected');return reply([query()])}
    if(c.workflow.step===3){assert.deepEqual(c.workflow.receipts.at(-1).rows,[{name:'A',total:5},{name:'B',total:4}]);return reply([{kind:'artifact.create',title:'报告',files:[{path:'report.md',content:'A=5; B=4'}]}])}
    assert.match(c.workflow.receipts.at(-1).meaning,/not executed/);return reply([],{outcome:'complete',reply:'A 为 5，B 为 4，报告已保存。'})
  })
  let ui
  try{
    ui=await createInterfaceSession({runtime:x.runtime,scopes:['conversation','tasks']})
    const phases=[];const off=x.runtime.subscribe(()=>phases.push(x.runtime.resources.execution().phase))
    const result=await ui.call('send',x.input);off();assert.ok(result.ok,JSON.stringify(result))
    const end=(await ui.call('turn.read',{turnId:x.input.command_id})).result
    assert.equal(contexts.length,4);assert.equal(end.state,'responded')
    assert.equal(end.workflow.steps.length,4);assert.equal(end.actions[0].state,'failed')
    assert.ok(phases.includes('observing'));assert.equal(end.workflow.steps[2].action_ids[0],end.actions[2].id)
    assert.equal(projectActivity({turn:end}).displayState,'reviewed')
    const presentation=presentActivity(end);assert.ok(presentation.done);assert.equal(presentation.heading,'已整理好结果')
    const artifact=await ui.call('artifact.read',{turnId:end.id,actionId:end.actions[1].id,download:false})
    assert.deepEqual(JSON.parse(artifact.result.files[0].content),contexts[2].workflow.receipts[1].rows)
    assert.equal((await ui.call('snapshot')).ok,true)
    assert.ok(!JSON.stringify(end).includes('context_signature'))
  }finally{ui?.dispose();await x.close()}
})

test('stop during next model judgment suppresses late actions and holds execution slot until provider exits',async()=>{
  const entered=deferred(),late=deferred();let calls=0
  const x=await fixture(async c=>{calls++;if(calls===1)return reply([query()]);entered.resolve();return late.promise})
  try{
    const sending=x.runtime.send(x.input);await entered.promise
    const stopped=await x.runtime.cancelSend({commandId:x.input.command_id});assert.ok(stopped.ok,JSON.stringify(stopped))
    await sending
    assert.equal(x.runtime.snapshot().runtime.executionBusy,true)
    const blocked=await x.runtime.send({...x.input,command_id:randomUUID()});assert.equal(blocked.error,'runner_busy')
    late.resolve(reply([{kind:'artifact.create',title:'late',files:[{path:'late.md',content:'must not save'}]}]))
    await x.runtime.whenIdle()
    const end=(await x.real.request('turn.read',{turn_id:x.input.command_id})).result
    assert.equal(end.state,'cancelled');assert.equal(end.actions.length,1);assert.equal(calls,2)
    assert.equal(end.workflow.can_continue,false)
  }finally{late.resolve(reply());await x.close()}
})

test('network/provider failure is not retried; manual resume reads prior receipts',async()=>{
  let calls=0
  const x=await fixture(c=>{calls++;if(calls===1)return reply([query()]);if(calls===2)throw Error('network');assert.equal(c.workflow.receipts[0].row_count,2);return reply()})
  try{
    const first=await x.runtime.send(x.input);assert.equal(first.ok,false);await x.runtime.whenIdle()
    assert.equal(calls,2)
    const interrupted=(await x.runtime.resources.turn({turnId:x.input.command_id})).result
    assert.equal(interrupted.state,'model_failed');assert.equal(interrupted.workflow.can_continue,true)
    const resumed=await x.runtime.resources.start({turnId:x.input.command_id});assert.ok(resumed.ok,JSON.stringify(resumed))
    const end=(await x.runtime.resources.turn({turnId:x.input.command_id})).result
    assert.equal(end.state,'responded');assert.equal(end.actions.length,1);assert.equal(calls,3)
    assert.equal(end.workflow.steps[1].state,'failed')
  }finally{await x.close()}
})

test('eight-step checkpoint pauses durably; next explicit start can finish',async()=>{
  let calls=0
  const x=await fixture(()=>++calls<=8?reply([query()]):reply())
  try{
    const sent=await x.runtime.send(x.input);assert.ok(sent.ok,JSON.stringify(sent));assert.equal(calls,8)
    const pause=(await x.runtime.resources.turn({turnId:x.input.command_id})).result
    assert.equal(pause.state,'paused');assert.equal(pause.workflow.can_continue,true)
    assert.equal(presentActivity(pause).done,false)
    assert.ok((await x.runtime.resources.start({turnId:pause.id})).ok)
    const end=(await x.runtime.resources.turn({turnId:pause.id})).result
    assert.equal(end.state,'responded');assert.equal(end.workflow.step_count,9);assert.equal(end.actions.length,8)
  }finally{await x.close()}
})

test('uncertain committed execution blocks observation/model continuation',async()=>{
  let calls=0,lost=false
  const x=await fixture(()=>{calls++;return reply([query()])},real=>({request:async(action,payload)=>{
    const result=await real.request(action,payload)
    if(action==='turn.execute'&&!lost){lost=true;assert.ok(result.ok);return {ok:false,error:{code:'outcome_unknown'}}}
    return result
  }}))
  try{
    const sent=await x.runtime.send(x.input);assert.equal(sent.ok,false);assert.equal(calls,1)
    const end=(await x.real.request('turn.read',{turn_id:x.input.command_id})).result
    assert.equal(end.actions[0].state,'accepted')
    assert.equal(x.runtime.resources.execution().needsReconciliation,true)
    const forbidden=await x.runtime.resources.start({turnId:end.id});assert.equal(forbidden.error,'reconciliation_required')
  }finally{await x.close()}
})

test('accepted but unexecuted step is resumed without an extra model generation',async()=>{
  let calls=0
  const x=await fixture(c=>{calls++;assert.equal(c.workflow.receipts[0].row_count,2);return reply()})
  try{
    const id=x.input.command_id
    assert.ok((await x.host.request('turn.submit',{turn:x.input,capabilities:['task.loop','data.query']})).ok)
    const begun=(await x.host.request('turn.begin',{turn_id:id})).result
    assert.ok((await x.host.request('turn.accept',{turn_id:id,ticket:begun.ticket,decision:reply([query()]).decision})).ok)
    const result=await x.runtime.resources.start({turnId:id});assert.ok(result.ok,JSON.stringify(result))
    assert.equal(calls,1);assert.equal((await x.runtime.resources.turn({turnId:id})).result.actions.length,1)
  }finally{await x.close()}
})

test('ordinary conversation has no synthetic tool card or second model call',async()=>{
  let calls=0
  const x=await fixture(()=>{calls++;return reply([],{reply:'你好。'})})
  try{
    assert.ok((await x.runtime.send({...x.input,text:'你好'})).ok)
    const end=(await x.runtime.resources.turn({turnId:x.input.command_id})).result
    assert.equal(calls,1);assert.equal(presentActivity(end).mode,null)
    assert.equal(currentStop({work:{selected:true,turnId:end.id,phase:'observing'}}).action,'work.stop')
    const forged={...end,workflow:{...end.workflow,ticket:'private',steps:[...end.workflow.steps]}}
    assert.ok(!JSON.stringify(turnView(forged)).includes('private'))
    forged.workflow.steps[0].action_ids=['not-an-id']
    assert.equal(projectActivity({turn:forged}).protocolError,true)
  }finally{await x.close()}
})

test('DeepSeek adapter accepts plan and outcome as data, without claiming hidden reasoning',async()=>{
  const root=await fs.mkdtemp(path.resolve('.test-data/core014-adapter-'))
  const ledger=createRequestLedger({file:path.join(root,'ledger.json')})
  let system
  const p=createDeepSeekProviders({apiKey:'synthetic-not-a-key',ledger,fetchImpl:async(_,init)=>{
    system=JSON.parse(init.body).messages[0].content
    return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(reply([],{plan:['核对结果'],outcome:'needs_input'}).decision),reasoning_content:'private chain'}}]}))
  }})
  const r=await p.turn.respond({workflow:{step:1,receipts:[]}})
  assert.equal(r.decision.outcome,'needs_input');assert.deepEqual(r.decision.plan,['核对结果'])
  assert.match(system,/data.query/);assert.match(system,/rows_truncated/)
  assert.ok(!JSON.stringify(r).includes('private chain'))
})
