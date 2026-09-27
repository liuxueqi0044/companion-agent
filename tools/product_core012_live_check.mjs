import {resolveRuntime} from '../apps/desktop/product/runtime-paths.mjs'
/** Explicit, serial fictional-data validation. Never runs as part of application startup. */
import fs from 'node:fs/promises'
import path from 'node:path'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {randomUUID,createHash} from 'node:crypto'
import {createProductHost} from '../apps/desktop/product/host.mjs'
import {createProductRuntime} from '../apps/desktop/product/runtime/index.mjs'
import {createDeepSeekProviders} from '../apps/desktop/product/providers/deepseek.mjs'
import {createRequestLedger} from '../apps/desktop/product/providers/request-ledger.mjs'
import {createBackgroundService} from '../apps/desktop/product/background.mjs'
if(process.argv[2]!=='--run-three-serial-fictional-checks')throw Error('explicit_live_check_required')
const workspace=process.cwd(),exec=promisify(execFile),python=resolveRuntime('python')
const root=await fs.mkdtemp(path.resolve('.test-data/core012-live-'))
const protectedFiles=['personal_ai.sqlite3','product.sqlite3','tasks.sqlite3'].map(n=>path.resolve('.product-data/personal-space',n))
const hash=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex')
const before=await Promise.all(protectedFiles.map(hash))
let secret
try{secret=await exec('pwsh',['-NoProfile','-NonInteractive','-File',path.resolve('tools/load_product_credential.ps1'),'-CredentialPath',path.join(process.env.LOCALAPPDATA,'CompanionAgent/credentials/deepseek.dpapi')],{windowsHide:true,maxBuffer:8192})}
catch{throw Error('credential_decode_failed')}
if(secret.stderr||!secret.stdout.trim())throw Error('credential_decode_failed')
const base=createRequestLedger({file:path.resolve('.product-data/core-007-deepseek-budget.json')}),ids=[]
if(base.snapshot().inFlight)throw Error('existing_request_in_progress')
const ledger={snapshot:base.snapshot,finish:base.finish,reserve(kind){const id=base.reserve(kind);ids.push(id);return id}}
const providers=createDeepSeekProviders({apiKey:secret.stdout.trim(),ledger,streaming:true});secret=null
const host=createProductHost({python,workspace,dataRoot:path.join(root,'turns')})
let captured=null
const runtime=createProductRuntime({host,timeoutMs:60000,intent:()=>['artifact.create','reminder.create'],turnProvider:{configured:true,respond:async(c,o)=>{captured=c;return providers.turn.respond(c,o)}}})
const report={fictional_data_only:true,extra_openai_requests:0,coding_cli_sessions:0,checks:[],started_at:new Date().toISOString()}
const requireOK=r=>{if(!r?.ok)throw Error(r?.error?.code??r?.error??'check_failed');return r.result}
let contactHost,contactRuntime,background
try{
  requireOK(await runtime.initialize())
  const conversation_id=randomUUID(),memoryId=randomUUID()
  requireOK(await runtime.send({command_id:memoryId,conversation_id,text:'开发验证用的虚构偏好：请记住，我喜欢先给结论，再给必要说明。请简短回应。'}))
  const memories=requireOK(await host.request('memory.list',{}));if(!memories.length)throw Error('memory_not_saved')
  report.checks.push({name:'durable_memory',passed:true,count:memories.length})
  const artifactId=randomUUID(),due=new Date(Date.now()+1800000).toISOString()
  requireOK(await runtime.send({command_id:artifactId,conversation_id,text:`这是虚构开发测试。请把“本周整理了12份资料、核对3张报价单”整理为一个可下载的 weekly.md 周报，并明确创建一个在 ${due}（UTC）提醒我复盘的提醒。这是我交办的提醒，不是主动问候。`} ))
  const turn=requireOK(await runtime.resources.turn({turnId:artifactId})),artifact=turn.actions.find(a=>a.artifact),reminder=turn.actions.find(a=>a.reminder)
  if(!artifact||!reminder)throw Error('tool_action_missing')
  const zip=requireOK(await runtime.resources.artifact({turnId:artifactId,actionId:artifact.id,download:true}))
  if(Buffer.from(zip.base64,'base64').subarray(0,2).toString()!=='PK')throw Error('zip_invalid')
  report.checks.push({name:'memory_reused_and_artifact_and_reminder',passed:true,memory_context_count:captured.memories.length,artifact_sha256:artifact.artifact.sha256,download_sha256:zip.sha256})
  runtime.dispose();await runtime.whenIdle();await host.dispose()
  const contactRoot=path.join(root,'contact')
  await exec(python,['-I','-B','tests/product/core005/prepare_fixture.py',workspace,contactRoot,'1'],{cwd:workspace,windowsHide:true})
  contactHost=createProductHost({python,workspace,dataRoot:contactRoot})
  contactRuntime=createProductRuntime({host:contactHost,timeoutMs:60000,contactProvider:providers.contact})
  requireOK(await contactRuntime.initialize())
  const notices=[]
  background=await createBackgroundService({host:contactHost,runtime:contactRuntime,root:contactRoot,notify:async n=>notices.push(n)})
  requireOK(await background.tick())
  const plans=requireOK(await contactHost.request('contact.inspect',{}))
  if(plans.some(p=>p.state==='needs_retry'))throw Error('contact_model_failed')
  report.checks.push({name:'real_contact_reassessment',passed:true,state:plans[0].state,notification_batches:notices.length})
}catch(e){report.error=e.message;process.exitCode=1}
finally{
  await background?.close();contactRuntime?.dispose();await contactRuntime?.whenIdle();await contactHost?.dispose()
  runtime.dispose();await runtime.whenIdle();await host.dispose()
  report.own_attempt_ids=ids;report.attempts=ids.length;report.connection_error=providers.connection().lastError
  report.protected_databases_unchanged=JSON.stringify(before)===JSON.stringify(await Promise.all(protectedFiles.map(hash)))
  report.finished_at=new Date().toISOString();report.data_root=path.relative(workspace,root)
  await fs.mkdir('reports/core-012/evidence',{recursive:true});await fs.writeFile('reports/core-012/evidence/live.json',JSON.stringify(report,null,2))
  console.log(JSON.stringify(report))
}
