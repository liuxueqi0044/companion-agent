/** Exercise a copied release with its own Node/Python/Vue/bundler and fresh data.
 * No model, credential, network-provider or generated-host-code execution.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {randomUUID,createHash} from 'node:crypto'
import assert from 'node:assert/strict'

const args=process.argv.slice(2)
if(args.length!==6||args[0]!=='--release'||args[2]!=='--home'||args[4]!=='--report')throw Error('usage: --release PATH --home NEW_PATH --report NEW_FILE')
const release=path.resolve(args[1]),home=path.resolve(args[3]),report=path.resolve(args[5])
const absent=async p=>{try{await fs.lstat(p);throw Error('verification_output_must_be_new')}catch(e){if(e.code!=='ENOENT')throw e}}
await absent(home);await absent(report)
const config=JSON.parse(await fs.readFile(path.join(release,'runtime.json'),'utf8'))
assert.equal(path.resolve(process.execPath).toLowerCase(),path.resolve(release,config.node).toLowerCase(),'run with the release Node executable')
const inventory=JSON.parse(await fs.readFile(path.join(release,'release-manifest.json'),'utf8'))
const checks=[]
for(const item of inventory.files){
  assert.ok(!/(^|\/)(\.product-data|\.test-data|reports|\.env|credentials)(\/|$)/i.test(item.path),item.path)
  assert.ok(!/\.(?:dpapi|sqlite|sqlite3|db|key)$/i.test(item.path),item.path)
  const bytes=await fs.readFile(path.join(release,item.path))
  if(/\.pem$/i.test(item.path)){
    // The pinned Python distribution includes public CA roots, not user keys.
    assert.equal(item.path,'runtime/python/Lib/site-packages/pip/_vendor/certifi/cacert.pem')
    assert.ok(bytes.includes('-----BEGIN CERTIFICATE-----')&&!bytes.includes('PRIVATE KEY'))
  }
  assert.equal(bytes.length,item.bytes,item.path)
  assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256,item.path)
}
checks.push({name:'inventory_integrity_and_private_data_exclusion',passed:true,files:inventory.files.length})
const load=p=>import(pathToFileURL(path.join(release,p)).href)
const {createProductHost}=await load('apps/desktop/product/host.mjs')
const {createProductRuntime}=await load('apps/desktop/product/runtime/index.mjs')
const {createInterfaceService}=await load('apps/desktop/product/interface/service.mjs')
const {defaultSource,buildInterface}=await load('apps/desktop/product/interface/builder.mjs')
const {createGoalRouter,goalIntent}=await load('apps/desktop/product/providers/goal.mjs')
const checked=r=>{assert.equal(r?.ok,true,JSON.stringify(r));return r.result}
const answer=(reply,actions=[])=>({decision:{reply,actions}})
const provider={configured:true,respond(c){
  const g=c.goal
  if(!g)return c.workflow?.step>1?{decision:{reply:'本地核对已完成，没有调用模型。',actions:[],outcome:'complete'}}:answer('本地核对演示已交给真实 CSV 工具。这里没有调用模型。',[{kind:'csv.audit'}])
  if(g.phase==='planning')return answer('离线主控：先汇总数量。',[{kind:'goal.plan',tasks:[{id:'calculate',title:'汇总虚构数量',instruction:'按 name 汇总 qty',criteria:['实际结果 A=5、B=4'],depends_on:[]}]}])
  if(g.phase==='dispatching')return g.tasks.every(t=>t.state==='accepted')?answer('离线主控：已核对。',[{kind:'goal.finish',outcome:'complete'}]):answer('离线主控：交给执行者。',[{kind:'goal.dispatch',task_id:'calculate',executor:'worker'}])
  if(g.phase==='working'){
    const receipt=g.task_receipts.find(r=>r.kind==='data.query'&&r.state==='accepted')
    return receipt?answer('离线执行者：提交实际回执。',[{kind:'goal.submit',summary:'已计算',evidence_ids:[receipt.action_id]}]):answer('离线执行者：运行本地查询。',[{kind:'data.query',title:'数量汇总',sql:'SELECT name,sum(num(qty)) AS total FROM data GROUP BY name ORDER BY name'}])
  }
  if(g.phase==='reviewing'){
    assert.ok(g.source_previews.some(s=>g.task.evidence_ids.includes(s.action_id)&&s.content.includes('5')&&s.content.includes('4')))
    return answer('离线验收：回执存在，结果符合虚构样例。',[{kind:'goal.review',task_id:g.task.id,verdict:'accept',checks:[{criterion:0,passed:true,reason:'已读取实际本地查询结果',evidence_ids:g.task.evidence_ids}]}])
  }
  if(g.phase==='finished')return {decision:{reply:'离线目标完成，A=5，B=4。这是脚本决策与真实工具的组合演示。',actions:[],outcome:'complete'}}
  throw Error('unexpected_goal_phase')
}}
const options={vueFile:path.join(release,config.vue),bundlerFile:path.join(release,config.bundler)}
let host,runtime,interfaces
async function open(){
  host=createProductHost({python:path.join(release,config.python),workspace:release,dataRoot:path.join(home,'personal-space')})
  runtime=createProductRuntime({host,intent:goalIntent,turnProvider:createGoalRouter({turn:provider})})
  checked(await runtime.initialize())
  interfaces=await createInterfaceService({root:path.join(home,'personal-space/interfaces'),runtime,...options})
}
async function close(){await interfaces?.close();runtime?.dispose();await runtime?.whenIdle();await host?.dispose();interfaces=null;runtime=null;host=null}
try{
  await open()
  const audit={command_id:randomUUID(),conversation_id:randomUUID(),text:'离线安装验收：核对虚构材料',csv_text:'item,unit,qty,unit_price,currency\nPen,piece,2,3,CNY\n'}
  checked(await runtime.send(audit));await runtime.whenIdle()
  const task=checked(await runtime.resources.turn({turnId:audit.command_id}))
  assert.equal(task.state,'responded');assert.equal(task.actions[0].task.status,'completed')
  const goal={command_id:randomUUID(),conversation_id:randomUUID(),text:'目标模式：安装验收，汇总虚构数量。',csv_text:'name,qty\nA,2\nA,3\nB,4\n'}
  checked(await runtime.send(goal));await runtime.whenIdle()
  const work=checked(await runtime.resources.turn({turnId:goal.command_id}))
  assert.equal(work.state,'responded');assert.ok(work.workflow.goal.tasks.every(t=>t.state==='accepted'))
  const query=work.actions.find(a=>a.kind==='data.query'&&a.state==='accepted')
  assert.ok(query)
  const artifact=checked(await runtime.resources.artifact({turnId:work.id,actionId:query.id,download:false}))
  assert.deepEqual(JSON.parse(artifact.files[0].content),[{name:'A',total:5},{name:'B',total:4}])
  checks.push({name:'packaged_python_sqlite_csv_and_goal_pipeline',passed:true,audit:task.id,goal:work.id,goalSteps:work.workflow.step_count,decisions:'scripted_offline'})
  for(const starter of inventory.release.interfaces){
    const source=await defaultSource({starter,standalone:true})
    if(inventory.release.channel==='invitation-alpha'){
      assert.ok(!Object.keys(source.files).some(n=>n.startsWith('characters/')||n==='whale-room.mjs'))
      assert.ok(!Object.values(source.files).some(s=>s.includes('data:image/png;base64,')))
    }
    const bundle=await buildInterface(source,options)
    assert.ok(bundle.js.includes('morrow.ui.ready'))
    checks.push({name:'bundled_interface_'+starter,passed:true})
  }
  if(inventory.release.channel==='invitation-alpha'){
    assert.deepEqual(inventory.release.interfaces,['form','atelier'])
    await assert.rejects(defaultSource({starter:'whale'}),/interface_invalid_starter/)
    checks.push({name:'invitation_source_exports_exclude_character_art',passed:true})
  }
  let mount=(await interfaces.mount()).mount
  const draft={text:'重开后应保留的草稿\n第二行',conversationId:goal.conversation_id}
  checked(await interfaces.call({mountId:mount.id,action:'draft.write',args:{expectedRevision:0,value:draft}}))
  checked(await interfaces.call({mountId:mount.id,action:'ui.state.write',args:{expectedRevision:0,value:{core018:'persisted'}}}))
  const imported=await interfaces.importSource({source:await defaultSource({starter:'form',standalone:true}),expectedVersion:0})
  const preview=(await interfaces.mount({revision:imported.result.revision,preview:true})).mount
  await interfaces.ready({mountId:preview.id});await interfaces.activate({mountId:preview.id,expectedVersion:1,trustSource:true})
  const active=interfaces.summary().active
  await close();await open()
  mount=(await interfaces.mount()).mount
  assert.deepEqual(checked(await interfaces.call({mountId:mount.id,action:'draft.read'})).value,draft)
  assert.equal(interfaces.summary().active,active)
  assert.equal(checked(await runtime.resources.turn({turnId:goal.command_id})).state,'responded')
  assert.equal(checked(await runtime.resources.turn({turnId:audit.command_id})).actions[0].task.status,'completed')
  checks.push({name:'dispose_reopen_preserves_turns_draft_and_active_interface',passed:true})
  await interfaces.restore({expectedVersion:interfaces.summary().version})
  mount=(await interfaces.mount()).mount
  assert.deepEqual(checked(await interfaces.call({mountId:mount.id,action:'draft.read'})).value,draft)
  assert.deepEqual(checked(await interfaces.call({mountId:mount.id,action:'ui.state.read'})).value,{core018:'persisted'})
  checks.push({name:'restore_default_preserves_personal_state',passed:true})
  await close()
  await fs.mkdir(path.dirname(report),{recursive:true})
  const result={release:inventory.release,home,checks,modelRequests:0,realCredentialsRead:0,passed:true}
  await fs.writeFile(report,JSON.stringify(result,null,2),{flag:'wx'})
  console.log(JSON.stringify(result))
}finally{await close()}
