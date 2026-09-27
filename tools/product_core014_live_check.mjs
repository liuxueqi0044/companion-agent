import {resolveRuntime} from '../apps/desktop/product/runtime-paths.mjs'
/** Explicit opt-in: one fictional task, serial DeepSeek decisions, no network retries. */
import fs from 'node:fs/promises'
import path from 'node:path'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {randomUUID,createHash} from 'node:crypto'
import {createProductHost} from '../apps/desktop/product/host.mjs'
import {createProductRuntime} from '../apps/desktop/product/runtime/index.mjs'
import {createDeepSeekProviders} from '../apps/desktop/product/providers/deepseek.mjs'
import {createRequestLedger} from '../apps/desktop/product/providers/request-ledger.mjs'

if(process.argv.length!==3||process.argv[2]!=='--run-serial-fictional-check')throw Error('explicit_live_check_required')
const workspace=process.cwd(),root=await fs.mkdtemp(path.resolve('.test-data/core014-live-')),exec=promisify(execFile)
const files=['personal_ai.sqlite3','product.sqlite3','tasks.sqlite3','tools.sqlite3'].map(n=>path.resolve('.product-data/personal-space',n))
const hashes=()=>Promise.all(files.map(async f=>createHash('sha256').update(await fs.readFile(f)).digest('hex')))
const before=await hashes(),base=createRequestLedger({file:path.resolve('.product-data/core-007-deepseek-budget.json')}),ids=[]
if(base.snapshot().inFlight)throw Error('request_in_progress')
const ledger={snapshot:base.snapshot,finish:base.finish,reserve(kind){const id=base.reserve(kind);ids.push(id);return id}}
let credential
try{credential=await exec('pwsh',['-NoProfile','-NonInteractive','-File',path.resolve('tools/load_product_credential.ps1'),'-CredentialPath',path.join(process.env.LOCALAPPDATA,'CompanionAgent/credentials/deepseek.dpapi')],{windowsHide:true,maxBuffer:8192})}catch{throw Error('credential_decode_failed')}
if(credential.stderr||!credential.stdout.trim())throw Error('credential_decode_failed')
const providers=createDeepSeekProviders({apiKey:credential.stdout.trim(),ledger,streaming:true});credential=null
const host=createProductHost({python:resolveRuntime('python'),workspace,dataRoot:root})
const runtime=createProductRuntime({host,timeoutMs:60000,intent:()=>['task.loop','data.query','artifact.create'],turnProvider:providers.turn})
const report={fictional_only:true,openai_requests:0,extra_assistant_sessions:0,checks:[],started:new Date().toISOString(),data_root:path.relative(workspace,root)}
const checked=r=>{if(!r?.ok)throw Error(typeof r?.error==='string'?r.error:r?.error?.code??'check_failed');return r.result}
try{
  checked(await runtime.initialize());const id=randomUUID()
  checked(await runtime.send({command_id:id,conversation_id:randomUUID(),text:'这是虚构测试数据。请按 name 分组，把 qty 数值求和。先实际查询，等看到计算结果之后再保存一份简短 Markdown 报告，最后告诉我真实汇总结果。不要创建长期工具，也不要安排提醒。',csv_text:'name,qty\nA,2\nA,3\nB,4\n'}))
  const end=checked(await runtime.resources.turn({turnId:id}))
  report.turn_id=id;report.state=end.state;report.workflow=end.workflow
  report.actions=end.actions.map(a=>({id:a.id,kind:a.kind,state:a.state,error:a.error,row_count:a.row_count,sha256:a.artifact?.sha256}))
  const query=end.actions.find(a=>a.kind==='data.query'&&a.state==='accepted')
  if(!query)throw Error('no_actual_query')
  const output=checked(await runtime.resources.artifact({turnId:id,actionId:query.id,download:false})),rows=JSON.parse(output.files[0].content)
  // Permit honest column naming variation; require the exact two actual totals.
  if(rows.length!==2||rows.some(r=>!Object.values(r).includes(r.name==='A'?5:4))||rows.map(r=>r.name).sort().join(',')!=='A,B')throw Error('wrong_query_result')
  report.checks.push({name:'actual_query_correct',passed:true,rows})
  const artifact=end.actions.find(a=>a.kind==='artifact.create'&&a.state==='accepted')
  if(!artifact)throw Error('report_not_saved')
  const queryStep=end.workflow.steps.find(s=>s.action_ids.includes(query.id)),reportStep=end.workflow.steps.find(s=>s.action_ids.includes(artifact.id))
  if(!queryStep||!reportStep||reportStep.ordinal<=queryStep.ordinal)throw Error('report_preceded_observation')
  if(end.state!=='responded'||end.workflow.outcome!=='complete')throw Error('task_not_finished')
  report.checks.push({name:'report_after_result_then_final_reply',passed:true,query_step:queryStep.ordinal,report_step:reportStep.ordinal,final_step:end.workflow.step_count})
  const reopened=checked(await host.request('turn.read',{turn_id:id}))
  if(reopened.workflow.step_count!==end.workflow.step_count)throw Error('reopen_mismatch')
  report.reply=end.reply;report.ok=true
}catch(error){report.error=error.message;report.ok=false;process.exitCode=1}
finally{
  runtime.dispose();await runtime.whenIdle();await host.dispose()
  report.attempts=ids.length;report.attempt_ids=ids;report.connection_error=providers.connection().lastError
  report.protected_databases_unchanged=JSON.stringify(before)===JSON.stringify(await hashes());report.finished=new Date().toISOString()
  await fs.writeFile('reports/core-014/evidence/live.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report))
}
