import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { createProductHost } from '../../apps/desktop/product/host.mjs'
import { stageSource, sealCandidate, readRevision } from '../spikes/personal-space/core/store.mjs'

const workspace = path.resolve(fileURLToPath(new URL('../..',import.meta.url)))
// Read-only dependency runtime; -I and the fixed bootstrap select the new source tree.
const python = path.resolve(workspace,'../companion-agent/.venv/Scripts/python.exe')
const scratch = path.join(workspace,'.test-data')
await fs.mkdir(scratch,{recursive:true})
const fresh = () => fs.mkdtemp(path.join(scratch,'host-'))
async function good(host, action, payload={}) {
  const reply = await host.request(action,payload)
  assert.equal(reply.ok,true,JSON.stringify(reply))
  return reply.result
}
const csv = 'item,unit,qty,unit_price,currency\n笔,支,2,3,CNY\n'

test('real Node→Python→SQLite→CSV, with no model or network calls', async () => {
  const dataRoot = await fresh()
  const host = createProductHost({python,workspace,dataRoot})
  try {
    const initial = await good(host,'bootstrap')
    const turnId = randomUUID()
    await good(host,'turn.submit',{turn:{command_id:turnId,conversation_id:randomUUID(),text:'核对虚构CSV',csv_text:csv},capabilities:['csv.audit']})
    const context = await good(host,'turn.begin',{turn_id:turnId})
    await good(host,'turn.accept',{turn_id:turnId,ticket:context.ticket,decision:{reply:'开始核对。',actions:[{kind:'csv.audit'}]}})
    const sent = await good(host,'turn.execute',{turn_id:turnId})
    const taskId = sent.actions[0].task.task_id
    assert.equal(sent.actions[0].task.status,'queued')
    assert.equal((await good(host,'worker.run-next')).status,'completed')
    const result = await good(host,'task.result',{task_id:taskId})
    assert.equal(result.metadata.total,'6')
    assert.equal((await good(host,'turn.read',{turn_id:turnId})).actions[0].task.status,'completed')
    assert.equal((await good(host,'inbox.list'))[0].kind,'task')
    assert.equal((await good(host,'home')).profile.profile_id,initial.profile.profile_id)
  } finally { await host.dispose() }
  assert.equal(host.activeProcesses,0)
})

test('host permissions, policy and source memory can be managed across processes', async () => {
  const host = createProductHost({python,workspace,dataRoot:await fresh()})
  try {
    await good(host,'bootstrap')
    const memory = await good(host,'memory.add',{content:'只记工作相关的偏好',category:'work'})
    const current = await good(host,'policy.read')
    await good(host,'policy.replace',{expected_revision:current.revision,policy:{...current,memory_enabled:false,proactive_enabled:true}})
    const turnId = randomUUID()
    await good(host,'turn.submit',{turn:{command_id:turnId,conversation_id:randomUUID(),text:'聊聊'}})
    const context = await good(host,'turn.begin',{turn_id:turnId})
    assert.deepEqual(context.memories,[])
    assert.deepEqual(context.capabilities,[])
    const rejected = await host.request('turn.accept',{turn_id:turnId,ticket:context.ticket,decision:{reply:'已修改',actions:[{kind:'profile.change',changes:{ai_name:'Injected'}}]}})
    assert.equal(rejected.error.code,'permission_denied')
    await good(host,'memory.forget',{id:memory.id,expected_revision:1})
    assert.deepEqual(await good(host,'memory.list'),[])
    assert.equal((await host.request('bootstrap',{root:'C:/untrusted'})).error.code,'invalid_request')
    assert.equal((await host.request('shell.run',{command:'no'})).error.code,'unsupported_action')
  } finally { await host.dispose() }
})

test('existing sealed code packages bind to identity, CAS and restore keep task state', async () => {
  const dataRoot = await fresh()
  const spaces = path.join(dataRoot,'spaces')
  await fs.mkdir(spaces)
  const spec = (revision_id,base_revision,changes) => ({package_id:'personal',revision_id,base_revision,
    host_api_version:'demo/1',source_type:'handwritten_fixture',requested_scopes:[],changes})
  await stageSource(spaces,spec('v1',null,{'view.html':'<main>空间一</main>','view.css':'main{color:#342f2b}','view.js':''}))
  await sealCandidate(spaces,'v1')
  await stageSource(spaces,spec('v2','v1',{'view.html':'<main>空间二</main>'}))
  await sealCandidate(spaces,'v2')
  const v1 = await readRevision(spaces,'v1'), v2 = await readRevision(spaces,'v2')
  const host = createProductHost({python,workspace,dataRoot,reviewedPackages:[v1,v2].map(v=>({source_hash:v.manifest.build_input_hash,artifact_hash:v.artifact_hash}))})
  try {
    const before = await good(host,'bootstrap')
    const first = await good(host,'experience.activate',{package_revision:'v1',expected_revision:0})
    assert.equal(first.revision,1)
    assert.equal(first.native_mount,'not_run')
    const turnId = randomUUID()
    await good(host,'turn.submit',{turn:{command_id:turnId,conversation_id:randomUUID(),text:'测试换版不中断任务',csv_text:csv},capabilities:['csv.audit']})
    const ctx = await good(host,'turn.begin',{turn_id:turnId})
    await good(host,'turn.accept',{turn_id:turnId,ticket:ctx.ticket,decision:{reply:'开始',actions:[{kind:'csv.audit'}]}})
    const task = (await good(host,'turn.execute',{turn_id:turnId})).actions[0].task
    await good(host,'experience.activate',{package_revision:'v2',expected_revision:1})
    assert.equal((await host.request('experience.activate',{package_revision:'v1',expected_revision:1})).error.code,'revision_conflict')
    await good(host,'worker.run-next')
    const policy = await good(host,'policy.read')
    await good(host,'policy.replace',{expected_revision:policy.revision,policy:{...policy,memory_enabled:false}})
    await good(host,'experience.restore',{target_revision:1,expected_revision:2})
    const after = await good(host,'home')
    assert.equal(after.profile.profile_id,before.profile.profile_id)
    assert.equal(after.policy.memory_enabled,false)
    assert.equal(after.experience_revision,3)
    assert.equal((await good(host,'task.get',{task_id:task.task_id})).status,'completed')
    await fs.writeFile(path.join(spaces,'revisions','v1','view.css'),'tampered')
    assert.equal((await host.request('experience.restore',{target_revision:1,expected_revision:3})).error.code,'invalid_package')
    assert.equal((await good(host,'home')).experience_revision,3)
  } finally { await host.dispose() }
})

test('unreviewed or model-candidate code cannot be activated', async () => {
  const dataRoot = await fresh()
  const spaces = path.join(dataRoot,'spaces')
  await fs.mkdir(spaces)
  await stageSource(spaces,{package_id:'x',revision_id:'candidate',base_revision:null,host_api_version:'demo/1',
    source_type:'model_candidate',requested_scopes:[],changes:{'view.html':'<main>x</main>','view.css':'','view.js':''}})
  await sealCandidate(spaces,'candidate')
  const candidate = await readRevision(spaces,'candidate')
  const host = createProductHost({python,workspace,dataRoot,reviewedPackages:[{source_hash:candidate.manifest.build_input_hash,artifact_hash:candidate.artifact_hash}]})
  try {
    await good(host,'bootstrap')
    assert.equal((await host.request('experience.activate',{package_revision:'candidate',expected_revision:0})).error.code,'isolation_not_verified')
    assert.equal((await good(host,'home')).experience_revision,0)
  } finally { await host.dispose() }
})

test('spawn failure, dispose and limit checks produce structured results', async () => {
  const host = createProductHost({python:path.join(workspace,'missing-python.exe'),workspace,dataRoot:await fresh()})
  const reply = await host.request('home')
  assert.equal(reply.ok,false)
  assert.equal(reply.error.code,'transport_unavailable')
  await host.dispose()
  assert.equal((await host.request('home')).error.code,'disposed')
  const alive = createProductHost({python,workspace,dataRoot:await fresh()})
  assert.equal((await alive.request('turn.submit',{text:'x'.repeat(400*1024)})).error.code,'request_too_large')
  await alive.dispose()
})
