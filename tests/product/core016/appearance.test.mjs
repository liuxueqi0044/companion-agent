import test from 'node:test'
import {availableStarterIds} from '../../../apps/desktop/personal-space/starter-config.mjs'
import assert from 'node:assert/strict'
import {createAppearanceStore} from '../../../apps/desktop/personal-space/appearance.mjs'
import {defaultSource,buildInterface,validateSource} from '../../../apps/desktop/product/interface/builder.mjs'
import {vueFile} from '../core011/helpers.mjs'

function stateStore(value={},revision=0){
  return {value,revision,writes:[],async read(){return {ok:true,result:{revision:this.revision,value:structuredClone(this.value)}}},async write(args){
    this.writes.push(structuredClone(args))
    if(args.expectedRevision!==this.revision)return {ok:false,error:'revision_conflict'}
    this.value=args.value;this.revision++;return {ok:true,result:{revision:this.revision}}
  }}
}
test('restores a valid selection; unknown future fields survive a view preference write',async()=>{
  const state=stateStore({starterTheme:'atelier',future:{x:7}},4),changes=[]
  const store=createAppearanceStore({state,onChange:v=>changes.push(v)})
  await store.initialize();assert.equal(store.theme,'atelier')
  await store.select('form');assert.deepEqual(state.value,{starterTheme:'form',future:{x:7}});assert.equal(state.revision,5)
  assert.deepEqual(changes,['atelier','form'])
})
test('a late read cannot replace a user selection made while hydration is pending',async()=>{
  let release;const held=new Promise(r=>release=r),state=stateStore({starterTheme:'atelier'})
  const read=state.read.bind(state);state.read=async()=>{await held;return read()}
  const store=createAppearanceStore({state});store.initialize();const selected=store.select('form')
  release();await selected;assert.equal(store.theme,'form');assert.equal(state.value.starterTheme,'form')
})
test('rapid selections are serialized and the final view persists',async()=>{
  const state=stateStore(),store=createAppearanceStore({state})
  await store.initialize();await Promise.all(['atelier','form','atelier'].map(id=>store.select(id)))
  assert.equal(store.theme,'atelier');assert.equal(state.value.starterTheme,'atelier')
  assert.deepEqual(state.writes.map(x=>x.expectedRevision),[0,1,2])
})
test('concurrent host state update is rebased once, retaining the other view fields',async()=>{
  const state=stateStore({starterTheme:'whale'}),store=createAppearanceStore({state})
  await store.initialize();state.value={starterTheme:'whale',newField:'external'};state.revision++
  await store.select('form');assert.deepEqual(state.value,{starterTheme:'form',newField:'external'})
  assert.equal(state.writes.length,2)
})
test('persistent write failure is visible and does not clear the selected local view',async()=>{
  const state=stateStore(),errors=[];state.write=async()=>({ok:false,error:'write_failed'})
  const store=createAppearanceStore({state,onError:e=>errors.push(e)});await store.initialize();await store.select('atelier')
  assert.equal(store.theme,'atelier');assert.deepEqual(errors,['write_failed'])
})
test('synthetic preview permits local theme exploration without privileged writes',async()=>{
  let writes=0;const store=createAppearanceStore({state:{read:async()=>({ok:false,error:'preview_read_only'}),write:async()=>{writes++;throw Error('unexpected')}}})
  await store.initialize();await store.select('atelier');assert.equal(store.theme,'atelier');assert.equal(writes,0)
  await assert.rejects(store.select('missing'),/invalid_starter/)
})
test('all available starter packages build within the unchanged security and size boundaries',async()=>{
  const hashes=new Set()
  for(const starter of availableStarterIds){
    const source=await defaultSource({starter,standalone:true});validateSource(source)
    assert.equal(source.id,`morrow.starter.${starter}`)
    assert.match(source.files['starter-config.mjs'],new RegExp(starter))
    const bundle=await buildInterface(source,{vueFile});hashes.add(bundle.hash)
    assert.ok(Buffer.byteLength(bundle.js)+Buffer.byteLength(bundle.css)<4*1024*1024)
    assert.doesNotMatch(bundle.js,/X-Personal-Space-Token|personal-space-session/)
  }
  assert.equal(hashes.size,availableStarterIds.length)
  await assert.rejects(defaultSource({starter:'untrusted'}),/interface_invalid_starter/)
})
