import {resolveRuntime} from '../apps/desktop/product/runtime-paths.mjs'
/** Offline explicit-pulse driver: synthetic decisions and real local Node→Python→SQLite. */
import * as fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {randomUUID} from 'node:crypto'
import {createProductHost} from '../apps/desktop/product/host.mjs'
import {createContactRunner} from '../apps/desktop/product/execution/contact-runner.mjs'
import {createTurnRunner} from '../apps/desktop/product/execution/runner.mjs'

const exec=promisify(execFile)
const workspace=path.resolve(fileURLToPath(new URL('..',import.meta.url)))
const python=resolveRuntime('python')
const parent=path.join(workspace,'.test-data')
await fs.mkdir(parent,{recursive:true})
const fresh=()=>fs.mkdtemp(path.join(parent,'core-005-demo-'))
const good=async(host,action,payload={})=>{const reply=await host.request(action,payload)
  if(!reply.ok)throw new Error(`${action}:${reply.error.code}`)
  return reply.result}
const expect=reply=>{if(!reply.ok)throw new Error(reply.error);return reply.result}
const fixture=async(root,count)=>{
  const {stdout,stderr}=await exec(python,['-I','-B','tests/product/core005/prepare_fixture.py',
    workspace,root,String(count)],{cwd:workspace,windowsHide:true,encoding:'utf8'})
  if(stderr)throw new Error('fixture_failed')
  return JSON.parse(stdout)
}
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}}

const defaultRoot=await fresh(),defaultHost=createProductHost({python,workspace,dataRoot:defaultRoot})
let defaultOff
try{defaultOff=!(await good(defaultHost,'bootstrap')).policy.proactive_enabled}
finally{await defaultHost.dispose()}
if(!defaultOff)throw new Error('proactive_default_changed')

const root=await fresh(),prepared=await fixture(root,3)
let host=createProductHost({python,workspace,dataRoot:root})
let unavailable=createContactRunner({host}),contact,turn
let syntheticContactCalls=0,syntheticTurnCalls=0,activeProviders=0,maxConcurrentProviders=0
let reminderId,proactiveMessageId,taskId,turnId,profileId,contactBusy,turnResult
try{
  profileId=(await good(host,'home')).profile.profile_id
  const unavailableResult=expect(await unavailable.pulse())
  if(unavailableResult.modelAvailable!==false || unavailableResult.reminderMessageIds.length!==1 ||
    (await good(host,'contact.read',{id:prepared.plans[0].id})).state!=='pending')
    throw new Error('unavailable_consumed_contact')
  reminderId=unavailableResult.reminderMessageIds[0]
  unavailable.dispose();await unavailable.whenIdle()
  contact=createContactRunner({host,provider:{configured:true,async reassess(context){
    syntheticContactCalls++;activeProviders++
    maxConcurrentProviders=Math.max(maxConcurrentProviders,activeProviders)
    try{
      if(Object.hasOwn(context,'ticket'))throw new Error('contact_ticket_exposed')
      const number=Number(context.purpose.at(-1))
      if(number===0)return {decision:{disposition:'send',text:'Fictional check-in',
        reason:'still_relevant'}}
      if(number===1)return {decision:{disposition:'defer',
        due_at:new Date(Date.now()+60_000).toISOString(),reason:'later'}}
      return {decision:{disposition:'cancel',reason:'not_useful'}}
    }finally{activeProviders--}
  }}})
  const sent=expect(await contact.pulse()).plan
  const deferredPlan=expect(await contact.pulse()).plan
  const cancelled=expect(await contact.pulse()).plan
  if(sent.state!=='sent'||deferredPlan.state!=='pending'||cancelled.state!=='cancelled'||
    syntheticContactCalls!==3)throw new Error('branch_mismatch')
  proactiveMessageId=sent.messageId
  const entered=deferred(),held=deferred()
  turn=createTurnRunner({host,provider:{configured:true,async respond(context){
    syntheticTurnCalls++;activeProviders++
    maxConcurrentProviders=Math.max(maxConcurrentProviders,activeProviders)
    if(Object.hasOwn(context,'ticket'))throw new Error('turn_ticket_exposed')
    entered.resolve()
    try{return await held.promise}finally{activeProviders--}
  }}})
  turnId=randomUUID()
  const csv='item,unit,qty,unit_price,currency\nPen,piece,2,3,CNY\n'
  await good(host,'turn.submit',{turn:{command_id:turnId,conversation_id:randomUUID(),
    text:'Audit fictional rows',csv_text:csv},capabilities:['csv.audit']})
  const running=turn.run({turnId})
  await entered.promise
  contactBusy=(await contact.pulse()).error
  if(contactBusy!=='runner_busy')throw new Error('shared_slot_bypassed')
  held.resolve({decision:{reply:'I checked the fictional CSV.',actions:[{kind:'csv.audit'}]}})
  turnResult=expect(await running)
  if(turnResult.phase!=='settled'||turnResult.activity.taskStatus!=='completed')
    throw new Error('csv_not_complete')
  taskId=turnResult.activity.taskId
  if(maxConcurrentProviders!==1)throw new Error('provider_concurrency_violation')
}finally{
  turn?.dispose();contact?.dispose();unavailable.dispose()
  if(turn)await turn.whenIdle()
  if(contact)await contact.whenIdle()
  await unavailable.whenIdle();await host.dispose()
}

host=createProductHost({python,workspace,dataRoot:root})
let reopened
try{
  const inbox=await good(host,'inbox.list'),plan=await good(host,'contact.read',
    {id:prepared.plans[0].id}),result=await good(host,'task.result',{task_id:taskId})
  reopened={identityStable:(await good(host,'home')).profile.profile_id===profileId,
    proactiveCount:inbox.filter(item=>item.kind==='proactive').length,
    reminderCount:inbox.filter(item=>['reminder','missed_reminder'].includes(item.kind)).length,
    taskCount:inbox.filter(item=>item.kind==='task').length,
    messageStable:plan.state==='sent'&&plan.message_id===proactiveMessageId,
    inboxBasis:(await good(host,'inbox.explain',{id:proactiveMessageId})).basis,
    reminderBasis:(await good(host,'inbox.explain',{id:reminderId})).basis,
    csvTotal:result.metadata.total,sourceRefsPresent:!!result.rows[0]?.source_refs}
  if(!reopened.identityStable||!reopened.messageStable||reopened.proactiveCount!==1||
    reopened.reminderCount!==1||reopened.taskCount!==1||reopened.csvTotal!=='6'||
    !reopened.sourceRefsPresent)throw new Error('reopen_mismatch')
}finally{await host.dispose()}

const offRoot=await fresh(),offFixture=await fixture(offRoot,1)
host=createProductHost({python,workspace,dataRoot:offRoot})
let offReminderCount,offProviderCalls=0
const offRunner=createContactRunner({host,provider:{configured:true,
  reassess(){offProviderCalls++;throw Error('unexpected_provider')}}})
try{
  const policy=await good(host,'policy.read')
  await good(host,'policy.replace',{expected_revision:policy.revision,
    policy:{...policy,proactive_enabled:false}})
  const result=expect(await offRunner.pulse())
  offReminderCount=result.reminderMessageIds.length
  if(offReminderCount!==1||offProviderCalls!==0||result.plan!==null||
    (await good(host,'contact.read',{id:offFixture.plans[0].id})).state!=='cancelled')
    throw new Error('off_switch_violated')
}finally{offRunner.dispose();await offRunner.whenIdle();await host.dispose()}

console.log(JSON.stringify({kind:'core005_explicit_pulse_real_local_chain',
  data_root:root,default_proactive_off:defaultOff,unconfigured_reminder_delivered:true,
  enabled_states:['sent','pending','cancelled'],contact_busy_during_foreground:contactBusy,
  foreground_task_status:turnResult.activity.taskStatus,max_concurrent_providers:maxConcurrentProviders,
  synthetic_contact_provider_calls:syntheticContactCalls,
  synthetic_turn_provider_calls:syntheticTurnCalls,real_model_http_requests:0,
  credential_reads:0,off_switch_reminder_delivered:offReminderCount===1,
  off_switch_provider_calls:offProviderCalls,reopened,
  background_scheduler:'not_run',semantic_understanding:'not_run',
  native_isolation:'not_run',visual_ui:'not_run'},null,2))
