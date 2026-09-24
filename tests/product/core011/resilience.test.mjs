import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {setup,alternate,vueFile,input} from './helpers.mjs'
import {createInterfaceService} from '../../../apps/desktop/product/interface/service.mjs'

test('reloading one browser client reclaims its old mount without exhausting slots',async()=>{
  const x=await setup();let s
  try{
    s=await createInterfaceService({root:path.join(x.root,'interfaces'),runtime:x.runtime,vueFile})
    const clientId=randomUUID();let prior
    for(let i=0;i<14;i++){
      const mounted=await s.mount({clientId});assert.equal(mounted.ok,true)
      if(prior)assert.throws(()=>s.snapshot({mountId:prior}),/interface_revoked/)
      prior=mounted.mount.id
    }
  }finally{await s?.close();await x.close()}
})
test('corrupt activation/draft records preserve their bytes and leave the default UI available',async()=>{
  const x=await setup();let s
  try{
    const root=path.join(x.root,'interfaces');await fs.mkdir(root)
    await fs.writeFile(path.join(root,'state.json'),'{broken')
    await fs.writeFile(path.join(root,'ui-state.json'),'{}')
    s=await createInterfaceService({root,runtime:x.runtime,vueFile})
    assert.equal(s.summary().error,'interface_state_invalid')
    const m=(await s.mount()).mount
    assert.equal(m.revision,s.summary().defaultHash)
    assert.equal((await s.call({mountId:m.id,action:'draft.read'})).error,'interface_draft_unavailable')
    assert.equal((await s.call({mountId:m.id,action:'conversation.list'})).ok,true)
    await assert.rejects(s.importSource({source:alternate(),expectedVersion:0}),/interface_state_invalid/)
    assert.equal(await fs.readFile(path.join(root,'state.json'),'utf8'),'{broken')
    assert.equal(await fs.readFile(path.join(root,'ui-state.json'),'utf8'),'{}')
  }finally{await s?.close();await x.close()}
})
test('closed service cannot mount again or revive old interface capabilities',async()=>{
  const x=await setup()
  try{
    const s=await createInterfaceService({root:path.join(x.root,'interfaces'),runtime:x.runtime,vueFile})
    const m=(await s.mount()).mount;await s.close()
    await assert.rejects(s.mount(),/disposed/)
    await assert.rejects(s.call({mountId:m.id,action:'send',args:input()}),/interface_revoked/)
    assert.equal(x.runtime.snapshot().runtime.closed,false)
  }finally{await x.close()}
})
test('resource arguments are captured before asynchronous dispatch',async()=>{
  const x=await setup()
  try{
    const i=input();await x.runtime.send(i)
    const args={turnId:i.command_id},read=x.runtime.resources.turn(args);args.turnId=randomUUID()
    assert.equal((await read).result.id,i.command_id)
  }finally{await x.close()}
})
