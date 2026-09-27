import {resolveRuntime} from '../../../apps/desktop/product/runtime-paths.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import http from 'node:http'
import {randomUUID} from 'node:crypto'
import {createProductHost} from '../../../apps/desktop/product/host.mjs'
import {createProductRuntime} from '../../../apps/desktop/product/runtime/index.mjs'
import {createPersonalSpaceServer} from '../../../apps/desktop/product/web/server.mjs'
import {createClient} from '../../../apps/desktop/personal-space/client.mjs'

const workspace=path.resolve('.'),python=resolveRuntime('python')
const vueFile=resolveRuntime('vue')
async function setup({connection,respond}={}){
  await fs.mkdir('.test-data',{recursive:true});const dataRoot=await fs.mkdtemp(path.resolve('.test-data/core-007-web-'))
  const host=createProductHost({python,workspace,dataRoot});let modelCalls=0
  const runtime=createProductRuntime({host,intent:turn=>turn.csv_text?['csv.audit']:[],turnProvider:{configured:true,respond(context){modelCalls++;if(respond)return respond(context);return {decision:{reply:'Fictional response',actions:context.csv_attached?[{kind:'csv.audit'}]:[]}}}}})
  assert.equal((await runtime.initialize()).ok,true)
  const server=await createPersonalSpaceServer({runtime,vueFile,connection})
  const html=await(await fetch(server.url)).text(),token=html.match(/name="personal-space-session" content="([^"]+)"/)[1]
  const post=(action,args={},headers={})=>fetch(server.url+'/api/command',{method:'POST',headers:{Origin:server.url,'Content-Type':'application/json','X-Personal-Space-Token':token,...headers},body:JSON.stringify({action,args})})
  return {server,runtime,host,post,html,calls:()=>modelCalls,async close(){await server.close();await host.dispose()}}
}
test('only same-origin authenticated narrow actions may reach the runtime',async()=>{
  const x=await setup()
  try{
    assert.equal((await x.post('snapshot')).status,200)
    assert.equal((await x.post('snapshot',{}, {Origin:'https://unrelated.example'})).status,403)
    assert.equal((await x.post('snapshot',{}, {'X-Personal-Space-Token':'wrong'})).status,401)
    const hostileHost=await new Promise((resolve,reject)=>{const request=http.get(x.server.url,{headers:{Host:'evil.example'}},response=>{response.resume();resolve(response.statusCode)});request.on('error',reject)})
    assert.equal(hostileHost,403)
    assert.equal((await x.post('host.request',{action:'runtime.recover'})).status,200)
    assert.equal((await(await x.post('host.request',{action:'runtime.recover'})).json()).reply.error,'invalid_request')
    assert.equal((await(await x.post('send',{command_id:randomUUID(),conversation_id:randomUUID(),text:'fictional',capabilities:['csv.audit']})).json()).reply.error,'invalid_request')
    for(const url of ['/../../.env','/.product-data/personal-space/product.sqlite3','/apps/desktop/product/host.mjs','/vendor/credential'])assert.equal((await fetch(x.server.url+url)).status,404)
    assert.equal(x.calls(),0)
  }finally{await x.close()}
})
test('browser transport executes real CSV, exposes real source result and preserves memory control',async()=>{
  const x=await setup();const turnId=randomUUID()
  try{
    const result=await(await x.post('send',{command_id:turnId,conversation_id:randomUUID(),text:'Check fictional CSV',csv_text:'item,unit,qty,unit_price,currency\nPen,piece,2,3,CNY\n'})).json()
    assert.equal(result.reply.ok,true,JSON.stringify(result.reply));assert.equal(result.snapshot.view.activity.taskStatus,'completed');assert.equal(x.calls(),1)
    const current=result.snapshot.view.activity
    assert.equal((await(await x.post('result.open',{taskId:current.taskId,turnId:randomUUID()})).json()).reply.error,'stale_view')
    const shown=await(await x.post('result.open',{taskId:current.taskId,turnId})).json()
    assert.equal(shown.reply.result.metadata.total,'6');assert.ok(shown.reply.result.rows[0].source_refs)
    await x.post('open',{panel:'memory'})
    const added=await(await x.post('memory.add',{content:'Fictional preference',category:'preferences'})).json()
    assert.equal(added.reply.ok,true)
    const refreshed=await(await x.post('memory.refresh')).json();const item=refreshed.snapshot.view.memory.items[0]
    const edited=await(await x.post('memory.edit',{id:item.id,content:'Updated fictional preference'})).json()
    assert.equal(edited.reply.ok,true)
    const changed=await(await x.post('policy.memory',{expectedRevision:edited.snapshot.view.policy.policy.revision,patch:{memory_enabled:false}})).json()
    assert.equal(changed.reply.ok,true);assert.equal(changed.snapshot.view.policy.policy.memory_enabled,false)
    assert.equal(x.calls(),1)
  }finally{await x.close()}
})
test('browser client refuses stale snapshots and never retries failed writes',async()=>{
  let resolve,calls=0;const seen=[]
  const client=createClient({token:'fixture',onSnapshot:s=>seen.push(s.revision),fetchImpl:async()=>{
    calls++;if(calls===1)return await new Promise(r=>{resolve=r})
    return new Response(JSON.stringify({reply:{ok:true},snapshot:{revision:9}}))
  }})
  const first=client.call('send',{text:'fictional'});await client.call('snapshot')
  resolve(new Response(JSON.stringify({reply:{ok:true},snapshot:{revision:4}})));await first
  assert.deepEqual(seen,[9]);assert.equal(calls,2);client.dispose()
  let failures=0
  const broken=createClient({token:'fixture',fetchImpl:async()=>{failures++;throw Error('offline')}})
  assert.equal((await broken.call('send',{text:'fictional'})).error,'transport_unavailable');assert.equal(failures,1);broken.dispose()
})

test('quota-free transport accepts more than six turns and persists public summaries separately',async()=>{
  const x=await setup({connection:()=>({configured:true,requests:{used:99,inFlight:false}}),respond:()=>({decision:{reply:'Fictional public response',actions:[]},displayableSummary:'Public approach, not a tool receipt.'})})
  const conversation=randomUUID();let id
  try{
    for(let i=0;i<8;i++){
      id=randomUUID()
      const sent=await(await x.post('send',{command_id:id,conversation_id:conversation,text:'Fictional quota-free input '+i})).json()
      assert.equal(sent.reply.ok,true);assert.equal(sent.snapshot.view.activity.taskId,null)
    }
    assert.equal((await(await x.post('open',{panel:'home'})).json()).reply.ok,true)
    const reopened=await(await x.post('open',{panel:'conversation',turnId:id})).json()
    assert.equal(reopened.snapshot.view.conversation.turn.provider_summary,'Public approach, not a tool receipt.')
    assert.equal(reopened.snapshot.view.activity.actions.length,0)
    assert.equal((await x.host.request('turn.read',{turn_id:id})).result.state,'responded')
    assert.equal((await(await x.post('memory.add',{content:'Fictional local preference'})).json()).reply.ok,true)
    assert.equal((await(await x.post('snapshot')).json()).reply.ok,true)
    assert.equal(x.calls(),8)
  }finally{await x.close()}
})

for(const detail of ['credential_rejected','arbitrary-provider-secret'])test(`provider detail ${detail==='credential_rejected'?'is allowlisted':'cannot escape through error text'}`,async()=>{
  const x=await setup({connection:()=>({configured:true,lastError:detail,budget:{remaining:1}}),respond:()=>{throw Error('arbitrary-provider-secret')}})
  try{
    const result=await(await x.post('send',{command_id:randomUUID(),conversation_id:randomUUID(),text:'Fictional failure test'})).json()
    assert.equal(result.reply.error,detail==='credential_rejected'?detail:'provider_failed')
    // The connection callback itself is application-owned; check the command error envelope.
    assert.equal(JSON.stringify(result.reply).includes('arbitrary-provider-secret'),false)
    assert.equal(x.calls(),1)
  }finally{await x.close()}
})

test('in-flight contention keeps confirmed input and presents a precise recoverable failure',async()=>{
  let lastError=null
  const x=await setup({connection:()=>({configured:true,lastError}),respond:()=>{lastError='request_in_progress';throw Error(lastError)}})
  const id=randomUUID()
  try{
    const result=await(await x.post('send',{command_id:id,conversation_id:randomUUID(),text:'Fictional race input'})).json()
    assert.equal(result.reply.error,'request_in_progress');assert.equal(result.reply.submission,'confirmed')
    assert.equal((await x.host.request('turn.read',{turn_id:id})).result.state,'model_failed')
    assert.equal(x.calls(),1)
  }finally{await x.close()}
})
