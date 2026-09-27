import {resolveRuntime} from '../apps/desktop/product/runtime-paths.mjs'
/** Explicit offline driver: synthetic decisions only, real host and local services. */
import * as fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import {createProductHost} from '../apps/desktop/product/host.mjs'
import {createTurnRunner} from '../apps/desktop/product/execution/runner.mjs'
import {createProductApplication} from '../apps/desktop/product/application/index.mjs'

const workspace=path.resolve(fileURLToPath(new URL('..',import.meta.url)))
const python=resolveRuntime('python')
const parent=path.join(workspace,'.test-data')
await fs.mkdir(parent,{recursive:true})
const dataRoot=await fs.mkdtemp(path.join(parent,'core-004-demo-'))
const csv='item,unit,qty,unit_price,currency\nPen,piece,2,3,CNY\n'
const expect=reply=>{if(!reply.ok)throw new Error(reply.error);return reply.result}
const good=async(host,action,payload={})=>{const reply=await host.request(action,payload)
  if(!reply.ok)throw new Error(`${action}:${reply.error.code}`)
  return reply.result}
const defer=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return{promise,resolve}}
const entered=defer(),held=defer()
let syntheticProviderCalls=0,host=createProductHost({python,workspace,dataRoot})
const runner=createTurnRunner({host,provider:{configured:true,respond(context){
  syntheticProviderCalls++
  if(Object.hasOwn(context,'ticket'))throw new Error('ticket_exposed_to_provider')
  if(syntheticProviderCalls===1)return {decision:{reply:'I will check fictional rows.',
    actions:[{kind:'csv.audit'}]},displayableSummary:'Public summary of a local audit.'}
  entered.resolve()
  return held.promise
}}})
let app=createProductApplication({host,runner,intent:()=>['csv.audit']})
let firstId,secondId,taskId,profileId,stopState,activity,total,sourceRefs,unread
try{
  profileId=expect(await app.initialize()).home.profile.profile_id
  expect(await app.open({panel:'conversation'}))
  firstId=expect(await app.conversation.submitTurn({conversation_id:randomUUID(),
    text:'Audit fictional CSV',csv_text:csv})).id
  expect(await app.open({panel:'conversation',turnId:firstId}))
  const first=expect(await app.work.startSelected())
  if(first.phase!=='settled'||first.activity.taskStatus!=='completed')throw new Error('audit_not_completed')
  expect(await app.conversation.refreshSelected())
  activity=app.snapshot().activity
  taskId=activity.taskId
  const result=expect(await app.result.open({taskId}))
  total=result.metadata.total
  sourceRefs=!!result.rows[0]?.source_refs
  expect(await app.open({panel:'inbox'}))
  unread=app.inbox.snapshot().items.some(item=>item.kind==='task'&&!item.read)

  expect(await app.open({panel:'conversation'}))
  secondId=expect(await app.conversation.submitTurn({conversation_id:randomUUID(),
    text:'Second fictional CSV, intentionally stopped',csv_text:csv})).id
  expect(await app.open({panel:'conversation',turnId:secondId}))
  const second=app.work.startSelected()
  await entered.promise
  stopState=expect(await app.work.stopSelected())
  held.resolve({decision:{reply:'Late synthetic reply',actions:[{kind:'csv.audit'}]}})
  if((await second).error!=='provider_aborted')throw new Error('stopped_run_continued')
  await runner.whenIdle()
  if((await good(host,'turn.read',{turn_id:secondId})).state!=='cancelled')
    throw new Error('permission_not_revoked')
}finally{
  runner.dispose();await runner.whenIdle();app.dispose();await host.dispose()
}

host=createProductHost({python,workspace,dataRoot})
try{
  app=createProductApplication({host})
  const reopenedHome=expect(await app.initialize()).home
  expect(await app.open({panel:'conversation',turnId:firstId}))
  const reopened=app.snapshot().activity
  const reopenedResult=expect(await app.result.open({taskId}))
  const stopped=await good(host,'turn.read',{turn_id:secondId})
  if(reopenedHome.profile.profile_id!==profileId || reopened.taskStatus!=='completed' ||
    reopenedResult.metadata.total!=='6' || stopped.state!=='cancelled')
    throw new Error('reopen_mismatch')
  console.log(JSON.stringify({kind:'core004_synthetic_provider_real_local_chain',data_root:dataRoot,
    first_turn_id:firstId,task_id:taskId,task_status:activity.taskStatus,
    result_total:total,source_refs_present:sourceRefs,task_message_unread:unread,
    reopened_identity_stable:true,reopened_task_status:reopened.taskStatus,
    second_turn_id:secondId,second_turn_state:stopped.state,
    stop_permission_revoked:stopState.permissionRevoked,stop_worker_exited:stopState.workerExited,
    synthetic_provider_calls:syntheticProviderCalls,real_model_http_requests:0,credential_reads:0,
    semantic_understanding:'not_run',native_isolation:'not_run',visual_ui:'not_run'},null,2))
  app.dispose()
}finally{await host.dispose()}
