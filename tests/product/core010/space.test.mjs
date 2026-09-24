import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {createSpaceService,unavailableSpaceService} from '../../../apps/desktop/product/space/service.mjs'
import {validateSpaceFiles,buildCanvas} from '../../../apps/desktop/product/space/package.mjs'
import {createDeepSeekProviders} from '../../../apps/desktop/product/providers/deepseek.mjs'
import {createRequestLedger} from '../../../apps/desktop/product/providers/request-ledger.mjs'
import {observeCanvas} from '../../../apps/desktop/personal-space/canvas.mjs'

export const files={'view.html':'<main><h1>一盏灯，一个自己的空间</h1><button id="lamp">点亮灯</button><p id="light">静静等你</p></main>',
  'view.css':'body{background:#182a38;color:#eee;padding:35px;font-family:sans-serif}h1{font-size:24px}button{padding:12px;background:#e1bb84;border:0;border-radius:8px}',
  'view.js':"document.querySelector('#lamp').addEventListener('click',()=>{document.querySelector('#light').textContent='灯亮了'})"}
const output=()=>({summary:'一间可以亲手点亮灯的书房。',files:{...files}})
async function root(){await fs.mkdir('.test-data',{recursive:true});return fs.mkdtemp(path.resolve('.test-data/core-010-'))}
async function setup(options={}){const folder=await root();let calls=0
  const service=await createSpaceService({root:folder,provider:{generate:async()=>{calls++;return output()}},...options})
  return {service,folder,calls:()=>calls}}
async function candidate(s,baseRevision=null){const r=await s.generate({prompt:'A quiet study',expectedVersion:s.snapshot().version,baseRevision});assert.equal(r.ok,true);await s.whenIdle();assert.equal(s.snapshot().job.status,'ready');return s.snapshot().job.candidateId}
async function mount(s,revision){const r=await s.preview({revision});assert.equal(s.ready({mountId:r.mount.id,revision}).ok,true);return r.mount}
async function activate(s,revision){const m=await mount(s,revision);await s.activate({mountId:m.id,revision,expectedVersion:s.snapshot().version});return m}

test('classic source compilation checks syntax without executing code; document rules and resource limits',()=>{
  assert.equal(validateSpaceFiles(files),true)
  for(const bad of ['<!doctype html><html></html>','<script>alert(1)</script>','<button onclick="go()">A</button>'])
    assert.throws(()=>validateSpaceFiles({...files,'view.html':bad}),{code:'space_html_format'})
  assert.throws(()=>validateSpaceFiles({...files,'view.css':'body{background:url(https://example.test)}'}),{code:'space_external_resource'})
  assert.throws(()=>validateSpaceFiles({...files,'view.js':'import "anything"'}),{code:'space_js_syntax'})
  assert.throws(()=>validateSpaceFiles({...files,'view.js':'let x ='}),{code:'space_js_syntax'})
  assert.throws(()=>validateSpaceFiles({...files,'view.js':'</script>'}),{code:'embedded_closing_tag'})
  assert.equal(validateSpaceFiles({...files,'view.js':'globalThis.__sourceMustNotRun = true'}),true)
  assert.equal(globalThis.__sourceMustNotRun,undefined)
  const built=buildCanvas(files,'a'.repeat(32));assert.match(built.csp,/sandbox allow-scripts/);assert.doesNotMatch(built.csp,/allow-same-origin|unsafe-eval|script-src 'unsafe-inline'/)
  assert.match(built.csp,/connect-src 'none'/);assert.match(built.html,/morrow.canvas.ready/)
})
test('immutable generation -> preview -> explicit activation -> reload -> rollback preserves revision history',async()=>{
  const {service:s,folder,calls}=await setup()
  try{
    const a=await candidate(s);assert.equal(s.snapshot().active,null);assert.equal(calls(),1)
    await assert.rejects(s.activate({revision:a,mountId:'anything',expectedVersion:s.snapshot().version}),{code:'space_preview_required'})
    await activate(s,a)
    const b=await candidate(s,a),stale=s.snapshot().version-1
    await assert.rejects(s.activate({revision:b,mountId:'anything',expectedVersion:stale}),{code:'revision_conflict'})
    await activate(s,b);assert.equal(s.snapshot().active,b);await s.close()
    const reopened=await createSpaceService({root:folder})
    try{assert.equal(reopened.snapshot().active,b);await reopened.rollback({expectedVersion:reopened.snapshot().version});assert.equal(reopened.snapshot().active,a)
      await reopened.rollback({expectedVersion:reopened.snapshot().version});assert.equal(reopened.snapshot().active,null)
      assert.equal((await reopened.source({revision:a})).files['view.html'],files['view.html'])
      assert.equal((await reopened.source({revision:b})).manifest.base_revision,a)
    }finally{await reopened.close()}
  }finally{await s.close()}
})
test('active source tamper blocks reload/activation; original recovery needs no damaged package read',async()=>{
  const {service:s,folder}=await setup()
  try{const revision=await candidate(s),m=await activate(s,revision)
    await fs.appendFile(path.join(folder,'revisions',revision,'view.js'),'\n// tampered')
    await assert.rejects(s.preview({revision}));await assert.rejects(s.activate({revision,mountId:m.id,expectedVersion:s.snapshot().version}))
    assert.equal(s.snapshot().active,revision)
    await s.rollback({expectedVersion:s.snapshot().version,original:true});assert.equal(s.snapshot().active,null)
  }finally{await s.close()}
})
test('cancelled late provider result cannot become the current candidate or activate; duplicate start denied',async()=>{
  let release;const wait=new Promise(r=>{release=r})
  const {service:s}=await setup({provider:{generate:async()=>{await wait;return output()}}})
  try{const job=await s.generate({prompt:'test',expectedVersion:0})
    await assert.rejects(s.generate({prompt:'again',expectedVersion:s.snapshot().version}),{code:'runner_busy'})
    assert.equal(s.cancel({jobId:'stale'}).ok,false);assert.equal(s.cancel({jobId:job.jobId}).ok,true)
    release();await s.whenIdle();assert.equal(s.snapshot().job.status,'cancelled');assert.equal(s.snapshot().candidates.length,0);assert.equal(s.snapshot().active,null)
  }finally{release();await s.close()}
})
test('failed generation preserves existing active package and runtime reservation denies a start',async()=>{
  let bad=false,runtimeBusy=false
  const {service:s}=await setup({provider:{generate:async()=>{if(bad)throw Object.assign(Error('bad'),{code:'provider_timeout'});return output()}},isRuntimeBusy:()=>runtimeBusy})
  try{const revision=await candidate(s);await activate(s,revision);bad=true
    await s.generate({prompt:'more',expectedVersion:s.snapshot().version,baseRevision:revision});await s.whenIdle()
    assert.equal(s.snapshot().active,revision);assert.equal(s.snapshot().job.error,'provider_timeout')
    runtimeBusy=true;await assert.rejects(s.generate({prompt:'more',expectedVersion:s.snapshot().version}),{code:'runner_busy'})
  }finally{await s.close()}
})
test('service restart classifies an unfinished generation without resending, and rejects corrupt activation pointers',async()=>{
  const folder=await root(),state={format:'personal-canvas/1',version:2,active:null,history:[],candidates:[],job:{id:'a'.repeat(8)+'-aaaa-aaaa-aaaa-'+'a'.repeat(12),status:'generating',error:null,candidateId:null}}
  await fs.writeFile(path.join(folder,'state.json'),JSON.stringify(state));let calls=0
  const s=await createSpaceService({root:folder,provider:{generate:()=>{calls++;throw Error('must not run')}}})
  assert.equal(s.snapshot().job.status,'interrupted');assert.equal(calls,0);await s.close()
  state.active='unknown';await fs.writeFile(path.join(folder,'state.json'),JSON.stringify(state))
  await assert.rejects(createSpaceService({root:folder}),{code:'space_state_invalid'})
})
test('preview tickets expire and cannot authorize another revision',async()=>{
  let clock=0;const {service:s}=await setup({now:()=>clock})
  try{const a=await candidate(s),b=await candidate(s),m=await mount(s,a)
    await assert.rejects(s.activate({mountId:m.id,revision:b,expectedVersion:s.snapshot().version}),{code:'space_preview_required'})
    clock=16*60*1000;assert.equal(s.document(m.url.split('/').at(-1)),null)
    await assert.rejects(s.activate({mountId:m.id,revision:a,expectedVersion:s.snapshot().version}),{code:'space_preview_required'})
  }finally{await s.close()}
})
test('all provider types share the durable request journal; customization transmits only explicit author context',async()=>{
  const folder=await root(),ledger=createRequestLedger({file:path.join(folder,'ledger.json')});let release,entered
  const gate=new Promise(r=>{release=r}),ready=new Promise(r=>{entered=r});let request,calls=0
  const p=createDeepSeekProviders({apiKey:'test-secret',ledger,fetchImpl:async(url,init)=>{
    calls++;request=JSON.parse(init.body);entered();await gate
    return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output())}}],usage:{total_tokens:12}}))
  }})
  const flight=p.space.generate({request:'A study',current_files:null});await ready
  await assert.rejects(p.turn.respond({}),{code:'provider_busy'});assert.equal(calls,1)
  assert.equal(request.max_tokens,8192);assert.equal(request.stream,false)
  assert.deepEqual(JSON.parse(request.messages[1].content).context,{request:'A study',current_files:null})
  release();assert.deepEqual(await flight,output());assert.deepEqual(ledger.snapshot(),{used:1,inFlight:false})
  const reopened=createRequestLedger({file:path.join(folder,'ledger.json')});assert.equal(reopened.snapshot().used,1)
})
test('frame messages must match source, opaque origin, binding and exact shape; second navigation revokes liveness',()=>{
  const w=new EventTarget(),frame=new EventTarget();frame.contentWindow={};const states=[]
  const o=observeCanvas({frame,mount:{id:'bound'},eventTarget:w,onStatus:s=>states.push(s)})
  const msg=(data,source=frame.contentWindow,origin='null')=>{const e=new Event('message');Object.assign(e,{data,source,origin});w.dispatchEvent(e)}
  const ready={type:'morrow.canvas.ready',mountId:'bound'}
  msg(ready,{});msg(ready,frame.contentWindow,'https://example.test');msg({...ready,mountId:'stale'});msg({...ready,command:'send'});assert.deepEqual(states,['loading'])
  msg(ready);assert.deepEqual(states,['loading','ready']);msg(ready);assert.equal(states.length,2)
  frame.dispatchEvent(new Event('load'));frame.dispatchEvent(new Event('load'));assert.equal(states.at(-1),'failed')
  msg(ready);assert.equal(states.at(-1),'failed');o.dispose()
})
test('corrupt-store fallback preserves a usable original interface and refuses customization writes',async()=>{
  const s=unavailableSpaceService()
  assert.equal(s.snapshot().active,null);assert.equal(s.snapshot().busy,false);assert.equal(s.snapshot().error,'space_state_invalid')
  assert.equal(s.generate({}).error,'space_state_invalid');assert.equal(s.activate({}).error,'space_state_invalid')
  assert.equal(s.document('x'),null);await s.close()
})
