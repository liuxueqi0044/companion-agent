import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {setup,alternate,vueFile,input,decision,deferred} from './helpers.mjs'
import {buildInterface,defaultSource,frameDocument} from '../../../apps/desktop/product/interface/builder.mjs'
import {createInterfaceService} from '../../../apps/desktop/product/interface/service.mjs'

test('default interface and multi-module alternate build with the same SDK; no author code runs during build',async()=>{
  const a=await buildInterface(await defaultSource(),{vueFile}),source=alternate()
  source.files['main.mjs']+='\nglobalThis.__author_executed=true;'
  const b=await buildInterface(source,{vueFile})
  assert.equal(globalThis.__author_executed,undefined)
  assert.equal(a.dependencies.sdk,b.dependencies.sdk)
  assert.ok(a.js.includes('morrow.ui.ready'));assert.ok(b.js.includes('另一种界面'))
  assert.match(frameDocument(b,'fixture').csp,/connect-src 'none'/)
  assert.doesNotMatch(a.js,/personal-space-session|X-Personal-Space-Token|\/api\/command/)
})
test('bundler denies filesystem, external dependencies and source traversal; author config is not accepted',async()=>{
  for(const dependency of ['node:fs','https://example.com/code.js','../../secrets.mjs','unknown-package']){
    const source=alternate();source.files['main.mjs']=`import x from ${JSON.stringify(dependency)};console.log(x)`
    await assert.rejects(buildInterface(source,{vueFile}),/interface_(import_denied|build_failed)/)
  }
  const bad=alternate();bad.files['../escape.js']='';await assert.rejects(buildInterface(bad,{vueFile}),/interface_invalid_source/)
  const config=alternate();config.plugins=['run'];await assert.rejects(buildInterface(config,{vueFile}),/interface_invalid_source/)
})
test('preview cannot access real data; full-root activation revokes old views and preserves shared draft and task',async()=>{
  const entered=deferred(),held=deferred(),x=await setup({configured:true,respond(){entered.resolve();return held.promise}})
  let service
  try{
    service=await createInterfaceService({root:path.join(x.root,'interfaces'),runtime:x.runtime,vueFile})
    const old=(await service.mount()).mount
    const value={text:'未发送的文字\n第二行',conversationId:randomUUID(),attachment:{name:'draft.csv',text:'not yet sent'}}
    assert.equal((await service.call({mountId:old.id,action:'draft.write',args:{expectedRevision:0,value}})).ok,true)
    const i=input(),flight=service.call({mountId:old.id,action:'send',args:i});await entered.promise
    const imported=await service.importSource({source:alternate(),expectedVersion:0}),revision=imported.result.revision
    const preview=(await service.mount({revision,preview:true})).mount
    assert.equal((await service.call({mountId:preview.id,action:'turn.read',args:{turnId:i.command_id}})).error,'preview_read_only')
    assert.equal(service.snapshot({mountId:preview.id}).result.view.conversation,null)
    await assert.rejects(service.activate({mountId:preview.id,expectedVersion:1,trustSource:true}),/interface_preview_required/)
    await service.ready({mountId:preview.id})
    await assert.rejects(service.activate({mountId:preview.id,expectedVersion:1}),/interface_source_trust_required/)
    await service.activate({mountId:preview.id,expectedVersion:1,trustSource:true})
    await assert.rejects(service.call({mountId:old.id,action:'send',args:input()}),/interface_revoked/)
    assert.equal(x.runtime.snapshot().runtime.executionBusy,true)
    const active=(await service.mount()).mount
    assert.deepEqual((await service.call({mountId:active.id,action:'draft.read'})).result.value,value)
    held.resolve(decision);await flight;await x.runtime.whenIdle()
    const r=await service.call({mountId:active.id,action:'turn.read',args:{turnId:i.command_id}})
    assert.equal(r.result.actions[0].task.status,'completed')
    await service.restore({expectedVersion:2});const restored=(await service.mount()).mount
    assert.equal(restored.revision,service.summary().defaultHash)
    assert.deepEqual((await service.call({mountId:restored.id,action:'draft.read'})).result.value,value)
    const before=service.summary();await service.close()
    service=await createInterfaceService({root:path.join(x.root,'interfaces'),runtime:x.runtime,vueFile})
    assert.deepEqual(service.summary(),before)
    const reopened=(await service.mount()).mount
    assert.deepEqual((await service.call({mountId:reopened.id,action:'draft.read'})).result.value,value)
  }finally{held.resolve(decision);await service?.close();await x.close()}
})

test('stale draft revisions do not overwrite newer input; package state is namespaced and invalid draft rejected',async()=>{
  const x=await setup();let s
  try{
    s=await createInterfaceService({root:path.join(x.root,'interfaces'),runtime:x.runtime,vueFile})
    const a=(await s.mount()).mount,b=(await s.mount()).mount
    const write=(m,args)=>s.call({mountId:m.id,action:'draft.write',args})
    assert.equal((await write(a,{expectedRevision:0,value:{text:'new'}})).ok,true)
    assert.equal((await write(b,{expectedRevision:0,value:{text:'stale'}})).error,'revision_conflict')
    assert.equal((await write(b,{expectedRevision:1,value:{text:{attack:true}}})).error,'invalid_request')
    assert.equal((await s.call({mountId:b.id,action:'draft.read'})).result.value.text,'new')
    assert.equal((await s.call({mountId:a.id,action:'ui.state.write',args:{expectedRevision:0,value:{layout:'wide'}}})).ok,true)
    const imported=await s.importSource({source:alternate(),expectedVersion:0}),p=(await s.mount({revision:imported.result.revision,preview:true})).mount
    await s.ready({mountId:p.id});await s.activate({mountId:p.id,expectedVersion:1,trustSource:true})
    const c=(await s.mount()).mount
    assert.deepEqual((await s.call({mountId:c.id,action:'ui.state.read'})).result.value,{})
  }finally{await s?.close();await x.close()}
})

test('tampered immutable bundle is rejected while restore-default remains possible',async()=>{
  const x=await setup();let s
  try{
    s=await createInterfaceService({root:path.join(x.root,'interfaces'),runtime:x.runtime,vueFile})
    const r=await s.importSource({source:alternate(),expectedVersion:0}),hash=r.result.revision
    const file=path.join(x.root,'interfaces/revisions',hash+'.json'),artifact=JSON.parse(await fs.readFile(file,'utf8'))
    artifact.js+=';';await fs.writeFile(file,JSON.stringify(artifact))
    await assert.rejects(s.mount({revision:hash,preview:true}),/interface_integrity_error/)
    await s.restore({expectedVersion:1})
    assert.equal((await s.mount()).mount.revision,s.summary().defaultHash)
  }finally{await s?.close();await x.close()}
})
