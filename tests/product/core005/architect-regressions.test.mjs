import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID as uuid} from 'node:crypto'
import {createContactRunner} from '../../../apps/desktop/product/execution/contact-runner.mjs'
import {contactReply} from '../../../apps/desktop/product/execution/contact-provider.mjs'
import {createTurnRunner} from '../../../apps/desktop/product/execution/runner.mjs'
import {registerExecutionOwner} from '../../../apps/desktop/product/execution/lease.mjs'
import {createProductHost} from '../../../apps/desktop/product/host.mjs'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'

const ok=result=>({ok:true,result}),bad=code=>({ok:false,error:{code}})
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}}
const flush=async()=>{for(let i=0;i<50;i++)await Promise.resolve()}
const job=()=>({id:uuid(),ticket:uuid(),purpose:'Fictional purpose',source:'Fictional input',
  recent_interactions:[],memories:[],expires_at:'2030-01-01T00:00:00Z'})
const send={disposition:'send',text:'Fictional message',reason:'still_relevant'}
const cancel={disposition:'cancel',reason:'resolved'}
const defer={disposition:'defer',reason:'later',due_at:'2029-01-01T00:00:00Z'}

for(const decision of [{...send,due_at:null},{...defer,text:null},{...cancel,text:null,due_at:null}])
  test(`provider accepts schema-valid nullable fields for ${decision.disposition}`,()=>{
    assert.ok(contactReply({decision}))
  })

const impossible=[
  [send,'evaluating',null],[send,'needs_retry','provider_failed'],
  [send,'pending','later'],[send,'cancelled','resolved'],
  [cancel,'sent','resolved'],[defer,'sent','later'],
  [send,'sent','resolved'],[defer,'cancelled','resolved'],
]

test('legitimate completion branches remain distinct from a delivered message',async()=>{
  for(const [decision,state,reason] of [[send,'sent',send.reason],[cancel,'cancelled',cancel.reason],
    [defer,'pending',defer.reason],[defer,'cancelled','reevaluation_limit'],
    [send,'pending','context_changed'],[cancel,'pending','delivery_window'],[send,'expired','expired']]){
    const claimed=job(),value={id:claimed.id,state,reason,message_id:state==='sent'?uuid():null}
    const host={request(action){
      if(action==='reminder.deliver-due')return ok([])
      if(action==='contact.claim')return ok(claimed)
      if(action==='contact.complete'||action==='contact.read')return ok(value)
      return bad('stale_generation')
    }}
    const runner=createContactRunner({host,provider:{configured:true,reassess:()=>({decision})}})
    try{
      const result=await runner.pulse()
      assert.equal(result.ok,true,JSON.stringify(result))
      assert.equal(result.result.plan.state,state)
      assert.equal(runner.snapshot().contactMessageIds.length,state==='sent'?1:0)
    }finally{runner.dispose();await runner.whenIdle()}
  }
})
for(const [decision,state,reason] of impossible)
  test(`completion cannot report ${decision.disposition} as ${state}/${reason}`,async()=>{
    const claimed=job(),calls=[]
    const receipt={id:claimed.id,state,reason,message_id:state==='sent'?uuid():null}
    const host={request(action){calls.push(action)
      if(action==='reminder.deliver-due')return ok([])
      if(action==='contact.claim')return ok(claimed)
      if(action==='contact.complete'||action==='contact.read')return ok(receipt)
      return bad('stale_generation')
    }}
    const runner=createContactRunner({host,provider:{configured:true,reassess:()=>({decision})}})
    try{
      const reply=await runner.pulse()
      assert.equal(reply.error,'protocol_error')
      assert.equal(runner.snapshot().needsReconciliation,true)
      assert.deepEqual(runner.snapshot().contactMessageIds,[])
      assert.equal(calls.includes('contact.read'),false)
    }finally{runner.dispose();await runner.whenIdle()}
  })

test('an uncertain turn readback during provider work prevents subsequent accept or execute',async()=>{
  const id=uuid(),held=deferred(),calls=[]
  const host={request(action,p){calls.push(action)
    if(action==='turn.begin')return ok({turn_id:id,ticket:uuid()})
    if(action==='turn.read')return ok({id,state:'outcome_unknown',actions:[]})
    if(action==='turn.accept')return ok({id,state:'responded',actions:[]})
    if(action==='turn.fail-generation')return ok({id,state:'model_failed',error:p.reason})
    return bad('invalid_request')
  }}
  const runner=createTurnRunner({host,provider:{configured:true,respond:()=>held.promise}})
  const running=runner.run({turnId:id});await flush()
  assert.equal((await runner.reconcile()).result.needsReconciliation,true)
  held.resolve({decision:{reply:'Late response'}})
  await running
  assert.equal(calls.includes('turn.accept'),false)
  assert.equal(calls.includes('turn.execute'),false)
  assert.equal(calls.includes('turn.fail-generation'),false)
  runner.dispose();await runner.whenIdle()
})

for(const point of ['before_provider','before_complete'])
  test(`shared uncertainty introduced ${point} prevents contact's next side effect`,async()=>{
    const claimed=job(),calls=[];let providerCalls=0,marked=false
    const host={request(action){calls.push(action)
      if(action==='reminder.deliver-due')return ok([])
      if(action==='contact.claim')return ok(claimed)
      if(action==='contact.complete'||action==='contact.read')return ok({id:claimed.id,state:'sent',reason:'still_relevant',message_id:claimed.id})
      return bad('stale_generation')
    }}
    const other=registerExecutionOwner(host,'turn')
    const runner=createContactRunner({host,provider:{configured:true,reassess(){providerCalls++;return {decision:send}}}})
    runner.subscribe(s=>{
      if(!marked && (point==='before_provider'?s.providerPending:s.phase==='completing'&&s.hostPending===1)){
        marked=true;other.markUnknown()
      }
    })
    await runner.pulse()
    assert.equal(calls.includes('contact.complete'),false)
    assert.equal(providerCalls,point==='before_provider'?0:1)
    assert.equal(runner.snapshot().needsReconciliation,true)
    runner.dispose();other.dispose();await runner.whenIdle()
  })

test('schema-valid nullable send reaches real SQLite exactly once',async()=>{
  const workspace=path.resolve(fileURLToPath(new URL('../../..',import.meta.url)))
  const python=path.resolve(workspace,'../companion-agent/.venv/Scripts/python.exe')
  const parent=path.join(workspace,'.test-data');await fs.mkdir(parent,{recursive:true})
  const dataRoot=await fs.mkdtemp(path.join(parent,'core-005-architect-'))
  await promisify(execFile)(python,['-I','-B','tests/product/core005/prepare_fixture.py',workspace,dataRoot,'1'],
    {cwd:workspace,windowsHide:true,encoding:'utf8'})
  const host=createProductHost({python,workspace,dataRoot})
  let calls=0
  const runner=createContactRunner({host,provider:{configured:true,reassess(){calls++;return {decision:{...send,due_at:null}}}}})
  try{
    const first=await runner.pulse()
    assert.equal(first.ok,true,JSON.stringify(first))
    assert.equal(first.result.plan.state,'sent')
    assert.equal((await runner.pulse()).result.plan,null)
    const inbox=await host.request('inbox.list')
    assert.equal(inbox.result.filter(m=>m.kind==='proactive').length,1)
    assert.equal(calls,1)
  }finally{runner.dispose();await runner.whenIdle();await host.dispose()}
})
