import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {createAttemptBudget,createDeepSeekProviders,ENDPOINT} from '../../../apps/desktop/product/providers/deepseek.mjs'

const base=path.resolve('.test-data')
async function budget(limit=6){await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,'core-007-budget-'));const file=path.join(root,'attempts.json');return {file,value:createAttemptBudget({file,limit})}}
const response=(decision={reply:'Fictional reply',actions:[],memories:[],followup:null})=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(decision),reasoning_content:'must not be exposed'}}],usage:{prompt_tokens:12,completion_tokens:9,total_tokens:21}}))

test('adapter sends bounded JSON request to official endpoint and returns decision only',async()=>{
  const b=await budget();let calls=0
  const p=createDeepSeekProviders({apiKey:'synthetic-not-a-key',budget:b.value,fetchImpl:async(url,init)=>{
    calls++;assert.equal(url,ENDPOINT);assert.equal(init.redirect,'error');assert.equal(init.headers.Authorization,'Bearer synthetic-not-a-key')
    const body=JSON.parse(init.body);assert.deepEqual(body.response_format,{type:'json_object'});assert.equal(body.thinking.type,'disabled');assert.equal(body.stream,false)
    assert.equal(body.messages.some(m=>m.content.includes('synthetic-not-a-key')),false)
    return response()
  }})
  const result=await p.turn.respond({user_text:'fictional'})
  assert.deepEqual(Object.keys(result),['decision']);assert.equal(result.decision.reply,'Fictional reply');assert.equal(calls,1)
  assert.equal(p.connection().budget.remaining,5);assert.equal(JSON.stringify(p.connection()).includes('synthetic-not-a-key'),false)
  assert.equal(JSON.stringify(result).includes('must not be exposed'),false)
  assert.equal((await fs.readFile(b.file,'utf8')).includes('Fictional reply'),false)
})

test('budget persists across instances and prevents automatic extra requests',async()=>{
  const b=await budget(1);let requests=0
  const p=createDeepSeekProviders({apiKey:'synthetic',budget:b.value,fetchImpl:async()=>{requests++;return new Response('',{status:429})}})
  await assert.rejects(p.turn.respond({}),/provider_rate_limited/)
  const again=createDeepSeekProviders({apiKey:'synthetic',budget:createAttemptBudget({file:b.file,limit:1}),fetchImpl:async()=>{requests++;return response()}})
  await assert.rejects(again.turn.respond({}),/request_budget_exhausted/)
  assert.equal(requests,1);assert.equal(again.connection().budget.remaining,0)
})

test('turn and contact share one provider slot until transport actually settles',async()=>{
  const b=await budget();let resolve,entered;const ready=new Promise(r=>{entered=r}),held=new Promise(r=>{resolve=r})
  const p=createDeepSeekProviders({apiKey:'synthetic',budget:b.value,fetchImpl:()=>{entered();return held}})
  const first=p.turn.respond({});await ready
  await assert.rejects(p.contact.reassess({}),/provider_busy/);assert.equal(b.value.snapshot().used,1)
  resolve(response());await first;assert.equal(p.connection().busy,false)
})

test('already aborted calls do not reserve budget or invoke transport',async()=>{
  const b=await budget();const p=createDeepSeekProviders({apiKey:'synthetic',budget:b.value,fetchImpl:()=>{throw Error('must not run')}})
  await assert.rejects(p.turn.respond({},{signal:AbortSignal.abort()}),/provider_aborted/);assert.equal(b.value.snapshot().used,0)
})

test('separate provider instances share the durable in-flight barrier',async()=>{
  const b=await budget();let release,entered;const ready=new Promise(r=>{entered=r})
  const first=createDeepSeekProviders({apiKey:'synthetic',budget:b.value,fetchImpl:()=>{entered();return new Promise(r=>{release=r})}})
  let secondCalls=0
  const second=createDeepSeekProviders({apiKey:'synthetic',budget:createAttemptBudget({file:b.file,limit:6}),fetchImpl:async()=>{secondCalls++;return response()}})
  const pending=first.turn.respond({});await ready
  await assert.rejects(second.turn.respond({}),/request_in_progress/)
  assert.equal(secondCalls,0);assert.equal(b.value.snapshot().used,1)
  release(response());await pending;await second.turn.respond({})
  assert.equal(secondCalls,1);assert.equal(b.value.snapshot().used,2)
})

for(const kind of ['key-echo','extra-key','truncated','oversized'])test(`rejects ${kind} without exposing response`,async()=>{
  const b=await budget()
  const p=createDeepSeekProviders({apiKey:'synthetic-secret-never-echo',budget:b.value,fetchImpl:async()=>{
    if(kind==='key-echo')return response({reply:'synthetic-secret-never-echo'})
    if(kind==='extra-key')return response({reply:'hello',capabilities:['any']})
    if(kind==='oversized')return new Response('x'.repeat(140*1024))
    return new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'{}'}}]}))
  }})
  await assert.rejects(p.turn.respond({}));assert.equal(p.connection().budget.used,1)
  assert.equal(JSON.stringify(p.connection()).includes('synthetic-secret-never-echo'),false)
  assert.equal((await fs.readFile(b.file,'utf8')).includes('synthetic-secret-never-echo'),false)
})

test('corrupt and locked budget fail closed',async()=>{
  const b=await budget();await fs.writeFile(b.file,'{"version":1,"limit":6,"attempts":"wrong"}')
  assert.throws(()=>b.value.reserve('turn'),/budget_invalid/)
  await fs.writeFile(b.file+'.lock','owned')
  assert.throws(()=>b.value.reserve('turn'),/budget_locked/)
})
