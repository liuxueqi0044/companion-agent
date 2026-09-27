import {resolveRuntime} from '../apps/desktop/product/runtime-paths.mjs'
/** Explicit one-request development check. Never imported or called by the UI. */
import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {randomUUID} from 'node:crypto'
import {createProductHost} from '../apps/desktop/product/host.mjs'
import {createProductRuntime} from '../apps/desktop/product/runtime/index.mjs'
import {createAttemptBudget,createDeepSeekProviders} from '../apps/desktop/product/providers/deepseek.mjs'

const scenario=process.argv[2]
if(process.argv.length!==3||!['memory','csv'].includes(scenario))throw Error('explicit_scenario_required')
const root=fileURLToPath(new URL('..',import.meta.url)),exec=promisify(execFile)
const python=resolveRuntime('python')
const dataRoot=await fs.mkdtemp(path.join(root,'.test-data/core-007-live-'))
let secret
try{secret=await exec('pwsh',['-NoProfile','-NonInteractive','-File',path.join(root,'tools/load_product_credential.ps1'),'-CredentialPath',path.join(process.env.LOCALAPPDATA,'CompanionAgent/credentials/deepseek.dpapi')],{windowsHide:true,maxBuffer:8192})}catch{throw Error('credential_decode_failed')}
if(secret.stderr||!secret.stdout.trim())throw Error('credential_decode_failed')
const providers=createDeepSeekProviders({apiKey:secret.stdout.trim(),budget:createAttemptBudget({file:path.join(root,'.product-data/core-007-deepseek-budget.json'),limit:6})});secret=null
const before=providers.connection().budget.used
const host=createProductHost({python,workspace:root,dataRoot})
let decision=null
const runtime=createProductRuntime({host,timeoutMs:60000,intent:input=>input.csv_text?['csv.audit']:[],turnProvider:{configured:true,async respond(context,options){const result=await providers.turn.respond(context,options);decision=result.decision;return result}}})
const report={scenario,data_root:path.relative(root,dataRoot).replaceAll('\\','/'),fictional_data_only:true,started_at:new Date().toISOString()}
try{
  if(!(await runtime.initialize()).ok)throw Error('initialize_failed')
  const request={command_id:randomUUID(),conversation_id:randomUUID(),text:scenario==='memory'?'开发验证用的虚构偏好：请记住，我喜欢先看结论，再看必要的说明。请简短回应。':'请核对这份开发验证用的虚构 CSV，计算数量乘以单价，按币种汇总。',
    ...(scenario==='csv'?{csv_text:'item,unit,qty,unit_price,currency\nNotebook,piece,3,4.50,USD\nPen,piece,2,1.25,USD\n'}:{})}
  const reply=await runtime.send(request)
  report.reply=reply;report.activity=runtime.snapshot().activity
  report.decision=decision // Parsed public decision only, never raw provider response or hidden reasoning.
  if(decision){
    const validation=await exec(python,['-I','-c',"import sys,json;sys.path.insert(0,sys.argv[1]);from services.product.models import ModelDecision;from pydantic import ValidationError\ntry:\n ModelDecision.model_validate_json(sys.argv[2]);print(json.dumps({'valid':True}))\nexcept ValidationError as e:\n print(json.dumps({'valid':False,'errors':[{'loc':x['loc'],'type':x['type']} for x in e.errors()]}))",root,JSON.stringify(decision)],{windowsHide:true,maxBuffer:8192})
    report.schema_validation=JSON.parse(validation.stdout)
  }
  if(scenario==='memory')report.memories=await host.request('memory.list',{})
  if(reply.ok&&scenario==='csv')report.result=await runtime.ui.result.open({taskId:runtime.snapshot().activity.taskId})
  report.passed=reply.ok&&(scenario==='memory'?report.memories?.result?.length>0:report.result?.result?.metadata?.total==='16.00')
}finally{
  runtime.dispose();await runtime.whenIdle();await host.dispose()
  report.connection=providers.connection();report.attempts_used=report.connection.budget.used-before;report.finished_at=new Date().toISOString()
  await fs.writeFile(path.join(root,`reports/core-007/evidence/live-${scenario}.json`),JSON.stringify(report,null,2)+'\n')
}
console.log(JSON.stringify({scenario,passed:report.passed,schema_validation:report.schema_validation,reply_ok:report.reply?.ok,error:report.reply?.error,attempts_used:report.attempts_used,budget:report.connection.budget}))
if(!report.passed)process.exitCode=1
