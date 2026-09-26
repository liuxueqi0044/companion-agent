import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import {createPersonalSpaceServer} from '../../../apps/desktop/product/web/server.mjs'

test('large goal snapshots drain once and later revisions still arrive without starving HTTP',async()=>{
  let notify,reads=0,version=0
  const runtime={snapshot:()=>{reads++;return {version,payload:'x'.repeat(192*1024)}},subscribe:fn=>{notify=fn;return ()=>{}},dispose(){},whenIdle:async()=>{}}
  const server=await createPersonalSpaceServer({runtime,vueFile:path.resolve('../companion-agent/node_modules/vue/dist/vue.runtime.esm-browser.prod.js')})
  const controller=new AbortController();let consumer
  try{
    const html=await(await fetch(server.url)).text(),token=html.match(/name="personal-space-session" content="([^"]+)"/)[1]
    const response=await fetch(server.url+'/api/events',{method:'POST',headers:{Origin:server.url,'Content-Type':'application/json','X-Personal-Space-Token':token},body:'{}',signal:controller.signal})
    let buffer='',events=[]
    consumer=(async()=>{for await(const bytes of response.body){buffer+=new TextDecoder().decode(bytes);for(let n;(n=buffer.indexOf('\n\n'))>=0;){events.push(JSON.parse(buffer.slice(6,n)));buffer=buffer.slice(n+2)}}})().catch(e=>{if(!controller.signal.aborted)throw e})
    const waitFor=async predicate=>{for(let n=0;n<100&&!predicate();n++)await new Promise(r=>setTimeout(r,10));assert.ok(predicate())}
    await waitFor(()=>events.length===1)
    const readsBefore=reads
    await new Promise(r=>setTimeout(r,120))
    assert.equal(reads,readsBefore,'drain must not create another identical snapshot')
    assert.equal((await fetch(server.url+'/shell.mjs',{signal:AbortSignal.timeout(1000)})).status,404)
    version=1;notify();await waitFor(()=>events.some(e=>e.view.version===1))
    assert.equal(events.length,2);assert.equal(events[1].revision,1)
  }finally{controller.abort();await consumer;await server.close()}
})
