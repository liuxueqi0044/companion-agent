import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs/promises'
import {setup,vueFile,input} from '../core011/helpers.mjs'
import {createInterfaceService} from '../../../apps/desktop/product/interface/service.mjs'
import {createPersonalSpaceServer} from '../../../apps/desktop/product/web/server.mjs'
import {createDeepSeekProviders} from '../../../apps/desktop/product/providers/deepseek.mjs'
import {createRequestLedger} from '../../../apps/desktop/product/providers/request-ledger.mjs'

test('whole-interface send presents allowlisted provider error, preserving the failed input',async()=>{
  const x=await setup({configured:true,respond:()=>{throw Error('untrusted server text')}});let server,interfaces
  try{
    interfaces=await createInterfaceService({root:path.join(x.root,'ui'),runtime:x.runtime,vueFile})
    server=await createPersonalSpaceServer({runtime:x.runtime,interfaces,vueFile,connection:()=>({lastError:'provider_invalid_output'})})
    const token=(await(await fetch(server.url)).text()).match(/name="personal-space-session" content="([^"]+)"/)[1]
    const post=async(action,args={})=>(await(await fetch(server.url+'/api/command',{method:'POST',headers:{Origin:server.url,'Content-Type':'application/json','X-Personal-Space-Token':token},body:JSON.stringify({action,args})})).json()).reply
    const mount=(await post('interface.mount')).mount
    const i=input(),r=await post('interface.call',{mountId:mount.id,action:'send',args:i})
    assert.equal(r.error,'provider_invalid_output')
    const saved=await x.runtime.resources.turn({turnId:i.command_id});assert.equal(saved.result.text,i.text);assert.equal(saved.result.state,'model_failed')
  }finally{await server?.close();await interfaces?.close();await x.close()}
})
test('adapter persists only validation stage and fixed reason, never bad response text',async()=>{
  const root=await fs.mkdtemp(path.resolve('.test-data/core019-provider-')),file=path.join(root,'ledger.json'),ledger=createRequestLedger({file})
  const providers=createDeepSeekProviders({apiKey:'synthetic-secret',ledger,fetchImpl:async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:'hello',SECRET_PRIVATE_FIELD:'PRIVATE_SENTINEL'})}}]}))})
  await assert.rejects(providers.turn.respond({}),/provider_invalid_output/)
  assert.deepEqual(providers.connection().lastFailure,{stage:'decision_fields',detail:null})
  const recorded=await fs.readFile(file,'utf8');assert.ok(!recorded.includes('PRIVATE_SENTINEL'));assert.ok(!recorded.includes('SECRET_PRIVATE_FIELD'));assert.ok(recorded.includes('decision_fields'))
})
