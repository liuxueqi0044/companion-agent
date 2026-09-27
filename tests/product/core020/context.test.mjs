import test from 'node:test'
import assert from 'node:assert/strict'
import {packMessages,MAX_REQUEST_BYTES} from '../../../apps/desktop/product/providers/context-window.mjs'
import {createDeepSeekProviders} from '../../../apps/desktop/product/providers/deepseek.mjs'

const response=()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:'ok',actions:[],memories:[],followup:null})}}]}))
test('many legal long messages do not prevent later short messages; actual request is bounded',async()=>{
  let calls=0,reservations=0
  const history=[]
  const p=createDeepSeekProviders({apiKey:'offline-only',ledger:{snapshot:()=>({}),reserve:()=>String(++reservations),finish(){}},
    fetchImpl:async(_,init)=>{
      calls++
      assert.ok(Buffer.byteLength(init.body)<=MAX_REQUEST_BYTES)
      const context=JSON.parse(JSON.parse(init.body).messages[1].content).context
      assert.equal(context.user_text,calls<=12?'长消息🙂'.repeat(2200):'现在还在吗？')
      assert.deepEqual(context.capabilities,['artifact.create'])
      assert.deepEqual(context.workflow,{receipts:[{action_id:'verified',result:{value:42}}]})
      if(calls>3)assert.ok(context.context_window.omitted_history>0)
      return response()
    }})
  for(let n=0;n<14;n++){
    const current=n<12?'长消息🙂'.repeat(2200):'现在还在吗？'
    assert.ok(Buffer.byteLength(current)<=32*1024)
    const context={user_text:current,history,memories:[],capabilities:['artifact.create'],workflow:{receipts:[{action_id:'verified',result:{value:42}}]}}
    const before=JSON.stringify(context)
    await p.turn.respond(context)
    assert.equal(JSON.stringify(context),before)
    history.push({id:String(n),text:current,reply:'回复'.repeat(3000)})
  }
  assert.equal(calls,14);assert.equal(reservations,14)
})
test('UTF-8, escaping, memory and contact history share the serialized request bound',()=>{
  const memories=Array.from({length:96},(_,i)=>({id:String(i),content:'喜好\\"\n🙂'.repeat(70)}))
  const context={source:'这次联系的来源',recent_interactions:Array.from({length:12},()=>({text:'旧消息🙂'.repeat(3000),reply:'回复'})),memories}
  const messages=packMessages({prompt:'规则'.repeat(1000),context,request:messages=>({model:'offline',messages})})
  const next=JSON.parse(messages[1].content).context
  assert.ok(Buffer.byteLength(JSON.stringify({model:'offline',messages}))<=MAX_REQUEST_BYTES)
  assert.equal(next.source,context.source)
  assert.ok(next.context_window.omitted_memories>0)
  assert.ok(next.context_window.omitted_recent_interactions>0)
  assert.equal(context.memories.length,96)
})
test('protected oversized current input fails before reserving an attempt',async()=>{
  let called=false
  const p=createDeepSeekProviders({apiKey:'offline-only',ledger:{reserve(){called=true},snapshot:()=>({})},fetchImpl:()=>{called=true}})
  await assert.rejects(p.turn.respond({user_text:'x'.repeat(100*1024)}),/provider_input_too_large/)
  assert.equal(called,false)
})
