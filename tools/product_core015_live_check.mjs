/** Explicit serial product integration trial. Fictional inputs only; no Codex invocation. */
import fs from 'node:fs/promises'
import path from 'node:path'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {randomUUID,createHash} from 'node:crypto'
import {createProductHost} from '../apps/desktop/product/host.mjs'
import {createProductRuntime} from '../apps/desktop/product/runtime/index.mjs'
import {createDeepSeekProviders} from '../apps/desktop/product/providers/deepseek.mjs'
import {createRequestLedger} from '../apps/desktop/product/providers/request-ledger.mjs'
import {createGoalRouter,goalIntent} from '../apps/desktop/product/providers/goal.mjs'
import {createClaudeProvider} from '../apps/desktop/product/providers/claude.mjs'

const mode=process.argv[2]
if(process.argv.length!==3||!['--serial-goal','--serial-claude'].includes(mode))throw Error('explicit_live_check_required')
const exec=promisify(execFile),workspace=process.cwd(),resume=process.env.PERSONAL_AI_TRIAL_RESUME
const root=resume?path.resolve(resume):await fs.mkdtemp(path.resolve('.test-data/core015-live-'))
if(resume&&(!root.startsWith(path.resolve('.test-data')+path.sep)||!path.basename(root).startsWith('core015-live-')))throw Error('invalid_trial_root')
const python=path.resolve('../companion-agent/.venv/Scripts/python.exe')
const protectedFiles=['personal_ai.sqlite3','product.sqlite3','tasks.sqlite3','tools.sqlite3'].map(f=>path.resolve('.product-data/personal-space',f))
const hashes=()=>Promise.all(protectedFiles.map(async p=>createHash('sha256').update(await fs.readFile(p)).digest('hex')))
const before=await hashes(),ledger=createRequestLedger({file:path.join(root,'requests.json')})
const credential=await exec('pwsh',['-NoProfile','-NonInteractive','-File',path.resolve('tools/load_product_credential.ps1'),'-CredentialPath',path.join(process.env.LOCALAPPDATA,'CompanionAgent/credentials/deepseek.dpapi')],{windowsHide:true,maxBuffer:8192})
if(credential.stderr||!credential.stdout.trim())throw Error('credential_decode_failed')
const apiKey=credential.stdout.trim();credential.stdout=''
const roleModels={director:'deepseek-v4-pro',worker:'deepseek-v4-flash',reviewer:'deepseek-v4-pro'}
const models=createDeepSeekProviders({apiKey,ledger,roleModels,streaming:true})
const coding=mode==='--serial-claude'
const claude=coding?createClaudeProvider({executable:process.env.PERSONAL_AI_CLAUDE??path.join(process.env.USERPROFILE,'.local','bin','claude.exe'),
  root:path.join(root,'coding'),apiKey,ledger,python,model:'deepseek-v4-pro'}):null
const routed=createGoalRouter({turn:models.turn,claude}),candidates=[]
const provider={configured:true,async respond(c,options){const output=await routed.respond(c,options)
  candidates.push({role:c.goal?.role,task:c.goal?.task?.id,output})
  await fs.writeFile(path.join(root,'candidates.json'),JSON.stringify(candidates,null,2));return output}}
const host=createProductHost({python,workspace,dataRoot:path.join(root,'product')})
const runtime=createProductRuntime({host,intent:i=>goalIntent(i,{claude:coding}),turnProvider:provider,timeoutMs:120000})
const id=resume?process.env.PERSONAL_AI_TRIAL_TURN:randomUUID(),report={mode,data_root:path.relative(workspace,root),turn_id:id,role_models:roleModels,fictional_only:true,openai_requests:0,codex_invocations:0,automatic_retries:0,manual_resume:!!resume,started:new Date().toISOString()}
const checked=r=>{if(!r?.ok)throw Error(typeof r?.error==='string'?r.error:r?.error?.code??'check_failed');return r.result}
try{
  checked(await runtime.initialize())
  const text=coding?'目标模式：请明确分派 Claude Code 编写两个文件：sum.mjs 导出 sum(a,b) 函数返回两数之和；README.md 简短说明如何使用。只要求实际文件与 JavaScript 语法检查，不要求程序行为测试。主控读取实际源码和宿主检查回执后验收。不要安装依赖或调用其他工具。':
    '目标模式：这是虚构数据。请至少拆成两个相互依赖的任务，先让执行者按 name 分组汇总 qty，要求实际查询得到 A=5、B=4；验收后再让执行者根据真实结果保存 Markdown 报告。最后主控读取成果、逐项验收后告诉我结果。不要创建长期工具、记忆或提醒。'
  const result=resume?await runtime.resources.start({turnId:id}):await runtime.send({command_id:id,conversation_id:randomUUID(),text,...(coding?{}:{csv_text:'name,qty\nA,2\nA,3\nB,4\n'})})
  const end=checked(await runtime.resources.turn({turnId:id}));report.turn=end
  checked(result)
  if(end.state!=='responded'||end.workflow?.goal?.outcome!=='complete'||end.workflow.goal.tasks.some(t=>t.state!=='accepted'))throw Error('goal_not_finished')
  const artifacts=[]
  for(const action of end.actions.filter(a=>a.artifact&&a.state==='accepted')){
    const actual=checked(await runtime.resources.artifact({turnId:id,actionId:action.id,download:false}))
    artifacts.push({action_id:action.id,kind:action.kind,files:actual.files})
  }
  if(coding){
    if(!artifacts.some(a=>a.files.some(f=>f.path==='sum.mjs'))||!end.workflow.goal.tasks.some(t=>t.executor==='claude'))throw Error('coding_files_missing')
    const jobs=await fs.readdir(path.join(root,'coding'));report.coding_receipts=[]
    for(const job of jobs){const file=path.join(root,'coding',job,'receipt.json');const receipt=JSON.parse(await fs.readFile(file,'utf8'));report.coding_receipts.push(receipt)}
    if(!report.coding_receipts.some(r=>r.state==='collected'&&r.evidence.tool_calls>0&&r.evidence.checks.some(c=>c.kind==='node_syntax'&&c.status==='passed')))throw Error('actual_cli_evidence_missing')
  }else{
    if(end.workflow.goal.tasks.length<2)throw Error('goal_not_decomposed')
    const queried=artifacts.find(a=>a.kind==='data.query');if(!queried)throw Error('actual_query_missing')
    const rows=JSON.parse(queried.files[0].content)
    if(rows.length!==2||rows.map(r=>r.name).sort().join(',')!=='A,B'||rows.some(r=>!Object.values(r).includes(r.name==='A'?5:4)))throw Error('query_incorrect')
    if(!artifacts.some(a=>a.kind==='artifact.create'&&a.files.some(f=>f.path.endsWith('.md'))))throw Error('report_missing')
  }
  report.artifacts=artifacts;report.ok=true
}catch(e){report.ok=false;report.error=e.message;process.exitCode=1}
finally{
  runtime.dispose();await runtime.whenIdle();await host.dispose()
  try{report.ledger=JSON.parse(await fs.readFile(path.join(root,'requests.json'),'utf8')).attempts}catch{report.ledger=[]}
  report.candidates=candidates
  report.direct_requests=report.ledger.filter(r=>r.kind.startsWith('goal_')).length
  report.claude_runs=report.ledger.filter(r=>r.kind==='claude_code_run').length
  report.claude_api_requests=report.ledger.filter(r=>r.kind==='claude_code_run').reduce((n,r)=>n+(r.api_requests??0),0)
  report.protected_databases_unchanged=JSON.stringify(before)===JSON.stringify(await hashes());report.finished=new Date().toISOString()
  const file=path.resolve('reports/core-015/evidence',coding?'live-claude.json':'live-goal.json')
  await fs.writeFile(file,JSON.stringify(report,null,2))
  console.log(JSON.stringify({ok:report.ok,error:report.error,report:path.relative(workspace,file),root:report.data_root,
    direct_requests:report.direct_requests,claude_runs:report.claude_runs,claude_api_requests:report.claude_api_requests,
    protected_databases_unchanged:report.protected_databases_unchanged,provider_error:models.connection().lastError}))
}
