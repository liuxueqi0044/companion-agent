import {resolveRuntime} from '../apps/desktop/product/runtime-paths.mjs'
/** Trusted offline driver. Synthetic decision stays here, outside the application. */
import * as fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import {createProductHost} from '../apps/desktop/product/host.mjs'
import {createProductApplication} from '../apps/desktop/product/application/index.mjs'

const workspace=path.resolve(fileURLToPath(new URL('..',import.meta.url)))
const python=resolveRuntime('python')
const parent=path.join(workspace,'.test-data')
await fs.mkdir(parent,{recursive:true})
const dataRoot=await fs.mkdtemp(path.join(parent,'core-003-demo-'))
const csv='item,unit,qty,unit_price,currency\nPen,piece,2,3,CNY\n'
const good=async(host,action,payload={})=>{
  const reply=await host.request(action,payload)
  if(!reply.ok)throw new Error(`${action}:${reply.error.code}`)
  return reply.result
}
const expect=reply=>{if(!reply.ok)throw new Error(reply.error);return reply.result}
const appActions=[]
const applicationHost=host=>({request(action,payload){appActions.push(action);return host.request(action,payload)}})
let host=createProductHost({python,workspace,dataRoot})
let profileId,turnId,taskId,reminderId,policyRevision,application
try{
  application=createProductApplication({host:applicationHost(host),intent:()=>['csv.audit']})
  profileId=expect(await application.initialize()).home.profile.profile_id
  if(application.snapshot().policy.policy.proactive_enabled)throw new Error('unexpected_proactive_default')
  expect(await application.open({panel:'memory'}))
  expect(await application.memory.add({content:'Prefer short audit summaries',category:'preferences'}))
  expect(await application.memory.refresh())
  const memoryId=application.memory.snapshot().items[0].id
  expect(await application.memory.select({id:memoryId}))
  expect(await application.memory.edit({content:'Prefer concise source-linked audits'}))
  expect(await application.policy.updateMemory({expectedRevision:application.policy.snapshot().policy.revision,
    patch:{memory_enabled:false}}))
  expect(await application.open({panel:'contact'}))
  expect(await application.policy.updateContact({expectedRevision:application.policy.snapshot().policy.revision,
    patch:{proactive_enabled:true}}))
  expect(await application.policy.updateContact({expectedRevision:application.policy.snapshot().policy.revision,
    patch:{paused_until:new Date(Date.now()+3600_000).toISOString()}}))
  expect(await application.policy.updateContact({expectedRevision:application.policy.snapshot().policy.revision,
    patch:{proactive_enabled:false}}))
  policyRevision=application.policy.snapshot().policy.revision
  expect(await application.open({panel:'conversation'}))
  const submitted=expect(await application.conversation.submitTurn({conversation_id:randomUUID(),
    text:'Audit fictional CSV',csv_text:csv}))
  turnId=submitted.id
  // Only this trusted test driver generates a synthetic decision and invokes a worker.
  const context=await good(host,'turn.begin',{turn_id:turnId})
  await good(host,'turn.accept',{turn_id:turnId,ticket:context.ticket,
    decision:{reply:'I will audit the data.',actions:[{kind:'csv.audit'}]},
    provider_summary:'Public summary: checking supplied rows.'})
  taskId=(await good(host,'turn.execute',{turn_id:turnId})).actions[0].task.task_id
  await good(host,'worker.run-next')
  await good(host,'tasks.sync')
  expect(await application.open({panel:'conversation',turnId}))
  const activity=application.snapshot().activity
  if(activity.taskStatus!=='completed')throw new Error('task_not_completed')
  const result=expect(await application.result.open({taskId}))
  if(result.metadata.total!=='6')throw new Error('incorrect_total')
  expect(await application.open({panel:'inbox'}))
  const message=application.inbox.snapshot().items.find(item=>item.kind==='task')
  if(!message || message.read)throw new Error('missing_unread_message')
  expect(await application.inbox.markRead({id:message.id}))
  expect(await application.open({panel:'reminders'}))
  reminderId=expect(await application.reminders.create({text:'Check fictional audit',
    due_at:new Date(Date.now()+3600_000).toISOString()})).id
  expect(await application.reminders.refresh())
  expect(await application.reminders.select({id:reminderId}))
  expect(await application.reminders.update({text:'Review fictional audit',
    due_at:new Date(Date.now()+7200_000).toISOString()}))
  expect(await application.reminders.cancel())
  application.dispose()
}finally{await host.dispose()}

host=createProductHost({python,workspace,dataRoot})
try{
  application=createProductApplication({host:applicationHost(host)})
  const home=expect(await application.initialize()).home
  expect(await application.open({panel:'conversation',turnId}))
  const selected=application.snapshot().conversation.turn
  const result=expect(await application.result.open({taskId}))
  expect(await application.open({panel:'reminders'}))
  const reminder=application.reminders.snapshot().items.find(item=>item.id===reminderId)
  const forbidden=['contact.inspect','contact.tick','worker.run-next','worker.recover','runtime.recover',
    'runtime.migrate','turn.begin','turn.accept','turn.execute','tasks.sync']
  if(appActions.some(action=>forbidden.includes(action)))throw new Error('navigation_started_work')
  console.log(JSON.stringify({kind:'core003_offline_synthetic_decision_real_services',data_root:dataRoot,
    profile_id:profileId,identity_stable:home.profile.profile_id===profileId,
    turn_id:turnId,turn_reopened:selected?.id===turnId,task_id:taskId,
    task_status:selected?.actions[0]?.task?.status,csv_total:result.metadata.total,
    source_refs_present:!!result.rows[0]?.source_refs,unread_count:home.unreadCount,
    policy_revision:policyRevision,policy_reopened_revision:application.policy.snapshot().policy.revision,
    proactive_enabled:application.policy.snapshot().policy.proactive_enabled,
    reminder_state:reminder?.state,reminder_revision:reminder?.revision,
    application_actions:appActions,forbidden_navigation_actions:0,
    model_http_requests:0,credential_reads:0,model_decision_source:'synthetic',
    semantic_understanding:'not_run',native_isolation:'not_run',visual_ui:'not_run'},null,2))
  application.dispose()
}finally{await host.dispose()}
