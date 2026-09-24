import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {spawn} from 'node:child_process'
import {acquireInstance} from '../../../apps/desktop/product/web/instance.mjs'
import {createRequestLedger} from '../../../apps/desktop/product/providers/request-ledger.mjs'
test('dead ownership is archived, live owner is preserved, interrupted transport is not replayed',async()=>{
  const root=await fs.mkdtemp(path.resolve('.test-data/core012-recovery-'))
  const child=spawn(process.execPath,['-e','process.exit(0)'],{windowsHide:true});await new Promise(r=>child.once('close',r))
  const file=path.join(root,'instance.json');await fs.writeFile(file,JSON.stringify({pid:child.pid,owner:'old'}))
  const release=acquireInstance(file,{recoverDead:true})
  assert.throws(()=>acquireInstance(file,{recoverDead:true}),/already_started/)
  assert.equal((await fs.readdir(root)).filter(n=>n.includes('interrupted-')).length,1);release()
  const journalFile=path.join(root,'ledger.json'),ledger=createRequestLedger({file:journalFile}),id=ledger.reserve('turn')
  assert.throws(()=>ledger.recoverInterrupted(),/request_in_progress/)
  const record=JSON.parse(await fs.readFile(journalFile,'utf8'));record.attempts[0].owner_pid=child.pid;await fs.writeFile(journalFile,JSON.stringify(record))
  assert.equal(ledger.recoverInterrupted().recovered,1)
  const settled=JSON.parse(await fs.readFile(journalFile,'utf8')).attempts[0]
  assert.equal(settled.id,id);assert.equal(settled.error,'interrupted_outcome_unknown');assert.equal(ledger.snapshot().used,1)
})
