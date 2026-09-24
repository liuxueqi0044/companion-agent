import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {createCodingProvider,codingCommand} from '../../../apps/desktop/product/providers/coding.mjs'
import {createRequestLedger} from '../../../apps/desktop/product/providers/request-ledger.mjs'

test('coding command pins DeepSeek, an isolated home, disabled shell, and no current account',()=>{
  const c=codingCommand({home:'C:/fake/home',workspace:'C:/fake/work',schemaFile:'C:/fake/schema.json'})
  assert.equal(c.env.CODEX_HOME,'C:/fake/home');assert.equal(c.env.OPENAI_API_KEY,undefined);assert.equal(c.env.CODEX_API_KEY,undefined)
  assert.ok(c.args.includes('--ignore-user-config'));assert.ok(c.args.includes('read-only'));assert.ok(c.args.includes('features.shell_tool=false'))
  assert.ok(c.args.some(a=>a.includes('api.deepseek.com')));assert.equal(c.args.some(a=>a.includes('api.openai.com')),false)
})
async function fixture(script){
  const root=await fs.mkdtemp(path.resolve('.test-data/core012-coding-')),file=path.join(root,'child.mjs')
  await fs.writeFile(file,script)
  const ledger=createRequestLedger({file:path.join(root,'ledger.json')})
  const provider=createCodingProvider({executable:process.execPath,root:path.join(root,'jobs'),apiKey:'synthetic-test-secret',ledger,prefixArgs:[file],timeoutMs:1000})
  return {provider,root,ledger}
}
const context={capabilities:['artifact.create'],user_text:'/code build a tiny function',history:[],memories:[]}
test('actual subprocess JSONL produces a source artifact and a durable receipt without credentials',async()=>{
  const f=await fixture(`process.stdin.resume();process.stdin.on('end',()=>{for(const e of [
    {type:'thread.started',thread_id:'synthetic'},
    {type:'item.completed',item:{type:'agent_message',text:JSON.stringify({title:'Helper',files:[{path:'helper.py',content:'def add(a,b): return a+b'}]})}},
    {type:'turn.completed'}])console.log(JSON.stringify(e));});`)
  const r=await f.provider.respond(context)
  assert.equal(r.decision.actions[0].kind,'artifact.create');assert.equal(f.ledger.snapshot().inFlight,false)
  const jobs=await fs.readdir(path.join(f.root,'jobs')),receipt=await fs.readFile(path.join(f.root,'jobs',jobs[0],'receipt.json'),'utf8')
  assert.equal(JSON.parse(receipt).state,'received');assert.equal(receipt.includes('synthetic-test-secret'),false)
})
test('timeout kills owned subprocess, drains before reuse, and never retries',async()=>{
  const f=await fixture(`process.stdin.resume();setInterval(()=>{},500);`)
  const p=f.provider.respond(context)
  await assert.rejects(f.provider.respond(context),/provider_busy/)
  await assert.rejects(p,/provider_timeout/)
  assert.equal(f.ledger.snapshot().used,1);assert.equal(f.ledger.snapshot().inFlight,false)
})
test('zero exit without completed event is not accepted as success',async()=>{
  const f=await fixture(`console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'{}'}}))`)
  await assert.rejects(f.provider.respond(context),/provider_invalid_output/)
  assert.equal(f.ledger.snapshot().inFlight,false)
})
