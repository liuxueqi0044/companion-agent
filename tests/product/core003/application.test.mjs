import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {createProductApplication} from '../../../apps/desktop/product/application/index.mjs'

const policy={revision:1,memory_enabled:true,memory_categories:['work','preferences','goals'],
  proactive_enabled:false,timezone:'UTC',start_minute:540,end_minute:1260,daily_limit:1,
  daily_evaluation_limit:3,topics:['work','daily','wellbeing'],paused_until:null}
const home={profile:{profile_id:randomUUID(),revision:1,preferences:{ai_name:'AI',
  address_user_as:'Friend',communication_instructions:''}},policy,unread_count:0,
  experience_revision:1,model_status:'not_configured',runtime:'local_device',native_isolation:'not_run'}
const defer=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return{promise,resolve}}

test('application construction is inert; initialize is reentrant single flight and dispose never closes host',async()=>{
  const held=defer(),calls=[]
  const host={request(action){calls.push(action)
    return action==='bootstrap' ? held.promise : Promise.resolve({ok:true,result:policy})}}
  const app=createProductApplication({host})
  assert.deepEqual(calls,[])
  let nested
  app.subscribe(snapshot=>{if(snapshot.loading && !nested)nested=app.initialize()})
  app.subscribe(()=>{throw new Error('view broke')})
  const first=app.initialize()
  assert.strictEqual(nested,first)
  await Promise.resolve()
  assert.deepEqual(calls,['bootstrap'])
  held.resolve({ok:true,result:home})
  assert.equal((await first).ok,true)
  assert.deepEqual(calls,['bootstrap','policy.read'])
  assert.equal(app.snapshot().home.unreadCount,0)
  assert.equal(app.snapshot().policy.policy.proactive_enabled,false)
  app.dispose()
  assert.equal((await app.refresh()).error,'disposed')
  assert.equal(typeof host.dispose,'undefined')
})

test('ordinary navigation reads only current panel and clears prior memory content',async()=>{
  const calls=[],id=randomUUID()
  const memory={cursor:1,id,source_id:`manual:${id}`,category:'preferences',content:'private memory',revision:1}
  const host={request(action){calls.push(action)
    const result={'bootstrap':home,'home':home,'policy.read':policy,'contact.controls':{policy,blocked_topics:[]},
      'memory.list':[memory],'inbox.list':[],'reminder.list':{items:[],next_before:null},
      'conversation.list':{items:[],snapshot:0,next_before:null}}[action]
    return Promise.resolve({ok:true,result})}}
  const app=createProductApplication({host})
  await app.initialize()
  assert.equal((await app.open({panel:'memory'})).ok,true)
  assert.equal(app.snapshot().memory.items[0].content,'private memory')
  assert.equal((await app.open({panel:'home'})).ok,true)
  assert.deepEqual(app.snapshot().memory.items,[])
  assert.equal(app.snapshot().home.profile.preferences.ai_name,'AI')
  for(const forbidden of ['contact.inspect','contact.tick','turn.begin','worker.run-next','runtime.recover'])
    assert.equal(calls.includes(forbidden),false)
  app.dispose()
})
