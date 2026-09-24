import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {createRequestLedger} from '../../../apps/desktop/product/providers/request-ledger.mjs'
import {createDeepSeekProviders} from '../../../apps/desktop/product/providers/deepseek.mjs'
import {presentActivity,currentStop} from '../../../apps/desktop/personal-space/activity.mjs'

async function fresh(){await fs.mkdir('.test-data',{recursive:true});return path.join(await fs.mkdtemp(path.resolve('.test-data/core-008-')),'requests.json')}
const reply=summary=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{
  reasoning_content:'PRIVATE_REASONING_NOT_FOR_DISPLAY',content:JSON.stringify({reply:'Public reply',actions:[],memories:[],followup:null,
    ...(summary===undefined?{}:{displayable_summary:summary})})}}]}))
test('quota-free migration preserves six original attempts byte-for-byte and permits later requests after restart',async()=>{
  const file=await fresh(),attempts=Array.from({length:6},()=>({id:randomUUID(),kind:'turn',state:'received',at:new Date().toISOString()}))
  const original=JSON.stringify({version:1,limit:6,attempts},null,2)+'\n';await fs.writeFile(file,original)
  let requests=0
  for(let i=0;i<9;i++){
    const ledger=createRequestLedger({file})
    const p=createDeepSeekProviders({apiKey:'synthetic',ledger,fetchImpl:async()=>{requests++;return reply()}})
    assert.equal((await p.turn.respond({})).decision.reply,'Public reply')
    assert.equal(Object.hasOwn(p.connection(),'budget'),false)
  }
  const v=JSON.parse(await fs.readFile(file,'utf8'))
  assert.equal(v.version,2);assert.equal(v.limit,null);assert.equal(v.attempts.length,15);assert.equal(requests,9)
  assert.deepEqual(v.attempts.slice(0,6),attempts);assert.equal(await fs.readFile(file+'.v1-backup.json','utf8'),original)
})
test('quota-free journal retains cross-instance serialization until an in-flight request settles',async()=>{
  const file=await fresh(),ledger=createRequestLedger({file});let release,calls=0
  const a=createDeepSeekProviders({apiKey:'synthetic',ledger,fetchImpl:()=>new Promise(r=>{release=r})})
  const b=createDeepSeekProviders({apiKey:'synthetic',ledger:createRequestLedger({file}),fetchImpl:async()=>{calls++;return reply()}})
  const pending=a.turn.respond({});await assert.rejects(b.turn.respond({}),/request_in_progress/)
  assert.equal(calls,0);release(reply());await pending;await b.turn.respond({});assert.equal(calls,1)
})
test('legacy unfinished attempt and corrupt journals remain visible failures without erasing history',async()=>{
  const file=await fresh(),v={version:1,limit:6,attempts:[{id:randomUUID(),kind:'turn',state:'reserved',at:'2026-09-24T00:00:00Z'}]}
  await fs.writeFile(file,JSON.stringify(v));const ledger=createRequestLedger({file})
  assert.throws(()=>ledger.reserve('turn'),/request_in_progress/)
  assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),v)
  await fs.writeFile(file,'not json');assert.throws(()=>ledger.snapshot(),/ledger_invalid/)
})
test('a pre-existing identical migration backup allows recovery from interrupted migration',async()=>{
  const file=await fresh(),text=JSON.stringify({version:1,limit:6,attempts:[]})
  await fs.writeFile(file,text);await fs.writeFile(file+'.v1-backup.json',text)
  const ledger=createRequestLedger({file});const id=ledger.reserve('turn');ledger.finish(id,{state:'received'})
  assert.equal(ledger.snapshot().used,1)
})
test('public summary is separate from executable decisions and private provider reasoning',async()=>{
  const p=createDeepSeekProviders({apiKey:'synthetic',ledger:createRequestLedger({file:await fresh()}),fetchImpl:async()=>reply('先对照已给出的事实，再简要解释差异。')})
  const result=await p.turn.respond({})
  assert.equal(result.displayableSummary,'先对照已给出的事实，再简要解释差异。')
  assert.equal(Object.hasOwn(result.decision,'displayable_summary'),false)
  assert.equal(JSON.stringify(result).includes('PRIVATE_REASONING'),false)
})
for(const summary of [null,{},'','x'.repeat(801)])test(`rejects malformed public summary ${JSON.stringify(summary).slice(0,20)}`,async()=>{
  const p=createDeepSeekProviders({apiKey:'synthetic',ledger:createRequestLedger({file:await fresh()}),fetchImpl:async()=>reply(summary)})
  await assert.rejects(p.turn.respond({}),/provider_invalid_output/)
})
test('thinking begins with input submission and ordinary chat never creates a task card',()=>{
  const id=randomUUID(),record={id,state:'saving'}
  assert.equal(presentActivity(record,{pendingId:id}).heading,'正在思考')
  assert.equal(presentActivity(record,{pendingId:id}).mode,'thinking')
  assert.equal(presentActivity({...record,state:'generating'},{work:{selected:true,turnId:id,phase:'generating'}}).heading,'正在思考')
  assert.equal(presentActivity({...record,state:'responded',reply:'任务已完成',actions:[]}).mode,null)
  assert.equal(presentActivity({...record,state:'responded',provider_summary:'Done',actions:[]}).hasActions,false)
})
test('failed and cancelled chats use response language, and unrelated work cannot animate old turns',()=>{
  const id=randomUUID()
  assert.equal(presentActivity({id,state:'model_failed'}).heading,'这次回复未完成')
  assert.equal(presentActivity({id,state:'cancelled'}).heading,'已停止回复')
  assert.equal(presentActivity({id,state:'generating'},{send:{turnId:randomUUID()}}).mode,'notice')
  assert.equal(presentActivity({id,state:'saving'}).mode,'notice')
})
test('cancel never targets an old selected turn while a new input is awaiting acknowledgment',()=>{
  const pendingId=randomUUID(),old=randomUUID(),work={selected:true,turnId:old,phase:'generating'}
  assert.equal(currentStop({pendingId,work}),null)
  assert.equal(currentStop({pendingId,work,send:{commandId:old}}),null)
  assert.deepEqual(currentStop({pendingId,work,send:{commandId:pendingId}}),{action:'send.cancel',args:{commandId:pendingId}})
  assert.deepEqual(currentStop({work}),{action:'work.stop',args:{turnId:old}})
  assert.equal(currentStop({work:{...work,phase:'settled'}}),null)
})
test('cached task turns reuse the trusted event projector and retain results after selecting another turn',()=>{
  const id=randomUUID(),task=randomUUID(),attempt=randomUUID()
  const record={id,state:'actions_recorded',actions:[{id:randomUUID(),kind:'csv.audit',state:'accepted',task:{
    task_id:task,current_attempt_id:attempt,status:'completed',attempt_count:1},events:{task_id:task,next_after_seq:null,items:[{
      task_id:task,attempt_id:attempt,seq:1,kind:'completed',status:'completed'}]}}]}
  const p=presentActivity(record,{activity:{turnId:randomUUID()}})
  assert.equal(p.mode,'tool');assert.equal(p.done,true);assert.equal(p.activity.events.length,1)
  assert.equal(p.active,false)
  record.actions[0].events.items[0].task_id=randomUUID()
  assert.equal(presentActivity(record).done,false)
})
