import test from 'node:test'
import assert from 'node:assert/strict'
import {defaultSource} from '../../../apps/desktop/product/interface/builder.mjs'
import {initialStarter,availableStarterIds} from '../../../apps/desktop/personal-space/starter-config.mjs'
test('published default is FORM and unavailable artwork cannot be exported',async()=>{
  assert.equal(initialStarter,'form');assert.deepEqual(availableStarterIds,['form','atelier'])
  await assert.rejects(defaultSource({starter:'whale'}),/interface_invalid_starter/)
  const source=await defaultSource()
  assert.ok(!Object.keys(source.files).some(p=>p.includes('characters/')||p==='whale-room.mjs'))
})
