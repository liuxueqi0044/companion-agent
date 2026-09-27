import {resolveRuntime} from '../../../apps/desktop/product/runtime-paths.mjs'
import test from 'node:test'
import {availableStarterIds} from '../../../apps/desktop/personal-space/starter-config.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import support from '../../../apps/desktop/native/support.cjs'
import {createNotificationConsumer} from '../../../apps/desktop/native/notifications.mjs'
import {writeJSON} from '../../../apps/desktop/product/storage.mjs'
import {defaultSource,buildInterface} from '../../../apps/desktop/product/interface/builder.mjs'

test('support export copies only explicit non-private fields, including hostile nested values',()=>{
  const secret='PRIVATE_SENTINEL_api_key_and_conversation',payload={secret,path:secret,apiKey:secret,conversation:secret}
  const r=support.diagnosticReport({release:{...payload,version:secret,channel:secret},versions:{node:secret,electron:'44.4.4'},
    status:{...payload,reachable:true,connection:{...payload,configured:true,lastError:secret,provider:secret,requests:[payload]},background:{...payload,lastError:secret}},notification:{phase:secret,...payload}})
  assert.equal(JSON.stringify(r).includes(secret),false)
  assert.equal(r.service.reachable,true);assert.equal(r.model.configured,true);assert.equal(r.model.last_error,'other_error');assert.equal(r.runtime.electron,'44.4.4')
})
const fresh=()=>fs.mkdtemp(path.resolve('.test-data/core019-notice-'))
test('pending notification survives restart but is consumed once, with no private payload',async()=>{
  const root=await fresh();let calls=0
  await writeJSON(path.join(root,'notification.json'),{sequence:1,count:1,text:'private'})
  const options={root,supported:()=>true,show:async(...args)=>{assert.deepEqual(args,[]);calls++}}
  let c=await createNotificationConsumer(options);await Promise.all([c.poll(),c.poll()]);await c.close()
  assert.equal(calls,1);c=await createNotificationConsumer(options);await c.poll();assert.equal(calls,1)
  await writeJSON(path.join(root,'notification.json'),{sequence:2,count:1});await c.poll();assert.equal(calls,2);await c.close()
})
test('failed OS submission is not replayed, and the persisted inbox notice is not erased',async()=>{
  const root=await fresh();let calls=0;const notice={sequence:1,count:1}
  await writeJSON(path.join(root,'notification.json'),notice)
  let c=await createNotificationConsumer({root,supported:()=>true,show:()=>{calls++;throw Error('OS failure')}})
  await c.poll();assert.equal(c.snapshot().phase,'failed');await c.close()
  c=await createNotificationConsumer({root,supported:()=>true,show:()=>{calls++}});await c.poll();await c.close()
  assert.equal(calls,1);assert.deepEqual(JSON.parse(await fs.readFile(path.join(root,'notification.json'))),notice)
})
test('invalid cursor is retained, unsupported and read-only notices do not invoke OS',async()=>{
  const root=await fresh();let calls=0
  await writeJSON(path.join(root,'notification.json'),{sequence:1,count:1})
  const c=await createNotificationConsumer({root,supported:()=>false,show:()=>{calls++}});await c.poll();assert.equal(c.snapshot().phase,'unsupported')
  await writeJSON(path.join(root,'notification.json'),{sequence:2,count:0});await c.poll();await c.close();assert.equal(calls,0)
  await fs.writeFile(path.join(root,'desktop-notifications.json'),'{broken')
  await assert.rejects(createNotificationConsumer({root}),/state_invalid/)
  assert.equal(await fs.readFile(path.join(root,'desktop-notifications.json'),'utf8'),'{broken')
})
test('published source builds both available starters without character files',async()=>{
  for(const starter of availableStarterIds){
    const source=await defaultSource({starter});assert.equal(Object.keys(source.files).some(p=>p.includes('characters/')||p==='whale-room.mjs'),false);assert.ok(!JSON.stringify(source).includes('data:image/png;base64,'))
    const result=await buildInterface(source,{vueFile:resolveRuntime('vue')})
    assert.ok(result.js.includes('morrow.ui.ready'))
  }
})
