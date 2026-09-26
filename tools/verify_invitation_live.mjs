/** Explicit serial DeepSeek trial through a copied release's actual HTTP/SDK path.
 * Only fictional inputs; fresh home; no Codex/Claude execution or automatic retry.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import {spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import assert from 'node:assert/strict'
const args=process.argv.slice(2)
if(args.length!==7||!['--run-deepseek','--resume-deepseek'].includes(args[0])||args[1]!=='--release'||args[3]!=='--home'||args[5]!=='--report')throw Error('explicit_serial_live_arguments_required')
const resume=args[0]==='--resume-deepseek'
const release=path.resolve(args[2]),home=path.resolve(args[4]),reportFile=path.resolve(args[6])
for(const file of [...(resume?[]:[home]),reportFile])try{await fs.lstat(file);throw Error('output_must_be_new')}catch(e){if(e.code!=='ENOENT')throw e}
const workspace=path.resolve('.test-data')
if(!home.startsWith(workspace+path.sep))throw Error('trial_home_outside_test_root')
const report={format:'morrow-invitation-live/1',started:new Date().toISOString(),checks:[],modelRequests:0,openaiRequests:0,codingAgentInvocations:0,automaticRetries:0,manualResume:resume,fictionalInputs:true,passed:false}
const pause=ms=>new Promise(r=>setTimeout(r,ms))
let run,token,mountId,task,conversation_id
async function boot(){
  const env={...process.env,PERSONAL_AI_HOME:home,PERSONAL_AI_PORT:'0',PERSONAL_AI_CLAUDE:path.join(home,'absent-claude.exe')}
  for(const key of ['PERSONAL_AI_NODE','PERSONAL_AI_PYTHON','PERSONAL_AI_VUE','PERSONAL_AI_BUNDLER','PERSONAL_AI_CODEX'])delete env[key]
  const child=spawn(path.join(release,'runtime/node.exe'),[path.join(release,'tools/personal_space.mjs'),'--deepseek'],{cwd:release,env,windowsHide:true,stdio:['ignore','pipe','pipe']})
  child.stdout.resume();child.stderr.resume();let spawnFailed=false;child.on('error',()=>{spawnFailed=true})
  const closed=new Promise(resolve=>child.once('close',resolve));run={child,closed,state:null}
  for(let i=0;i<200;i++){
    if(spawnFailed||child.exitCode!==null)throw Error('release_service_boot_failed')
    try{const s=JSON.parse(await fs.readFile(path.join(home,'personal-space-server.json'),'utf8'));if(s.pid===child.pid){assert.equal(s.live,true);run.state=s;break}}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e}
    await pause(100)
  }
  if(!run.state)throw Error('release_service_timeout')
  const html=await(await fetch(run.state.url)).text();token=html.match(/name="personal-space-session" content="([A-Za-z0-9_-]+)"/)?.[1]
  assert.ok(token);mountId=(await command('interface.mount',{})).mount.id
}
async function native(action,args={}){
  const r=await fetch(run.state.url+'/api/native',{method:'POST',headers:{'Content-Type':'application/json','X-Morrow-Native':run.state.nativeToken},body:JSON.stringify({action,args}),signal:AbortSignal.timeout(10000)})
  return r.json()
}
async function command(action,args){
  const response=await fetch(run.state.url+'/api/command',{method:'POST',headers:{'Content-Type':'application/json',Origin:run.state.url,'X-Personal-Space-Token':token},body:JSON.stringify({action,args}),signal:AbortSignal.timeout(240000)})
  const r=await response.json()
  if(!response.ok||!r.reply?.ok)throw Error(typeof r.reply?.error==='string'?r.reply.error:'product_command_failed')
  return r.reply
}
const call=async(action,args={})=>(await command('interface.call',{mountId,action,args})).result
async function stop(){
  if(!run||run.child.exitCode!==null)return
  if(run.state)try{await native('quit')}catch{}
  await Promise.race([run.closed,pause(10000)])
  if(run.child.exitCode===null){run.child.kill();await run.closed}
}
try{
  await boot()
  const first=(await command('interface.snapshot',{mountId})).result
  assert.equal(first.connection.configured,true);assert.equal(first.view.policy.policy.proactive_enabled,false)
  report.checks.push({name:'packaged_service_decodes_existing_credential_and_default_contact_off',passed:true})
  conversation_id=randomUUID();const hello=randomUUID();task=randomUUID()
  let existingQueries=0
  if(resume){
    const list=await call('conversations.read',{});task=list.items[0].latest_turn_id
    const prior=await call('turn.read',{turnId:task});conversation_id=prior.conversation_id
    existingQueries=prior.actions.filter(a=>a.kind==='data.query'&&a.state==='accepted').length
    report.checks.push({name:'prior_query_receipt_preserved_before_resume',passed:existingQueries>0,count:existingQueries})
    assert.equal(existingQueries,1)
    await call('work.start',{turnId:task})
  }else{
  await call('send',{command_id:hello,conversation_id,text:'你好。这是虚构的邀请版检查，请用一句简短中文打招呼，不创建记忆、提醒或任务。'})
  const chat=await call('turn.read',{turnId:hello});assert.equal(chat.state,'responded');assert.ok(chat.reply?.trim())
  report.checks.push({name:'real_chat',passed:true,reply:chat.reply})
  await call('send',{command_id:task,conversation_id,text:'这是一份虚构 CSV。请实际使用一次性数据查询工具按 name 汇总 qty，按 name 排序。核对实际工具输出后告诉我结果，不创建长期记忆、工具或提醒。',csv_text:'name,qty\nA,2\nA,3\nB,4\n'})
  }
  const work=await call('turn.read',{turnId:task});report.task={state:work.state,reply:work.reply,actions:work.actions.map(a=>({kind:a.kind,state:a.state}))}
  assert.equal(work.state,'responded')
  const query=work.actions.find(a=>a.kind==='data.query'&&a.state==='accepted');assert.ok(query,'actual_query_receipt_missing')
  if(resume)assert.equal(work.actions.filter(a=>a.kind==='data.query'&&a.state==='accepted').length,existingQueries,'resume_must_not_repeat_query')
  const artifact=await call('artifact.read',{turnId:task,actionId:query.id,download:false}),rows=JSON.parse(artifact.files[0].content)
  assert.equal(rows.length,2)
  for(const [i,name,total] of [[0,'A',5],[1,'B',4]]){assert.ok(Object.values(rows[i]).includes(name));assert.ok(Object.values(rows[i]).includes(total))}
  report.checks.push({name:'real_model_actual_packaged_query',passed:true,rows})
  await call('draft.write',{expectedRevision:0,value:{text:'虚构检查：重开后保留',conversationId:conversation_id}})
  const before=JSON.parse(await fs.readFile(path.join(home,'core-007-deepseek-budget.json'),'utf8')).attempts.length
  await stop();await boot()
  assert.equal((await call('turn.read',{turnId:task})).state,'responded')
  assert.equal((await call('draft.read')).value.text,'虚构检查：重开后保留')
  const after=JSON.parse(await fs.readFile(path.join(home,'core-007-deepseek-budget.json'),'utf8')).attempts.length
  assert.equal(before,after)
  report.checks.push({name:'restart_preserves_result_and_draft_without_new_model_request',passed:true})
  report.passed=true
}catch(e){report.error=/^[a-z][a-z0-9_]{0,80}$/.test(e.message)?e.message:'live_validation_failed';process.exitCode=1
  if(task&&run?.state)try{const t=await call('turn.read',{turnId:task});report.failedTask={id:t.id,state:t.state,error:t.error,actions:t.actions.map(a=>({kind:a.kind,state:a.state,error:a.error}))}}catch{}
}
finally{
  await stop()
  try{const ledger=JSON.parse(await fs.readFile(path.join(home,'core-007-deepseek-budget.json'),'utf8'));report.modelRequests=ledger.attempts.length;report.attempts=ledger.attempts.map(a=>({kind:a.kind,state:a.state,http_status:a.http_status,error:a.error??null,validation:a.validation??null}))}catch{}
  report.finished=new Date().toISOString();await fs.mkdir(path.dirname(reportFile),{recursive:true});await fs.writeFile(reportFile,JSON.stringify(report,null,2),{flag:'wx'})
  console.log(JSON.stringify({passed:report.passed,error:report.error,modelRequests:report.modelRequests,checks:report.checks.length}))
}
