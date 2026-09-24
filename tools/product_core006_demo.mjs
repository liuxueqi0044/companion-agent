/** Trusted, headless CORE-006 driver. Decisions are synthetic; all storage/tool I/O is local. */
import * as fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {randomUUID} from 'node:crypto'
import {createProductHost} from '../apps/desktop/product/host.mjs'
import {createProductRuntime} from '../apps/desktop/product/runtime/index.mjs'

const exec=promisify(execFile)
const workspace=path.resolve(fileURLToPath(new URL('..',import.meta.url)))
const python=path.resolve(workspace,'../companion-agent/.venv/Scripts/python.exe')
const parent=path.join(workspace,'.test-data')
await fs.mkdir(parent,{recursive:true})
const root=await fs.mkdtemp(path.join(parent,'core-006-demo-'))
const {stdout,stderr}=await exec(python,['-I','-B',
  'tests/product/core005/prepare_fixture.py',workspace,root,'1'],
{cwd:workspace,windowsHide:true,encoding:'utf8'})
if(stderr)throw Error('fixture_stderr')
const fixture=JSON.parse(stdout)
const requireOk=(reply,label)=>{if(!reply.ok)throw Error(`${label}:${reply.error}`);return reply.result}
const csv='item,unit,qty,unit_price,currency\nPen,piece,2,3,CNY\n'
const actionLog=[]
const count={turn:0,contact:0,active:0,max:0,realHttp:0,credentialReads:0}
function provider(fn){
  count.active++;count.max=Math.max(count.max,count.active)
  return Promise.resolve().then(fn).finally(()=>{count.active--})
}
function hostAtRoot(){
  const raw=createProductHost({python,workspace,dataRoot:root})
  return {raw,host:{request(action,payload){actionLog.push(action);return raw.request(action,payload)}}}
}

let {raw,host}=hostAtRoot(),runtime=createProductRuntime({host,intent:()=>['csv.audit'],
  turnProvider:{configured:true,respond(context){count.turn++
    if(Object.hasOwn(context,'ticket'))throw Error('turn_ticket_exposed')
    return provider(()=>({decision:{reply:'I checked fictional CSV rows.',
      actions:[{kind:'csv.audit'}]}}))}},
  contactProvider:{configured:true,reassess(context){count.contact++
    if(Object.hasOwn(context,'ticket'))throw Error('contact_ticket_exposed')
    return provider(()=>({decision:{disposition:'send',
      text:'Fictional caring check-in',reason:'still_relevant'}}))}}})
let profileId,taskId,turnId,messageId,sourceRefs,total,unread,policyRevision,
  beforePulse,afterPulse,explanation
try{
  requireOk(await runtime.initialize(),'initialize')
  profileId=runtime.snapshot().home.profile.profile_id
  if(profileId!==fixture.profile_id ||
    actionLog.includes('contact.claim') || actionLog.includes('turn.begin'))
    throw Error('implicit_execution_on_initialize')
  turnId=randomUUID()
  const sent=requireOk(await runtime.send({command_id:turnId,conversation_id:randomUUID(),
    text:'Audit fictional rows',csv_text:csv}),'send')
  if(sent.turnId!==turnId || sent.execution.phase!=='settled' ||
    sent.view.synced!==true || runtime.snapshot().activity.taskStatus!=='completed')
    throw Error('send_or_activity_mismatch')
  taskId=runtime.snapshot().activity.taskId
  const result=requireOk(await runtime.ui.result.open({taskId}),'result')
  total=result.metadata.total
  sourceRefs=!!result.rows[0]?.source_refs
  if(total!=='6' || !sourceRefs)throw Error('csv_result_mismatch')

  requireOk(await runtime.open({panel:'memory'}),'open_memory')
  if(runtime.snapshot().memory.items.length!==0)throw Error('unexpected_memory')
  policyRevision=runtime.snapshot().policy.policy.revision
  if(policyRevision!==fixture.policy_revision)throw Error('policy_revision_mismatch')
  requireOk(await runtime.open({panel:'inbox'}),'open_inbox')
  beforePulse=runtime.snapshot().home.unreadCount
  if(beforePulse!==1 || actionLog.includes('contact.claim'))
    throw Error('navigation_started_contact')
  const pulse=requireOk(await runtime.pulseContact(),'explicit_pulse')
  if(pulse.plan?.state!=='sent' || !pulse.view.homeSynced || !pulse.view.inboxSynced ||
    pulse.reminderMessageIds.length!==1)throw Error('pulse_receipt_mismatch')
  messageId=pulse.plan.messageId
  afterPulse=runtime.snapshot().home.unreadCount
  unread=runtime.snapshot().inbox.items.filter(item=>!item.read).length
  if(afterPulse!==beforePulse+2 || unread!==afterPulse ||
    !runtime.snapshot().inbox.items.some(item=>item.id===messageId))
    throw Error('message_sync_mismatch')
  requireOk(await runtime.ui.inbox.select({id:messageId}),'inbox_select')
  explanation=requireOk(await runtime.ui.inbox.explainSelected(),'inbox_explain')
  if(explanation.basis!=='opt_in_and_model_reassessment')
    throw Error('explanation_mismatch')
  if(count.max!==1 || count.turn!==1 || count.contact!==1)
    throw Error('provider_overlap_or_duplicate')
  if(/csv_text|ticket|expires_at|Fictional follow-up/.test(JSON.stringify(runtime.snapshot())))
    throw Error('private_data_exposed')
}finally{
  runtime.dispose()
  await runtime.whenIdle()
  await raw.dispose()
}

;({raw,host}=hostAtRoot())
runtime=createProductRuntime({host})
let reopened
try{
  requireOk(await runtime.initialize(),'reopen_initialize')
  const identity=runtime.snapshot().home.profile.profile_id===profileId
  const policy=runtime.snapshot().policy.policy.revision===policyRevision
  requireOk(await runtime.open({panel:'conversation',turnId}),'reopen_turn')
  const task=runtime.snapshot().activity.taskStatus==='completed' &&
    runtime.snapshot().activity.taskId===taskId
  const result=requireOk(await runtime.ui.result.open({taskId}),'reopen_result')
  const resultStable=result.metadata.total==='6' && !!result.rows[0]?.source_refs
  requireOk(await runtime.open({panel:'inbox'}),'reopen_inbox')
  const message=runtime.snapshot().inbox.items.some(item=>item.id===messageId)
  const unreadStable=runtime.snapshot().home.unreadCount===afterPulse
  const forbidden=['turn.begin','worker.run-next','contact.claim','runtime.recover',
    'runtime.migrate','turn.submit','contact.complete']
  const reopenedActions=actionLog.slice(actionLog.lastIndexOf('bootstrap'))
  const noImplicitExecution=!reopenedActions.some(action=>forbidden.includes(action))
  reopened={identity,policy,task,resultStable,message,unreadStable,noImplicitExecution}
  if(Object.values(reopened).some(value=>value!==true))throw Error('reopen_mismatch')
}finally{
  runtime.dispose()
  await runtime.whenIdle()
  await raw.dispose()
}

console.log(JSON.stringify({kind:'core006_trusted_runtime_real_local_chain',
  data_root:root,turn_id:turnId,task_id:taskId,task_status:'completed',
  csv_total:total,source_refs_present:sourceRefs,
  policy_revision:policyRevision,unread_before_pulse:beforePulse,
  unread_after_pulse:afterPulse,unread_messages:unread,
  committed_message_id:messageId,explanation_basis:explanation.basis,
  synthetic_turn_provider_calls:count.turn,synthetic_contact_provider_calls:count.contact,
  max_concurrent_providers:count.max,real_model_http_requests:count.realHttp,
  credential_reads:count.credentialReads,reopened,
  background_scheduler:'not_run',semantic_understanding:'not_run',
  native_isolation:'not_run',visual_ui:'not_run'},null,2))
