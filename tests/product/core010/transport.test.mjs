import {resolveRuntime} from '../../../apps/desktop/product/runtime-paths.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID,createHash} from 'node:crypto'
import {createProductHost} from '../../../apps/desktop/product/host.mjs'
import {createProductRuntime} from '../../../apps/desktop/product/runtime/index.mjs'
import {createPersonalSpaceServer} from '../../../apps/desktop/product/web/server.mjs'
import {createSpaceService} from '../../../apps/desktop/product/space/service.mjs'

const sample={summary:'Small fictional canvas',files:{'view.html':'<main><h1>一个新空间</h1></main>','view.css':'body{background:#ffe9cc}','view.js':''}}
async function setup(){
  await fs.mkdir('.test-data',{recursive:true});const dataRoot=await fs.mkdtemp(path.resolve('.test-data/core-010-http-'))
  const host=createProductHost({python:resolveRuntime('python'),workspace:path.resolve('.'),dataRoot})
  let resolveSpace,enteredSpace,resolveTurn,enteredTurn,calls=0
  const spaceStarted=new Promise(r=>{enteredSpace=r}),turnStarted=new Promise(r=>{enteredTurn=r})
  const spaceWait=new Promise(r=>{resolveSpace=r}),turnWait=new Promise(r=>{resolveTurn=r})
  const runtime=createProductRuntime({host,turnProvider:{configured:true,respond:async()=>{calls++;enteredTurn();await turnWait;return {decision:{reply:'Synthetic response',actions:[],memories:[],followup:null}}}}})
  assert.equal((await runtime.initialize()).ok,true)
  const space=await createSpaceService({root:path.join(dataRoot,'canvas'),isRuntimeBusy:()=>runtime.snapshot().runtime.executionBusy,
    provider:{generate:async()=>{calls++;enteredSpace();await spaceWait;return sample}}})
  const server=await createPersonalSpaceServer({runtime,space,vueFile:resolveRuntime('vue')})
  const token=(await(await fetch(server.url)).text()).match(/name="personal-space-session" content="([^"]+)"/)[1]
  const headers={Origin:server.url,'Content-Type':'application/json','X-Personal-Space-Token':token}
  const post=async(action,args={},extra={})=>(await fetch(server.url+'/api/command',{method:'POST',headers:{...headers,...extra},body:JSON.stringify({action,args})})).json()
  return {host,runtime,space,server,post,headers,dataRoot,spaceStarted,turnStarted,resolveSpace,resolveTurn,calls:()=>calls,
    async close(){resolveSpace();resolveTurn();await server.close();await host.dispose()}}
}
const input=()=>({command_id:randomUUID(),conversation_id:randomUUID(),text:'Synthetic trial',temporary:true,csv_text:null})
test('HTTP isolation, capability tickets, user-confirmed activation and rollback leave all product databases unchanged',async()=>{
  const x=await setup()
  try{
    const dbs=['product.sqlite3','personal_ai.sqlite3','tasks.sqlite3']
    const hash=async name=>createHash('sha256').update(await fs.readFile(path.join(x.dataRoot,name))).digest('hex')
    const before=await Promise.all(dbs.map(hash))
    assert.equal((await x.post('space.generate',{prompt:'A study',expectedVersion:0})).reply.ok,true)
    await x.spaceStarted
    assert.equal((await x.post('send',input())).reply.error,'runner_busy')
    x.resolveSpace();await x.space.whenIdle()
    const revision=x.space.snapshot().job.candidateId,m=(await x.post('space.preview',{revision})).reply.mount
    const response=await fetch(x.server.url+m.url),html=await response.text(),csp=response.headers.get('content-security-policy')
    assert.equal(response.status,200);assert.match(csp,/sandbox allow-scripts/);assert.match(csp,/frame-ancestors http:\/\/127/)
    assert.match(csp,/script-src 'sha256-/);assert.doesNotMatch(csp,/allow-same-origin|unsafe-eval/)
    assert.doesNotMatch(html,/personal-space-session|Synthetic trial/)
    assert.equal((await fetch(x.server.url+'/space-frame/'+'a'.repeat(48))).status,404)
    assert.equal((await x.post('space.activate',{revision,mountId:m.id,expectedVersion:x.space.snapshot().version},{Origin:'null'})).error,'origin_denied')
    assert.equal((await x.post('space.ready',{revision,mountId:m.id})).reply.ok,true)
    assert.equal((await x.post('space.activate',{revision,mountId:m.id,expectedVersion:x.space.snapshot().version})).reply.ok,true)
    const current=x.space.snapshot().version
    assert.equal((await x.post('space.rollback',{expectedVersion:current-1})).reply.error,'revision_conflict')
    assert.equal((await x.post('space.rollback',{expectedVersion:current})).reply.ok,true)
    assert.equal(x.space.snapshot().active,null);assert.equal(x.calls(),1)
    assert.deepEqual(await Promise.all(dbs.map(hash)),before)
  }finally{await x.close()}
})
test('a runtime turn owns the execution boundary before a customization request can start',async()=>{
  const x=await setup()
  try{const flight=x.post('send',input());await x.turnStarted
    assert.equal((await x.post('space.generate',{prompt:'try while busy',expectedVersion:0})).reply.error,'runner_busy')
    assert.equal(x.calls(),1);x.resolveTurn();assert.equal((await flight).reply.ok,true)
    assert.equal(x.space.snapshot().candidates.length,0)
  }finally{await x.close()}
})
