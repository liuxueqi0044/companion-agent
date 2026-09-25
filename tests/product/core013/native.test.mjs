import test from 'node:test'
import assert from 'node:assert/strict'
import policy from '../../../apps/desktop/native/policy.cjs'
import path from 'node:path'
import {setup,alternate,vueFile} from '../core011/helpers.mjs'
import {createInterfaceService} from '../../../apps/desktop/product/interface/service.mjs'
test('native surface policy accepts free dimensions but rejects hidden windows and extra capabilities',()=>{
  assert.deepEqual(policy.windowPatch({width:380,frame:false,transparent:true,opacity:0.8}),{width:380,frame:false,transparent:true,opacity:0.8})
  for(const patch of [null,[],{width:0},{height:100000},{opacity:0},{opacity:NaN},{alwaysOnTop:'true'},{url:'https://example.com'},{ignoreMouse:true},{x:-10000}])assert.throws(()=>policy.windowPatch(patch))
})
test('window authority requires a live, active, window-scoped mount, not preview or revoked code',async()=>{
 const x=await setup();let s
 try{
  s=await createInterfaceService({root:path.join(x.root,'interfaces'),runtime:x.runtime,vueFile})
  const active=(await s.mount()).mount;assert.ok((await s.call({mountId:active.id,action:'host.window'})).ok)
  const imported=await s.importSource({source:alternate(),expectedVersion:0})
  const preview=(await s.mount({revision:imported.result.revision,preview:true})).mount
  assert.equal((await s.call({mountId:preview.id,action:'host.window'})).error,'preview_read_only')
  await s.ready({mountId:preview.id});await s.activate({mountId:preview.id,expectedVersion:1,trustSource:true})
  await assert.rejects(s.call({mountId:active.id,action:'host.window'}),/interface_revoked/)
  const noScope=(await s.mount()).mount;assert.equal((await s.call({mountId:noScope.id,action:'host.window'})).error,'scope_denied')
 }finally{await s?.close();await x.close()}
})
test('native navigation, network and local origin restrictions are exact',()=>{
  const origin='http://127.0.0.1:51234'
  assert.ok(policy.localOrigin(origin));assert.ok(policy.navigationAllowed(origin+'/recover',origin))
  assert.ok(policy.navigationAllowed(origin+'/interface-frame/'+'a'.repeat(48),origin,{main:false}))
  for(const u of ['http://127.0.0.1:1','http://localhost:51234','https://example.com','file:///C:/data'])assert.equal(policy.requestAllowed(u,origin),false)
  for(const u of [origin+'/api/native',origin+'/?secret=a','https://example.com',origin+'/interface-frame/'+'a'.repeat(48)])assert.equal(policy.navigationAllowed(u,origin),false)
  assert.ok(policy.requestAllowed('blob:'+origin+'/id',origin));assert.ok(policy.requestAllowed(origin+'/sdk.mjs',origin))
})
