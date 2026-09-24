import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {publicPrefix,readChatStream} from '../../../apps/desktop/product/providers/streaming.mjs'
import {createDeepSeekProviders} from '../../../apps/desktop/product/providers/deepseek.mjs'
import {createRequestLedger} from '../../../apps/desktop/product/providers/request-ledger.mjs'
import {readSse} from '../../../apps/desktop/personal-space/sse.mjs'
import {presentActivity,visibleDraft} from '../../../apps/desktop/personal-space/activity.mjs'

const enc=new TextEncoder(),frame=value=>`data: ${JSON.stringify(value)}\r\n\r\n`
const part=(content,finish_reason=null)=>({id:'fixture-stream',choices:[{index:0,delta:{content,reasoning_content:'PRIVATE_TRACE'},finish_reason}]})
const decision={displayable_summary:'Compare the supplied facts.',reply:'Hello, 世界 🌿. This is a fictional response.',actions:[],memories:[],followup:null}
const wire=value=>frame(part(JSON.stringify(value)))+frame(part('', 'stop'))+'data: [DONE]\n\n'
const bytesBody=bytes=>new ReadableStream({start(c){for(const byte of bytes)c.enqueue(Uint8Array.of(byte));c.close()}})
async function ledger(){await fs.mkdir('.test-data',{recursive:true});return createRequestLedger({file:path.join(await fs.mkdtemp(path.resolve('.test-data/core-009-parser-')),'requests.json')})}
function provider(journal,body){return createDeepSeekProviders({apiKey:'synthetic-secret',ledger:journal,streaming:true,fetchImpl:async(url,init)=>{
  const sent=JSON.parse(init.body);assert.equal(sent.stream,true);assert.equal(sent.stream_options.include_usage,true)
  return new Response(body,{headers:{'Content-Type':'text/event-stream'}})
}})}
test('SSE handles UTF-8 and CRLF split at every byte, comments and multi-line data',async()=>{
  const result=[]
  for await(const value of readSse(bytesBody(enc.encode(': heartbeat\r\n\r\ndata: 世界\r\ndata: 🌿\r\n\r\n'))))result.push(value)
  assert.deepEqual(result,['世界\n🌿'])
})
test('SSE rejects incomplete frames, bad UTF-8 and oversized input',async()=>{
  for(const [body,options] of [[new Response('data: unterminated').body,{}],[bytesBody([0xff]),{}],
    [new Response('data: xxxxx\n\n').body,{maxTotalBytes:3}],[new Response('data: xxxxx\n\n').body,{maxFrameBytes:3}]]){
    await assert.rejects(async()=>{for await(const _ of readSse(body,options)){} })
  }
})
test('public prefix handles escaping, unicode, nested keys and arbitrary fragment boundaries',()=>{
  const value={actions:[{kind:'csv.audit',reply:'NEVER_PROJECT_NESTED'}],...decision,reply:'A "quote", backslash \\, newline\n and 🌿.'}
  const text=JSON.stringify(value)
  for(let n=0;n<=text.length;n++){
    const fields=publicPrefix(text.slice(0,n))
    if(fields.reply){assert.equal(value.reply.startsWith(fields.reply.value),true);assert.notEqual(fields.reply.value,'NEVER_PROJECT_NESTED')}
  }
  assert.equal(publicPrefix(text).reply.value,value.reply)
  assert.equal(publicPrefix('{"reply":"\\u4e16\\u754c"}').reply.value,'世界')
  assert.throws(()=>publicPrefix('{"reply":"first","reply":"second"}'),/provider_invalid_output/)
})
test('valid provider stream emits previews, discards private trace, and returns one final decision',async()=>{
  const journal=await ledger(),p=provider(journal,bytesBody(enc.encode(wire(decision))))
  const updates=[];p.progress.subscribe(()=>updates.push(p.progress.snapshot()))
  const out=await p.turn.respond({turn_id:randomUUID()})
  assert.equal(out.decision.reply,decision.reply);assert.equal(out.displayableSummary,decision.displayable_summary)
  assert.equal(Object.hasOwn(out.decision,'displayable_summary'),false)
  assert.ok(updates.some(v=>v.state==='generating'&&v.reply.length))
  assert.equal(updates.at(-1).state,'received');assert.equal(journal.snapshot().used,1)
  assert.equal(JSON.stringify(updates).includes('PRIVATE_TRACE'),false)
})
for(const [name,text] of [
  ['missing done',frame(part(JSON.stringify(decision)))+frame(part('','stop'))],
  ['missing finish',frame(part(JSON.stringify(decision)))+'data: [DONE]\n\n'],
  ['length finish',frame(part('{}','length'))+'data: [DONE]\n\n'],
  ['two choices',frame({choices:[part('').choices[0],part('').choices[0]]})],
  ['wrong index',frame({choices:[{...part('').choices[0],index:1}]})],
  ['duplicate field',frame(part('{"reply":"hello","reply":"bye"}'))+frame(part('','stop'))+'data: [DONE]\n\n'],
  ['invalid decision',wire({reply:'fine',capabilities:['shell']})],
  ['extra content after finish',frame(part('{}','stop'))+frame(part('extra'))+'data: [DONE]\n\n'],
])test(`stream ${name} fails without a decision and clears visible draft`,async()=>{
  const p=provider(await ledger(),new Response(text).body)
  await assert.rejects(p.turn.respond({turn_id:randomUUID()}))
  assert.equal(p.progress.snapshot().state,'failed');assert.equal(p.progress.snapshot().reply,'')
})
test('escaped credential echoes and fragmented literal echoes never enter public previews',async()=>{
  for(const escaped of [false,true]){
    const secret='synthetic-secret',raw=escaped?[...secret].map(c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')).join(''):secret
    const content='{"reply":"'+raw+'","actions":[],"memories":[],"followup":null}'
    const body=[...content].map(c=>frame(part(c))).join('')+frame(part('','stop'))+'data: [DONE]\n\n'
    const p=provider(await ledger(),new Response(body).body),updates=[]
    p.progress.subscribe(()=>updates.push(p.progress.snapshot()))
    await assert.rejects(p.turn.respond({turn_id:randomUUID()}),/credential_echo_detected/)
    assert.equal(updates.some(row=>row.reply.includes('synthetic')),false)
  }
})
test('abort cancels the reader and retains one durable settled attempt without retries',async()=>{
  let cancelled=false
  const body=new ReadableStream({start(c){c.enqueue(enc.encode(frame(part('{"reply":"unfinished'))))},cancel(){cancelled=true}})
  const journal=await ledger(),p=provider(journal,body),controller=new AbortController()
  const flight=p.turn.respond({turn_id:randomUUID()},{signal:controller.signal})
  controller.abort();await assert.rejects(flight,/provider_aborted/)
  assert.equal(cancelled,true);assert.equal(journal.snapshot().used,1);assert.equal(journal.snapshot().inFlight,false)
})
test('usage-only final chunk is accepted but cannot precede the finish marker',async()=>{
  const text=frame(part(JSON.stringify(decision)))+frame(part('','stop'))+frame({choices:[],usage:{total_tokens:10}})+'data: [DONE]\n\n'
  assert.equal((await readChatStream(new Response(text).body)).usage.total_tokens,10)
  await assert.rejects(readChatStream(new Response(frame({choices:[],usage:{total_tokens:10}})).body))
})
test('live worker receipts drive tool presentation before final conversation refresh',()=>{
  const id=randomUUID(),activity={turnId:id,actions:[],taskStatus:null},work={selected:true,turnId:id,phase:'working',activity:{
    turnId:id,actions:[{kind:'csv.audit'}],taskStatus:'running',events:[]}}
  assert.equal(presentActivity({id,state:'queued'},{activity,work}).mode,'tool')
  assert.equal(presentActivity({id,state:'queued'},{activity,work}).heading,'正在核对 CSV')
  const progress={turnId:id,runId:randomUUID(),state:'generating',reply:'partial',summary:'approach'}
  assert.equal(visibleDraft({id,state:'queued'},{progress,work}).reply,'partial')
  assert.equal(visibleDraft({id:randomUUID(),state:'queued'},{progress,work}),null)
  assert.equal(visibleDraft({id,state:'model_failed'},{progress,work}),null)
  assert.equal(visibleDraft({id,state:'responded'},{progress,work}),null)
  assert.equal(visibleDraft({id,state:'queued'},{progress:{...progress,state:'failed'},work}),null)
})
