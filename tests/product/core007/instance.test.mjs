import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {acquireInstance} from '../../../apps/desktop/product/web/instance.mjs'

test('instance lock prevents duplicate startup and releases only its own record',async()=>{
  await fs.mkdir('.test-data',{recursive:true})
  const root=await fs.mkdtemp(path.resolve('.test-data/core-007-instance-')),file=path.join(root,'instance.json')
  const release=acquireInstance(file)
  assert.throws(()=>acquireInstance(file),/already_started/)
  release();release();const again=acquireInstance(file)
  await fs.writeFile(file,'another owner');again()
  assert.equal(await fs.readFile(file,'utf8'),'another owner')
})
