import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { createProductHost } from '../../apps/desktop/product/host.mjs'
import { createProductSession } from '../../apps/desktop/product/session.mjs'

const workspace = path.resolve(fileURLToPath(new URL('../..',import.meta.url)))
const python = path.resolve(workspace,'../companion-agent/.venv/Scripts/python.exe')
const fresh = async () => {
  const parent = path.join(workspace,'.test-data')
  await fs.mkdir(parent,{recursive:true})
  return fs.mkdtemp(path.join(parent,'core-002-host-'))
}
const good = async (host,action,payload={}) => {
  const reply = await host.request(action,payload)
  assert.equal(reply.ok,true,JSON.stringify(reply))
  return reply.result
}
const csv = 'item,unit,qty,unit_price,currency\n笔,支,2,3,CNY\n'

test('real reopenable Node to Python to SQLite to CSV chain and explicit reminder edit', async () => {
  const dataRoot = await fresh(), conversationId = randomUUID()
  let host = createProductHost({python,workspace,dataRoot})
  let profileId, taskId, turnId
  try {
    profileId = (await good(host,'bootstrap')).profile.profile_id
    const memory = await good(host,'memory.add',{content:'喜欢简洁说明',category:'preferences'})
    assert.equal(memory.revision,1)
    const session = createProductSession({host,intent:()=>['csv.audit']})
    const submitted = await session.submitTurn({conversation_id:conversationId,text:'核对虚构CSV',csv_text:csv})
    assert.equal(submitted.ok,true)
    turnId = submitted.result.id
    const context = await good(host,'turn.begin',{turn_id:turnId})
    await good(host,'turn.accept',{turn_id:turnId,ticket:context.ticket,
      decision:{reply:'开始核对。',actions:[{kind:'csv.audit'}]}})
    taskId = (await good(host,'turn.execute',{turn_id:turnId})).actions[0].task.task_id
    assert.equal((await good(host,'worker.run-next')).status,'completed')
    assert.equal((await good(host,'task.result',{task_id:taskId})).metadata.total,'6')
    const rid = randomUUID()
    const due = new Date(Date.now()+3600_000).toISOString()
    assert.equal((await good(host,'reminder.create',{command_id:rid,text:'旧提醒',due_at:due})).revision,1)
    assert.equal((await good(host,'reminder.revise',{command_id:randomUUID(),id:rid,expected_revision:1,
      operation:'update',text:'新提醒',due_at:new Date(Date.now()+7200_000).toISOString()})).revision,2)
    assert.equal((await good(host,'reminder.list')).items[0].text,'新提醒')
    const queued = await session.submitTurn({conversation_id:conversationId,text:'再核对一份虚构表',csv_text:csv})
    const secondContext = await good(host,'turn.begin',{turn_id:queued.result.id})
    await good(host,'turn.accept',{turn_id:queued.result.id,ticket:secondContext.ticket,
      decision:{reply:'收到。',actions:[{kind:'csv.audit'}]}})
    await good(host,'turn.execute',{turn_id:queued.result.id})
    await session.selectTurn(queued.result.id)
    const stopped = await session.stopSelected()
    assert.equal(stopped.result.permission_revoked,true)
    assert.equal(stopped.result.tasks[0].task_status,'cancelled')
    session.dispose()
  } finally { await host.dispose() }
  host = createProductHost({python,workspace,dataRoot})
  try {
    assert.equal((await good(host,'home')).profile.profile_id,profileId)
    const session = createProductSession({host})
    const list = await session.loadConversations()
    assert.equal(list.result[0].conversation_id,conversationId)
    const opened = await session.openConversation(conversationId)
    assert.ok(opened.result.some(item => item.id === turnId))
    assert.equal((await session.selectTurn(turnId)).result.actions[0].task.task_id,taskId)
    assert.equal(session.snapshot().turn.actions[0].task.status,'completed')
    assert.doesNotMatch(JSON.stringify(session.snapshot()),/ticket|grants|followup|due_at|csv_text/)
    session.dispose()
  } finally { await host.dispose() }
})

test('new read/write host classification is conservative on spawn failure', async () => {
  const host = createProductHost({python:path.join(workspace,'missing-core002-runtime.exe'),
    workspace,dataRoot:await fresh()})
  try {
    assert.equal((await host.request('conversation.list',{})).error.code,'transport_unavailable')
    assert.equal((await host.request('reminder.list',{})).error.code,'transport_unavailable')
    assert.equal((await host.request('turn.stop',{turn_id:randomUUID(),command_id:randomUUID()})).error.code,
      'outcome_unknown')
    assert.equal((await host.request('reminder.revise',{})).error.code,'outcome_unknown')
  } finally { await host.dispose() }
})

test('lost real turn.submit receipt is replayed by session with its original material and grant', async () => {
  const dataRoot = await fresh()
  const host = createProductHost({python,workspace,dataRoot})
  let dropped = false
  const transport = {async request(action,payload) {
    const reply = await host.request(action,payload)
    if (action === 'turn.submit' && !dropped) {
      dropped = true
      assert.equal(reply.ok,true)
      return {ok:false,error:{code:'outcome_unknown'}}
    }
    return reply
  }}
  try {
    await good(host,'bootstrap')
    const session = createProductSession({host:transport,intent:()=>['csv.audit']})
    const input = {conversation_id:randomUUID(),text:'原始虚构材料',csv_text:csv}
    assert.equal((await session.submitTurn(input)).error,'outcome_unknown')
    input.text = '被调用者改掉'; input.csv_text = 'bad,csv'
    const recovered = await session.replaySubmit()
    assert.equal(recovered.ok,true)
    assert.equal(recovered.result.text,'原始虚构材料')
    const turns = await good(host,'conversation.turns',{conversation_id:recovered.result.conversation_id})
    assert.equal(turns.items.length,1)
    assert.equal(turns.items[0].id,recovered.result.id)
    const context = await good(host,'turn.begin',{turn_id:recovered.result.id})
    assert.deepEqual(context.capabilities,['csv.audit'])
    assert.equal(context.csv_attached,true)
    await good(host,'turn.accept',{turn_id:recovered.result.id,ticket:context.ticket,
      decision:{reply:'核对。',actions:[{kind:'csv.audit'}]}})
    const task = (await good(host,'turn.execute',{turn_id:recovered.result.id})).actions[0].task
    assert.equal((await good(host,'worker.run-next')).status,'completed')
    assert.equal((await good(host,'task.result',{task_id:task.task_id})).metadata.total,'6')
    session.dispose()
  } finally { await host.dispose() }
})
