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

const exec=promisify(execFile)
const root=fileURLToPath(new URL('..',import.meta.url))
const live=process.argv.includes('--deepseek')
if(process.argv.slice(2).some(arg=>arg!=='--deepseek'))throw Error('invalid_arguments')
const port=Number(process.env.PERSONAL_AI_PORT??0)
if(!Number.isSafeInteger(port)||port<0||port>65535)throw Error('invalid_local_port')
const releaseInstance=acquireInstance(path.resolve(root,'.product-data/personal-space.instance.json'))
process.once('exit',releaseInstance)
const python=process.env.PERSONAL_AI_PYTHON??path.resolve(root,'../companion-agent/.venv/Scripts/python.exe')
const vueFile=process.env.PERSONAL_AI_VUE??path.resolve(root,'../companion-agent/node_modules/vue/dist/vue.runtime.esm-browser.prod.js')
const dataRoot=path.resolve(root,'.product-data/personal-space')
let providers=null
if(live){
  const credential=path.join(process.env.LOCALAPPDATA,'CompanionAgent/credentials/deepseek.dpapi')
  let result
  // Reuse the same installed PowerShell 7 runtime as the existing credential writer.
  try{result=await exec('pwsh',['-NoProfile','-NonInteractive','-File',path.join(root,'tools/load_product_credential.ps1'),'-CredentialPath',credential],{windowsHide:true,maxBuffer:8192})}
  catch{throw Error('credential_decode_failed')}
  if(result.stderr||!result.stdout.trim())throw Error('credential_decode_failed')
  const ledger=createRequestLedger({file:path.resolve(root,'.product-data/core-007-deepseek-budget.json')})
  providers=createDeepSeekProviders({apiKey:result.stdout.trim(),ledger,streaming:true});result=null
}
const host=createProductHost({python,workspace:root,dataRoot})
const runtime=createProductRuntime({host,timeoutMs:60000,intent:input=>input.csv_text?['csv.audit']:[],
  ...(providers?{turnProvider:providers.turn,contactProvider:providers.contact}:{})})
const boot=await runtime.initialize()
if(!boot.ok){runtime.dispose();await runtime.whenIdle();await host.dispose();throw Error('product_initialize_failed')}
const app=await createPersonalSpaceServer({runtime,vueFile,port,progress:providers?.progress,connection:()=>providers?.connection()??{configured:false,provider:null}})
await fs.mkdir(path.resolve(root,'.product-data'),{recursive:true})
await fs.writeFile(path.resolve(root,'.product-data/personal-space-server.json'),JSON.stringify({url:app.url,pid:process.pid,live},null,2))
console.log(JSON.stringify({url:app.url,mode:live?'deepseek':'offline'}))
let closing=false
async function shutdown(){if(closing)return;closing=true;await app.close();await host.dispose();process.exitCode=0}
process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown)
