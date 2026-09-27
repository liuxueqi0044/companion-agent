import {resolveRuntime} from '../apps/desktop/product/runtime-paths.mjs'
/** Opt-in serial checks against fictional material. No retries and no OpenAI account. */
import fs from 'node:fs/promises'
import path from 'node:path'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {randomUUID,createHash} from 'node:crypto'
import {createProductHost} from '../apps/desktop/product/host.mjs'
import {createProductRuntime} from '../apps/desktop/product/runtime/index.mjs'
import {createDeepSeekProviders} from '../apps/desktop/product/providers/deepseek.mjs'
import {createRequestLedger} from '../apps/desktop/product/providers/request-ledger.mjs'
if(process.argv[2]!=='--run-two-serial-fictional-checks')throw Error('explicit_live_check_required')
const workspace=process.cwd(),root=await fs.mkdtemp(path.resolve('.test-data/core013-live-')),exec=promisify(execFile)
const files=['personal_ai.sqlite3','product.sqlite3','tasks.sqlite3'].map(n=>path.resolve('.product-data/personal-space',n))
const hashes=()=>Promise.all(files.map(async f=>createHash('sha256').update(await fs.readFile(f)).digest('hex')))
const before=await hashes(),base=createRequestLedger({file:path.resolve('.product-data/core-007-deepseek-budget.json')}),ids=[]
if(base.snapshot().inFlight)throw Error('request_in_progress')
const ledger={snapshot:base.snapshot,finish:base.finish,reserve(kind){const id=base.reserve(kind);ids.push(id);return id}}
let credential
try{credential=await exec('pwsh',['-NoProfile','-NonInteractive','-File',path.resolve('tools/load_product_credential.ps1'),'-CredentialPath',path.join(process.env.LOCALAPPDATA,'CompanionAgent/credentials/deepseek.dpapi')],{windowsHide:true,maxBuffer:8192})}catch{throw Error('credential_decode_failed')}
if(credential.stderr||!credential.stdout.trim())throw Error('credential_decode_failed')
const providers=createDeepSeekProviders({apiKey:credential.stdout.trim(),ledger,streaming:true});credential=null
const host=createProductHost({python:resolveRuntime('python'),workspace,dataRoot:root})
const runtime=createProductRuntime({host,timeoutMs:60000,intent:()=>['tool.save','tool.run'],turnProvider:providers.turn})
const report={fictional_only:true,openai_requests:0,extra_assistant_sessions:0,checks:[],started:new Date().toISOString(),data_root:path.relative(workspace,root)}
const ok=r=>{if(!r?.ok)throw Error(typeof r?.error==='string'?r.error:'check_failed');return r.result}
try{
 ok(await runtime.initialize());const conversation_id=randomUUID(),first=randomUUID()
 ok(await runtime.send({command_id:first,conversation_id,text:'请创建并保存一个以后反复使用的“名单去重”小工具：输入 CSV 有 name 列，输出去重后的 name，并按 name 升序排列。只需要创建和验证工具，样例请用明确的虚构数据 A、B。'}))
 const saved=ok(await runtime.resources.turn({turnId:first})),action=saved.actions.find(a=>a.kind==='tool.save'&&a.state==='accepted')
 if(!action)throw Error('tool_not_saved')
 report.checks.push({name:'model_authored_tool_validated_saved',passed:true,version:action.tool.version,samples:action.tool.validation.passed,sha256:action.tool.sha256})
 const second=randomUUID();ok(await runtime.send({command_id:second,conversation_id,text:'请使用刚才保存的名单去重工具，处理这次附上的新名单。',csv_text:'name\nDelta\nCharlie\nDelta\nAlpha\n'}))
 const run=ok(await runtime.resources.turn({turnId:second})),executed=run.actions.find(a=>a.kind==='tool.run'&&a.state==='accepted')
 if(!executed)throw Error('saved_tool_not_executed')
 const artifact=ok(await runtime.resources.artifact({turnId:second,actionId:executed.id,download:false})),rows=JSON.parse(artifact.files[0].content)
 if(JSON.stringify(rows)!==JSON.stringify([{name:'Alpha'},{name:'Charlie'},{name:'Delta'}]))throw Error('wrong_tool_result')
 report.checks.push({name:'model_selected_saved_tool_on_new_input',passed:true,rows:rows.length,artifact_sha256:executed.artifact.sha256})
}catch(e){report.error=e.message;process.exitCode=1}
finally{
 runtime.dispose();await runtime.whenIdle();await host.dispose();report.attempts=ids.length;report.attempt_ids=ids;report.connection_error=providers.connection().lastError
 report.protected_databases_unchanged=JSON.stringify(before)===JSON.stringify(await hashes());report.finished=new Date().toISOString()
 await fs.writeFile('reports/core-013/evidence/live.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report))
}
