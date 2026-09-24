import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID as uuid} from 'node:crypto'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createProductHost} from '../../../apps/desktop/product/host.mjs'
import {createPolicyController} from '../../../apps/desktop/product/application/policy.mjs'
import {createMemoryController} from '../../../apps/desktop/product/application/memory.mjs'
import {createInboxController} from '../../../apps/desktop/product/application/inbox.mjs'
import {createReminderController} from '../../../apps/desktop/product/application/reminders.mjs'
import {createResultController} from '../../../apps/desktop/product/application/results.mjs'
import {createProductApplication} from '../../../apps/desktop/product/application/index.mjs'
import {projectActivity} from '../../../apps/desktop/product/application/activity.mjs'

const good = result => ({ok:true,result})
const bad = code => ({ok:false,error:{code}})
const defer = () => {let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}}
const flush = async () => {for(let i=0;i<8;i++)await Promise.resolve()}
const policy = {revision:1,memory_enabled:true,memory_categories:['work','preferences','goals'],
  proactive_enabled:false,timezone:'UTC',start_minute:540,end_minute:1260,daily_limit:1,
  daily_evaluation_limit:3,topics:['work','daily','wellbeing'],paused_until:null}
const policyStub = () => ({markStale(){},refresh:async()=>good(policy),snapshot:()=>({policy,stale:false})})
const due = '2030-01-01T00:00:00+00:00'
const reminder = (text='A',cursor=1) => ({cursor,id:uuid(),text,due_at:due,state:'pending',revision:1})
const memory = (cursor=1) => ({cursor,id:uuid(),source_id:'manual:test',content:'memory',category:'preferences',revision:1})
const inboxItem = (cursor=1) => ({cursor,id:uuid(),kind:'task',text:'done',source_id:uuid(),reference_id:uuid(),created_at:due,read:0})
const sampleTurn = () => {
  const tid=uuid(),aid=uuid()
  return {id:uuid(),conversation_id:uuid(),text:'audit',state:'actions_recorded',reply:'done',
    provider_summary:null,actions:[{id:uuid(),kind:'csv.audit',state:'accepted',task:{task_id:tid,
      current_attempt_id:aid,status:'completed',attempt_count:1,input_hash:'PRIVATE_SENTINEL',
      requirements_interpretation:'not_run'},events:{task_id:tid,items:[],next_after_seq:null}}]}
}
const pageFor = (turn,rows=[],next=null) => ({task_id:turn.actions[0].task.task_id,
  attempt_id:turn.actions[0].task.current_attempt_id,status:'completed',metadata:{total:'6'},
  rows,next_offset:next,issues:[],next_issue_offset:null})
const home = () => ({profile:{profile_id:uuid(),revision:1,preferences:{ai_name:'AI',address_user_as:'friend'}},
  policy,unread_count:0,experience_revision:1,model_status:'not_configured',runtime:'local_device',native_isolation:'not_run'})

test('reminder conflict for A never selects A after user selected B',async()=>{
  const a=reminder('A',2),b=reminder('B',1),write=defer()
  const c=createReminderController({host:{request(action,p){
    if(action==='reminder.list')return good({items:[a,b],next_before:null})
    if(action==='reminder.read')return good(p.id===a.id?a:b)
    return write.promise
  }}})
  await c.refresh();await c.select({id:a.id})
  const updating=c.update({text:'new A',due_at:due});await flush()
  await c.select({id:b.id});write.resolve(bad('revision_conflict'))
  assert.equal((await updating).error,'revision_conflict')
  assert.equal(c.snapshot().selectedId,b.id)
  assert.equal(c.snapshot().selected.text,'B');c.dispose()
})

test('new reminder refresh supersedes an older selection read and clears selecting',async()=>{
  const a=reminder(),held=defer();let lists=0
  const c=createReminderController({host:{request(action){
    if(action==='reminder.list')return good({items:[{...a,revision:++lists}],next_before:null})
    return held.promise
  }}})
  await c.refresh();const selecting=c.select({id:a.id});await c.refresh()
  held.resolve(good(a));assert.equal((await selecting).error,'stale_view')
  assert.equal(c.snapshot().selected.revision,2);assert.equal(c.snapshot().selecting,false);c.dispose()
})

for(const kind of ['memory','inbox','reminders','results'])test(`${kind} page single flight is installed before subscriber reentry`,async()=>{
  const held=defer();let calls=0,reply,nested,entered=false
  const host={request(){calls++;return calls===1?good(reply):held.promise}}
  let c,first,again
  if(kind==='memory'){
    reply=Array.from({length:50},(_,i)=>memory(100-i));c=createMemoryController({host,policy:policyStub()});await c.refresh()
    again=()=>c.loadMore();reply=[]
  }else if(kind==='inbox'){
    reply=Array.from({length:50},(_,i)=>inboxItem(i+1));c=createInboxController({host});await c.refresh()
    again=()=>c.loadMore();reply=[]
  }else if(kind==='reminders'){
    reply={items:[reminder('A',2)],next_before:2};c=createReminderController({host});await c.refresh()
    again=()=>c.loadMore();reply={items:[],next_before:null}
  }else{
    const turn=sampleTurn();reply=pageFor(turn,[{record_index:1,cells:{},source_refs:{}}],1)
    c=createResultController({host});await c.open({turn,taskId:turn.actions[0].task.task_id})
    again=()=>c.loadMoreRows();reply=pageFor(turn,[{record_index:2,cells:{},source_refs:{}}])
  }
  c.subscribe(s=>{if((s.loadingMore||s.loadingRows)&&!entered){entered=true;nested=again()}})
  first=again();await flush();held.resolve(good(reply));await Promise.all([first,nested])
  assert.equal(calls,2);assert.strictEqual(first,nested);c.dispose()
})

for(const kind of ['policy','memory','inbox','reminders','results'])test(`${kind} dispose during read notification prevents unsent I/O`,async()=>{
  let calls=0;const host={request(){calls++;return good([])}}
  let c,run
  if(kind==='policy'){c=createPolicyController({host});run=()=>c.refresh()}
  if(kind==='memory'){c=createMemoryController({host,policy:policyStub()});run=()=>c.refresh()}
  if(kind==='inbox'){c=createInboxController({host});run=()=>c.refresh()}
  if(kind==='reminders'){c=createReminderController({host});run=()=>c.refresh()}
  if(kind==='results'){c=createResultController({host});const t=sampleTurn();run=()=>c.open({turn:t,taskId:t.actions[0].task.task_id})}
  c.subscribe(s=>{if(s.loading)c.dispose()});await run();assert.equal(calls,0)
})

test('unexpected memory backend error remains uncertain and cannot duplicate add',async()=>{
  let calls=0
  const c=createMemoryController({host:{request(){calls++;return bad('internal_error')}},policy:policyStub()})
  await c.add({content:'A'});assert.equal(c.snapshot().unknown?.phase,'unknown')
  assert.equal((await c.add({content:'A'})).error,'reconciliation_required');assert.equal(calls,1);c.dispose()
})

test('memory write result removes unexpected internal fields',async()=>{
  const c=createMemoryController({host:{request(){return good({id:uuid(),revision:1,ticket:'PRIVATE_SENTINEL'})}},policy:policyStub()})
  const reply=await c.add({content:'A'});assert.equal(reply.ok,true)
  assert.equal(JSON.stringify(reply).includes('PRIVATE_SENTINEL'),false);c.dispose()
})

test('ordinary conversation snapshots and command returns omit raw internal task fields',async()=>{
  const t=sampleTurn(),h=home()
  const app=createProductApplication({host:{request(action){return good(action==='bootstrap'?h:action==='policy.read'?policy:t)}}})
  await app.initialize();const reply=await app.open({panel:'conversation',turnId:t.id})
  assert.equal(reply.ok,true)
  for(const value of [app.snapshot(),app.conversation.snapshot(),reply,await app.refresh()])
    assert.equal(JSON.stringify(value).includes('PRIVATE_SENTINEL'),false)
  app.dispose()
})

test('historical cancellation does not mark a newer running attempt cancelled',()=>{
  const t=sampleTurn(),action=t.actions[0];action.task.status='running'
  action.events.items=[{task_id:action.task.task_id,attempt_id:uuid(),seq:1,
    kind:'cancel_requested',status:'cancelling'}]
  assert.equal(projectActivity({turn:t}).cancelRequested,false)
})

test('completed CSV cannot claim entire work completed while another action failed',()=>{
  const t=sampleTurn();t.actions.push({id:uuid(),kind:'profile.change',state:'failed',error:'revision_conflict'})
  const shown=projectActivity({turn:t});assert.equal(shown.taskStatus,'completed')
  assert.equal(shown.displayState,'failed')
})

test('activity errors are sanitized independently of reply text',()=>{
  const t=sampleTurn();t.actions.push({id:uuid(),kind:'profile.change',state:'failed',error:'Error at C:/private/path'})
  assert.equal(JSON.stringify(projectActivity({turn:t})).includes('C:/private'),false)
})

test('replayed reminder revision receipt cannot downgrade a newer observed reminder',async()=>{
  const a=reminder(),newer={...a,text:'external newer',revision:3};let lost=false,advanced=false
  const c=createReminderController({host:{request(action){
    if(action==='reminder.list')return good({items:[advanced?newer:a],next_before:null})
    if(action==='reminder.read')return good(advanced?newer:a)
    if(!lost){lost=true;return bad('outcome_unknown')}
    return good({...a,text:'my edit',revision:2})
  }}})
  await c.refresh();await c.select({id:a.id});await c.update({text:'my edit',due_at:due})
  advanced=true;await c.refresh();assert.equal(c.snapshot().selected.revision,3)
  assert.equal((await c.replayPending()).ok,true)
  assert.equal(c.snapshot().selected.revision,3)
  assert.equal(c.snapshot().items[0].text,'external newer');c.dispose()
})

test('replayed create accepts the current reminder returned after a later edit',async()=>{
  let lost=false,id
  const c=createReminderController({host:{request(action,p){
    id=p.command_id
    if(!lost){lost=true;return bad('outcome_unknown')}
    return good({id,text:'later edit',due_at:due,state:'cancelled',revision:3})
  }}})
  await c.create({text:'original',due_at:due})
  assert.equal((await c.replayPending()).ok,true)
  assert.equal(c.snapshot().pending,null);assert.equal(c.snapshot().items[0].revision,3);c.dispose()
})

test('real reminder replays respect current row versus persisted command receipt',async()=>{
  const root=path.resolve(fileURLToPath(new URL('../../..',import.meta.url)))
  const parent=path.join(root,'.test-data');await fs.mkdir(parent,{recursive:true})
  const host=createProductHost({workspace:root,python:path.join(root,'../companion-agent/.venv/Scripts/python.exe'),
    dataRoot:await fs.mkdtemp(path.join(parent,'core-003-architect-reminder-'))})
  const ok=async(action,payload={})=>{const r=await host.request(action,payload);assert.equal(r.ok,true,JSON.stringify(r));return r.result}
  let dropCreate=true,dropRevision=true,id
  const c=createReminderController({host:{async request(action,payload){
    const reply=await host.request(action,payload)
    if(reply.ok && action==='reminder.create' && dropCreate){dropCreate=false;id=reply.result.id;return bad('outcome_unknown')}
    if(reply.ok && action==='reminder.revise' && dropRevision){dropRevision=false;return bad('outcome_unknown')}
    return reply
  }}})
  try{
    await ok('bootstrap');await c.create({text:'original',due_at:due})
    await ok('reminder.revise',{id,command_id:uuid(),expected_revision:1,operation:'update',text:'external 2',due_at:due})
    assert.equal((await c.replayPending()).result.revision,2)
    await c.refresh();await c.select({id})
    assert.equal((await c.update({text:'my 3',due_at:due})).error,'outcome_unknown')
    await ok('reminder.revise',{id,command_id:uuid(),expected_revision:3,operation:'update',text:'external 4',due_at:due})
    await c.refresh();const replay=await c.replayPending()
    assert.equal(replay.result.revision,3) // This is the command's original receipt.
    assert.equal(c.snapshot().selected.revision,4) // Current observation must not regress.
    assert.equal(c.snapshot().selected.text,'external 4')
    assert.equal((await ok('reminder.list')).items.length,1)
  }finally{c.dispose();await host.dispose()}
})

test('home refresh adopts externally changed policy instead of showing cached switches',async()=>{
  const h=home(),newPolicy={...policy,revision:2,memory_enabled:false};let changed=false
  const app=createProductApplication({host:{request(action){
    if(action==='bootstrap')return good(h)
    if(action==='policy.read')return good(changed?newPolicy:policy)
    if(action==='home')return good({...h,policy:newPolicy})
  }}})
  await app.initialize();changed=true;await app.refresh()
  assert.equal(app.snapshot().home.policy.memory_enabled,false)
  assert.equal(app.snapshot().policy.policy.revision,2);app.dispose()
})

test('navigation away supersedes pending home status and never starts hidden refresh follow-up',async()=>{
  const h=home(),held=defer();let homes=0
  const app=createProductApplication({host:{request(action){
    if(action==='bootstrap')return good(h)
    if(action==='policy.read')return good(policy)
    if(action==='home'){homes++;return good(h)}
    if(action==='inbox.list')return held.promise
    if(action==='memory.list')return good([])
  }}})
  await app.initialize();const old=app.open({panel:'inbox'});await app.open({panel:'memory'})
  held.resolve(good([]));assert.equal((await old).error,'stale_view')
  assert.equal(homes,0);assert.equal(app.snapshot().panel,'memory');app.dispose()
})
