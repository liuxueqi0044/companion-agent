import {resolveRuntime} from '../../../apps/desktop/product/runtime-paths.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {createProductHost} from '../../../apps/desktop/product/host.mjs'
import {createProductRuntime} from '../../../apps/desktop/product/runtime/index.mjs'
import {createPersonalSpaceServer} from '../../../apps/desktop/product/web/server.mjs'
import {createDeepSeekProviders} from '../../../apps/desktop/product/providers/deepseek.mjs'
import {createRequestLedger} from '../../../apps/desktop/product/providers/request-ledger.mjs'
import {createClient} from '../../../apps/desktop/personal-space/client.mjs'
import {readSse} from '../../../apps/desktop/personal-space/sse.mjs'

const enc=new TextEncoder(),decision={displayable_summary:'核对数量与单价，按币种汇总。',reply:'我会先核对这份虚构材料，实际结果以计算工具为准。',actions:[{kind:'csv.audit'}],memories:[],followup:null}
const event=(content,finish=null)=>'data: '+JSON.stringify({id:'fixture',choices:[{index:0,delta:{content},finish_reason:finish}]})+'\n\n'
async function setup(){
  await fs.mkdir('.test-data',{recursive:true});const dataRoot=await fs.mkdtemp(path.resolve('.test-data/core-009-transport-'))
  const host=createProductHost({python:resolveRuntime('python'),workspace:path.resolve('.'),dataRoot})
  let modelCalls=0,output,signal,cancelled=false,entered
  const ready=new Promise(r=>{entered=r}),ledger=createRequestLedger({file:path.join(dataRoot,'requests.json')})
  const p=createDeepSeekProviders({apiKey:'synthetic',ledger,streaming:true,fetchImpl:async(url,init)=>{
    modelCalls++;signal=init.signal
    const body=new ReadableStream({start(c){output=c},cancel(){cancelled=true}})
    entered();return new Response(body,{headers:{'Content-Type':'text/event-stream'}})
  }})
  const runtime=createProductRuntime({host,turnProvider:p.turn,intent:input=>input.csv_text?['csv.audit']:[]})
  assert.equal((await runtime.initialize()).ok,true)
  const server=await createPersonalSpaceServer({runtime,connection:p.connection,progress:p.progress,vueFile:resolveRuntime('vue')})
  const token=(await(await fetch(server.url)).text()).match(/name="personal-space-session" content="([^"]+)"/)[1]
  const headers={Origin:server.url,'Content-Type':'application/json','X-Personal-Space-Token':token}
  const post=async(action,args={})=>(await fetch(server.url+'/api/command',{method:'POST',headers,body:JSON.stringify({action,args})})).json()
  return {server,runtime,host,p,ledger,ready,post,headers,calls:()=>modelCalls,cancelled:()=>cancelled,signal:()=>signal,
    chunk:content=>output.enqueue(enc.encode(event(content))),finish:()=>{output.enqueue(enc.encode(event('','stop')+'data: [DONE]\n\n'));output.close()},
    async close(){await server.close();await host.dispose()}}
}
async function watch(x){
  const abort=new AbortController(),frames=[],waiters=[]
  const response=await fetch(x.server.url+'/api/events',{method:'POST',headers:x.headers,body:'{}',signal:abort.signal})
  assert.equal(response.status,200)
  const pump=(async()=>{try{for await(const data of readSse(response.body,{signal:abort.signal})){
    const value=JSON.parse(data);frames.push(value)
    for(const w of [...waiters])if(w.fn(value)){waiters.splice(waiters.indexOf(w),1);clearTimeout(w.timer);w.resolve(value)}
  }}catch{}})()
  return {frames,async until(fn){const found=frames.find(fn);if(found)return found
    return new Promise((resolve,reject)=>{const w={fn,resolve,timer:setTimeout(()=>reject(Error('expected streamed state not received')),7000)};waiters.push(w)})},
    async close(){abort.abort();await pump;for(const w of waiters)clearTimeout(w.timer)}}
}
const input=()=>({command_id:randomUUID(),conversation_id:randomUUID(),text:'Check fictional CSV.',temporary:true,
  csv_text:'item,unit,qty,unit_price,currency\nNotebook,piece,3,4.50,USD\nPen,piece,2,1.25,USD\n'})
test('authenticated live snapshots survive reconnect; partial JSON cannot execute a real CSV action',async()=>{
  const x=await setup();let a,b
  try{
    assert.equal((await fetch(x.server.url+'/api/events',{method:'POST',headers:{...x.headers,Origin:'https://unrelated.example'},body:'{}'})).status,403)
    assert.equal((await fetch(x.server.url+'/api/events',{method:'POST',headers:{...x.headers,'X-Personal-Space-Token':'wrong'},body:'{}'})).status,401)
    a=await watch(x);const i=input(),flight=x.post('send',i);await x.ready
    const text=JSON.stringify(decision),cut=text.indexOf('"actions"')
    x.chunk(text.slice(0,cut))
    const partial=await a.until(s=>s.progress?.reply===decision.reply)
    assert.equal(partial.progress.turnId,i.command_id);assert.equal(partial.progress.state,'generating')
    assert.equal((await x.host.request('turn.read',{turn_id:i.command_id})).result.actions.length,0)
    await a.close();a=null;b=await watch(x)
    const resumed=await b.until(s=>s.progress?.reply===decision.reply)
    assert.equal(resumed.progress.runId,partial.progress.runId);assert.equal(x.calls(),1)
    x.chunk(text.slice(cut));x.finish()
    assert.equal((await flight).reply.ok,true)
    const done=await b.until(s=>s.view.activity?.taskStatus==='completed')
    assert.ok(done.view.activity.events.some(e=>e.kind==='completed'))
    assert.equal((await x.runtime.ui.result.open({taskId:done.view.activity.taskId})).result.metadata.total,'16.00')
    assert.equal(x.calls(),1);assert.equal(x.ledger.snapshot().inFlight,false)
  }finally{await a?.close();await b?.close();await x.close()}
})
test('stopping an incomplete stream cancels transport, discards preview, and executes no proposed action',async()=>{
  const x=await setup();let stream
  try{
    stream=await watch(x);const i=input(),flight=x.post('send',i);await x.ready
    x.chunk(JSON.stringify(decision).slice(0,-1))
    await stream.until(s=>s.progress?.reply===decision.reply)
    assert.equal((await x.post('send.cancel',{commandId:i.command_id})).reply.ok,true)
    await flight
    const turn=(await x.host.request('turn.read',{turn_id:i.command_id})).result
    assert.equal(turn.actions.length,0);assert.equal(turn.reply,null)
    assert.equal(x.signal().aborted,true);assert.equal(x.cancelled(),true)
    assert.equal(x.p.progress.snapshot().reply,'');assert.equal(x.calls(),1)
    assert.equal(x.ledger.snapshot().inFlight,false)
  }finally{await stream?.close();await x.close()}
})
test('browser reconnect renews a restarted local session without replaying the failed send',async()=>{
  const seen=[],calls=[],connections=[];let generation=0,controller
  const client=createClient({token:'old',reconnectMs:1,onSnapshot:s=>seen.push(s),onConnection:v=>connections.push(v),fetchImpl:async(url,init={})=>{
    calls.push({url,body:init.body,token:init.headers?.['X-Personal-Space-Token']})
    if(url==='/api/command')return new Response(JSON.stringify({reply:{ok:true},snapshot:{epoch:'old-server',revision:80}}))
    if(url==='/')return new Response('<meta name="personal-space-session" content="new">')
    if(generation++===0)return new Response('{}',{status:401})
    assert.equal(init.headers['X-Personal-Space-Token'],'new')
    const body=new ReadableStream({start(c){controller=c;c.enqueue(enc.encode('data: '+JSON.stringify({epoch:'new-server',revision:1})+'\n\n'))}})
    init.signal.addEventListener('abort',()=>{try{controller.close()}catch{}},{once:true})
    return new Response(body,{headers:{'Content-Type':'text/event-stream'}})
  }})
  try{
    await client.start()
    await new Promise((resolve,reject)=>{const end=Date.now()+3000;const check=()=>{if(seen.some(s=>s.epoch==='new-server'))resolve();else if(Date.now()>end)reject(Error('no renewed snapshot'));else setTimeout(check,5)};check()})
    assert.equal(seen.at(-1).revision,1)
    assert.equal(calls.filter(c=>c.url==='/api/command').length,1)
    assert.equal(calls.some(c=>c.body?.includes('send')),false)
    assert.ok(connections.includes(true))
  }finally{client.dispose()}
})
test('a late command response from an old session cannot replace the new server snapshot',async()=>{
  let finishOld,opened=0,bodyController,renewed
  const ready=new Promise(r=>{renewed=r}),seen=[]
  const client=createClient({token:'old',reconnectMs:1,onSnapshot:s=>{seen.push(s);if(s.epoch==='new')renewed()},fetchImpl:async(url,init={})=>{
    if(url==='/api/command'){
      if(JSON.parse(init.body).action==='send')return new Promise(r=>{finishOld=r})
      return new Response(JSON.stringify({reply:{ok:true},snapshot:{epoch:'old',revision:90}}))
    }
    if(url==='/')return new Response('<meta name="personal-space-session" content="new">')
    if(opened++===0)return new Response('{}',{status:401})
    const body=new ReadableStream({start(c){bodyController=c;c.enqueue(enc.encode('data: {"epoch":"new","revision":1}\n\n'))}})
    init.signal.addEventListener('abort',()=>{try{bodyController.close()}catch{}},{once:true})
    return new Response(body,{headers:{'Content-Type':'text/event-stream'}})
  }})
  const old=client.call('send',{text:'Fictional request'})
  try{
    await client.start();await ready
    finishOld(new Response(JSON.stringify({reply:{ok:true},snapshot:{epoch:'old',revision:1000}})))
    assert.equal((await old).error,'session_required')
    assert.equal(seen.at(-1).epoch,'new');assert.equal(seen.at(-1).revision,1)
  }finally{client.dispose()}
})
