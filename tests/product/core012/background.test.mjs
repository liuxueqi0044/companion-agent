import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {createBackgroundService} from '../../../apps/desktop/product/background.mjs'
const fresh=()=>fs.mkdtemp(path.resolve('.test-data/core012-background-'))
function setup(){let calls=0,busy=false,release=null,rows=[]
  return {get calls(){return calls},rows,hold(){busy=true},release(){busy=false;release?.()},
    host:{async request(action,args){return {ok:true,result:action==='inbox.latest'?{cursor:rows.at(-1)?.cursor??0}:rows.filter(r=>r.cursor>args.after)}}},
    runtime:{snapshot:()=>({runtime:{executionBusy:false}}),async pulseContact(){calls++;if(busy)await new Promise(r=>{release=r});return {ok:true}},async stopContact(){busy=false;release?.()}}}
}
test('scheduler single flight, durable cursor, generic notifications and restart deduplication',async()=>{
  const root=await fresh(),s=setup(),notices=[]
  s.rows.push({cursor:1,text:'old private content',read:false})
  const b=await createBackgroundService({...s,root,notify:async x=>{notices.push(x)}})
  s.rows.push({cursor:2,text:'new private content',read:false})
  s.hold();const p=b.tick();assert.equal(b.tick(),p);await new Promise(r=>setTimeout(r,10));assert.equal(s.calls,1)
  s.release();await p
  assert.equal(notices.length,1);assert.equal(notices[0].count,1);assert.equal(JSON.stringify(notices).includes('private'),false)
  await b.close()
  const reopened=await createBackgroundService({...s,root,notify:async x=>notices.push(x)})
  await reopened.tick();assert.equal(notices.length,1)
  await reopened.configure({paused:true});const n=s.calls;await reopened.tick();assert.equal(s.calls,n)
  await reopened.close()
})
test('close interrupts only owned contact and waits for settlement',async()=>{
  const root=await fresh(),s=setup();s.hold()
  const b=await createBackgroundService({...s,root}),p=b.tick()
  await new Promise(r=>setTimeout(r,10));await b.close();await p
  assert.equal((await b.tick()).error,'closed')
})
test('busy foreground skips contact; corrupted cursor is preserved',async()=>{
  const root=await fresh(),s=setup();s.runtime.snapshot=()=>({runtime:{executionBusy:true}})
  const b=await createBackgroundService({...s,root});assert.equal((await b.tick()).skipped,true);assert.equal(s.calls,0);await b.close()
  const file=path.join(root,'background.json');await fs.writeFile(file,'{broken')
  await assert.rejects(createBackgroundService({...s,root}),/state_invalid/);assert.equal(await fs.readFile(file,'utf8'),'{broken')
})
