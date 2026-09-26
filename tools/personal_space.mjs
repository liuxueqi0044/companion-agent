import path from 'node:path'
import fs from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {createProductHost} from '../apps/desktop/product/host.mjs'
import {createProductRuntime} from '../apps/desktop/product/runtime/index.mjs'
import {createDeepSeekProviders} from '../apps/desktop/product/providers/deepseek.mjs'
import {createRequestLedger} from '../apps/desktop/product/providers/request-ledger.mjs'
import {createPersonalSpaceServer} from '../apps/desktop/product/web/server.mjs'
import {acquireInstance} from '../apps/desktop/product/web/instance.mjs'
import {createSpaceService,unavailableSpaceService} from '../apps/desktop/product/space/service.mjs'
import {createInterfaceService} from '../apps/desktop/product/interface/service.mjs'
import {createBackgroundService} from '../apps/desktop/product/background.mjs'
import {guardPath,writeJSON} from '../apps/desktop/product/storage.mjs'
import {randomBytes} from 'node:crypto'
import {createCodingProvider} from '../apps/desktop/product/providers/coding.mjs'

const exec=promisify(execFile)
const root=fileURLToPath(new URL('..',import.meta.url))
const live=process.argv.includes('--deepseek')
if(process.argv.slice(2).some(arg=>arg!=='--deepseek'))throw Error('invalid_arguments')
const port=Number(process.env.PERSONAL_AI_PORT??0)
if(!Number.isSafeInteger(port)||port<0||port>65535)throw Error('invalid_local_port')
const stateRoot=path.resolve(process.env.PERSONAL_AI_HOME??path.join(root,'.product-data'))
await guardPath(stateRoot,{create:true})
let installed={};try{installed=JSON.parse(await fs.readFile(path.join(root,'runtime.json'),'utf8'))}catch(e){if(e.code!=='ENOENT')throw Error('runtime_configuration_invalid')}
const localPath=async(env,key,checkoutPath,fallback)=>{
  if(process.env[env])return process.env[env]
  if(installed[key])return path.resolve(root,installed[key])
  const local=path.resolve(root,checkoutPath);try{await fs.access(local);return local}catch{return fallback}
}
const releaseInstance=acquireInstance(path.join(stateRoot,'personal-space.instance.json'),{recoverDead:true})
process.once('exit',releaseInstance)
const python=await localPath('PERSONAL_AI_PYTHON','python','.venv/Scripts/python.exe',path.resolve(root,'../companion-agent/.venv/Scripts/python.exe'))
const vueFile=await localPath('PERSONAL_AI_VUE','vue','node_modules/vue/dist/vue.runtime.esm-browser.prod.js',path.resolve(root,'../companion-agent/node_modules/vue/dist/vue.runtime.esm-browser.prod.js'))
const bundlerFile=await localPath('PERSONAL_AI_BUNDLER','bundler','node_modules/rolldown/dist/index.mjs',path.resolve(root,'../companion-agent/node_modules/rolldown/dist/index.mjs'))
const dataRoot=path.join(stateRoot,'personal-space')
let providers=null,coding=null
if(live){
  const credential=process.env.PERSONAL_AI_CREDENTIAL_FILE??path.join(process.env.LOCALAPPDATA,'CompanionAgent/credentials/deepseek.dpapi')
  let result
  // Reuse the same installed PowerShell 7 runtime as the existing credential writer.
  try{result=await exec('pwsh',['-NoProfile','-NonInteractive','-File',path.join(root,'tools/load_product_credential.ps1'),'-CredentialPath',credential],{windowsHide:true,maxBuffer:8192})}
  catch{throw Error('credential_decode_failed')}
  if(result.stderr||!result.stdout.trim())throw Error('credential_decode_failed')
  const ledger=createRequestLedger({file:path.join(stateRoot,'core-007-deepseek-budget.json')})
  ledger.recoverInterrupted()
  providers=createDeepSeekProviders({apiKey:result.stdout.trim(),ledger,streaming:true})
  if(process.env.PERSONAL_AI_CODEX) coding=createCodingProvider({executable:process.env.PERSONAL_AI_CODEX,root:path.join(stateRoot,'coding'),apiKey:result.stdout.trim(),ledger})
  result=null
}
const host=createProductHost({python,workspace:root,dataRoot})
const runtime=createProductRuntime({host,timeoutMs:coding?115000:60000,intent:input=>['artifact.create','reminder.create','tool.save','tool.run',
  ...(coding&&input.text.startsWith('/code ')?[]:['task.loop']),...(input.csv_text?['csv.audit','data.query']:[])],
  ...(providers?{turnProvider:{configured:true,respond:(context,options)=>coding&&context.user_text.startsWith('/code ')?coding.respond(context,options):providers.turn.respond(context,options)},contactProvider:providers.contact}:{})})
const boot=await runtime.initialize()
if(!boot.ok){runtime.dispose();await runtime.whenIdle();await host.dispose();throw Error('product_initialize_failed')}
const recovery=await host.request('runtime.recover',{})
if(!recovery.ok)throw Error('product_recovery_failed')
let space
try{space=await createSpaceService({root:path.join(dataRoot,'canvas'),provider:providers?.space,
  isRuntimeBusy:()=>runtime.snapshot().runtime.executionBusy||runtime.snapshot().runtime.pendingOperations>0})}
catch{space=unavailableSpaceService();console.error('space_state_invalid: customization disabled; existing files preserved')}
const connection=()=>({...providers?.connection()??{configured:false,provider:null},coding:!!coding})
const background=await createBackgroundService({runtime,host,root:dataRoot,
  isBusy:()=>space.snapshot().busy,
  notify:notice=>writeJSON(path.join(stateRoot,'notification.json'),notice)})
const interfaces=await createInterfaceService({root:path.join(dataRoot,'interfaces'),runtime,vueFile,bundlerFile,progress:providers?.progress,connection,background})
const nativeToken=randomBytes(32).toString('base64url')
const app=await createPersonalSpaceServer({runtime,space,interfaces,vueFile,port,progress:providers?.progress,connection,background,nativeToken,
  nativeControl:async(action,args)=>{
    if(action==='status'&&Object.keys(args).length===0)return {ok:true,result:{background:background.snapshot(),busy:runtime.snapshot().runtime.executionBusy,connection:connection()}}
    if(action==='background.configure')return background.configure(args)
    if(action==='window.authorize'&&Object.keys(args).sort().join('|')==='mountId|settings')return interfaces.call({mountId:args.mountId,action:'host.window',args:{}})
    if(action==='quit'&&Object.keys(args).length===0){setTimeout(()=>void shutdown(),25);return {ok:true}}
    return {ok:false,error:'invalid_request'}
  }})
await writeJSON(path.join(stateRoot,'personal-space-server.json'),{url:app.url,pid:process.pid,live,nativeToken,node:process.execPath,workspace:root})
background.start()
console.log(JSON.stringify({url:app.url,mode:live?'deepseek':'offline'}))
let closing=false
async function shutdown(){if(closing)return;closing=true;await background.close();await app.close();await host.dispose();releaseInstance();process.exitCode=0}
process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown)
