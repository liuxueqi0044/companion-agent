/** Fresh-root capability integration demo. --deepseek is explicit, serial, with no retries. */
import fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {resolveRuntime,projectRoot} from '../apps/desktop/product/runtime-paths.mjs'
import {createProductHost} from '../apps/desktop/product/host.mjs'
import {createProductRuntime} from '../apps/desktop/product/runtime/index.mjs'
import {createCapabilityService} from '../apps/desktop/product/capabilities/service.mjs'
import {createDeepSeekProviders} from '../apps/desktop/product/providers/deepseek.mjs'
import {createRequestLedger} from '../apps/desktop/product/providers/request-ledger.mjs'
import platform from '../apps/desktop/product/platform.cjs'

if(process.argv.slice(2).some(v=>v!=='--deepseek'))throw Error('invalid_arguments')
const live=process.argv.includes('--deepseek'),python=resolveRuntime('python')
await fs.mkdir(path.join(projectRoot,'.test-data'),{recursive:true})
const root=await fs.mkdtemp(path.join(projectRoot,'.test-data',live?'core021-live-':'core021-demo-'))
const host=createProductHost({python,workspace:projectRoot,dataRoot:path.join(root,'data')})
const capabilities=createCapabilityService({host,root:path.join(root,'capabilities'),python})
let providers,item,part
const ledger=createRequestLedger({file:path.join(root,'requests.json')})
if(live){
  const credential=process.env.PERSONAL_AI_CREDENTIAL_FILE??path.join(process.env.LOCALAPPDATA,'CompanionAgent/credentials/deepseek.dpapi')
  let loaded
  try{loaded=await promisify(execFile)(platform.systemPowerShell(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(projectRoot,'tools/load_product_credential.ps1'),'-CredentialPath',credential],{windowsHide:true,maxBuffer:8192,env:platform.powerShellEnvironment()})}catch{throw Error('credential_decode_failed')}
  if(loaded.stderr||!loaded.stdout.trim())throw Error('credential_decode_failed')
  providers=createDeepSeekProviders({apiKey:loaded.stdout.trim(),ledger});loaded=null
}
const runtime=createProductRuntime({host,capabilityExecutor:capabilities.execute,timeoutMs:60000,
  intent:()=>['task.loop','capability.describe','capability.call','artifact.create'],
  turnProvider:providers?.turn??{configured:true,respond:context=>{
    const base={package_id:item.id,version:item.version,component:part.id}
    const step=context.workflow.step
    return {decision:step===1?{reply:'查看资料工具的输入。',actions:[{kind:'capability.describe',...base,tool:'read_note'}]}:
      step===2?{reply:'读取指定样本。',actions:[{kind:'capability.call',...base,tool:'read_note',arguments:{name:'sample-notes'}}]}:
      step===3?{reply:'保存已读取的结果。',actions:[{kind:'artifact.create',title:'样本资料',files:[{path:'notes.md',content:'Fictional verified total: '+context.workflow.receipts.at(-1).receipt.result.structuredContent.total}]}]}:
      {reply:'样本中的值为 42，报告已保存。',actions:[],outcome:'complete'}}
  }}})
try{
  if(!(await runtime.initialize()).ok)throw Error('initialize_failed')
  item=await capabilities.command('import',{name:'演示资料工具',files:[{path:'.mcp.json',content:JSON.stringify({mcpServers:{notes:{command:'node',args:[path.join(projectRoot,'tests/product/core021/mcp-fixture.mjs'),'--stdio','normal',path.join(root,'calls.jsonl')]}}})}]})
  part=item.components[0]
  item=await capabilities.command('connect',{id:item.id,version:item.version,component:part.id,expected_revision:item.revision,trustSource:true})
  item=await capabilities.command('grant',{id:item.id,component:part.id,tools:['read_note'],expected_revision:item.revision})
  item=await capabilities.command('manage',{id:item.id,operation:'enable',version:null,expected_revision:item.revision})
  const input={command_id:randomUUID(),conversation_id:randomUUID(),text:'请使用我已添加的「演示资料工具」读取名称为 sample-notes 的虚构样本，根据实际返回内容保存一份 Markdown 小报告，然后告诉我结果。没有实际读取到内容之前不要编造结果。'}
  const result=await runtime.send(input);await runtime.whenIdle()
  const turn=(await host.request('turn.read',{turn_id:input.command_id})).result
  const report={mode:live?'deepseek':'scripted',root,requestLedger:ledger.snapshot(),execution:result.ok,
    error:result.ok?null:result.error,providerError:providers?.connection().lastError??null,
    state:turn?.state,outcome:turn?.workflow?.outcome,steps:turn?.workflow?.step_count,
    actions:turn?.actions?.map(a=>({id:a.id,kind:a.kind,state:a.state,error:a.error})),
    verifiedToolTotal:turn?.actions?.find(a=>a.kind==='capability.call'&&a.state==='accepted')?.capability_result?.result?.structuredContent?.total,
    savedReport:turn?.actions?.some(a=>a.kind==='artifact.create'&&a.state==='accepted')===true}
  report.passed=report.execution&&report.verifiedToolTotal===42&&report.savedReport&&report.outcome==='complete'
  await fs.writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify(report))
  if(!report.passed)process.exitCode=1
}finally{runtime.dispose();await runtime.whenIdle();await capabilities.close();await host.dispose()}
