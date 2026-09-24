/** Offline synthetic-decision integration demonstration; creates a new data root each run. */
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { createProductHost } from '../apps/desktop/product/host.mjs'
import { createProductSession } from '../apps/desktop/product/session.mjs'

const workspace = path.resolve(fileURLToPath(new URL('..',import.meta.url)))
const python = path.resolve(workspace,'../companion-agent/.venv/Scripts/python.exe')
const parent = path.join(workspace,'.test-data')
await fs.mkdir(parent,{recursive:true})
const dataRoot = await fs.mkdtemp(path.join(parent,'core-002-demo-'))
const csv = 'item,unit,qty,unit_price,currency\n笔,支,2,3,CNY\n'
async function good(host,action,payload={}) {
  const response = await host.request(action,payload)
  if (!response.ok) throw new Error(`${action}:${response.error.code}`)
  return response.result
}

let host = createProductHost({python,workspace,dataRoot})
const conversationId = randomUUID()
let identity, turnId, taskId, reminderId
try {
  identity = (await good(host,'bootstrap')).profile.profile_id
  await good(host,'memory.add',{content:'喜欢简短的核对说明',category:'preferences'})
  const session = createProductSession({host,intent:()=>['csv.audit']})
  const submitted = await session.submitTurn({conversation_id:conversationId,text:'核对虚构采购表',csv_text:csv})
  if (!submitted.ok) throw new Error(submitted.error)
  turnId = submitted.result.id
  const context = await good(host,'turn.begin',{turn_id:turnId})
  await good(host,'turn.accept',{turn_id:turnId,ticket:context.ticket,
    decision:{reply:'我会核对表格。',actions:[{kind:'csv.audit'}]}})
  taskId = (await good(host,'turn.execute',{turn_id:turnId})).actions[0].task.task_id
  await good(host,'worker.run-next')
  reminderId = randomUUID()
  await good(host,'reminder.create',{command_id:reminderId,text:'查看核对结果',
    due_at:new Date(Date.now()+3600_000).toISOString()})
  await good(host,'reminder.revise',{command_id:randomUUID(),id:reminderId,expected_revision:1,
    operation:'update',text:'复查核对结果',due_at:new Date(Date.now()+7200_000).toISOString()})
  session.dispose()
} finally { await host.dispose() }

host = createProductHost({python,workspace,dataRoot})
try {
  const session = createProductSession({host})
  const conversations = await session.loadConversations()
  const turns = await session.openConversation(conversationId)
  const selected = await session.selectTurn(turnId)
  const result = await good(host,'task.result',{task_id:taskId})
  const reminder = await good(host,'reminder.read',{id:reminderId})
  const reopened = await good(host,'home')
  const output = {
    kind:'offline_scripted_model_real_local_services', data_root:dataRoot,
    profile_id:identity, identity_stable:reopened.profile.profile_id===identity,
    conversation_id:conversationId, listed:conversations.result.some(item=>item.conversation_id===conversationId),
    turn_id:turnId, reopened_turn:turns.result.some(item=>item.id===turnId) && selected.result.id===turnId,
    task_id:taskId, task_status:selected.result.actions[0].task.status,
    csv_total:result.metadata.total, reminder_revision:reminder.revision, reminder_text:reminder.text,
    memories_retrieved:(await good(host,'memory.list')).length,
    model_http_requests:0,credential_reads:0,model_decision_source:'synthetic',
    native_isolation:'not_run',visual_ui:'not_run',
  }
  console.log(JSON.stringify(output,null,2))
  session.dispose()
} finally { await host.dispose() }
