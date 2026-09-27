import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {pathToFileURL} from 'node:url'
import {acquireInstance} from '../../../apps/desktop/product/web/instance.mjs'
import {acquireProcessLock} from '../../../apps/desktop/product/process-lock.mjs'
import {createRequestLedger} from '../../../apps/desktop/product/providers/request-ledger.mjs'

const modules=path.resolve('apps/desktop/product')
function fresh(){fs.mkdirSync('.test-data',{recursive:true});return fs.mkdtempSync(path.resolve('.test-data/core020-lock-'))}
async function held(t,code){
  const child=spawn(process.execPath,['--input-type=module','-e',code+';console.log("ready");setInterval(()=>{},1000)'],{windowsHide:true,stdio:['ignore','pipe','pipe']})
  const closed=once(child,'close')
  t.after(async()=>{if(child.exitCode===null)child.kill('SIGKILL');await closed})
  await Promise.race([once(child.stdout,'data'),closed.then(()=>{throw Error('child exited before ready')})])
  return {child,kill:async()=>{child.kill('SIGKILL');await closed}}
}
for(const type of ['instance','ledger'])test(`OS releases ${type} lock when killed before record write`,async t=>{
  const root=fresh(),file=path.join(root,type+'.json')
  const processLock=pathToFileURL(path.join(modules,'process-lock.mjs')).href
  const child=await held(t,`import {acquireProcessLock} from ${JSON.stringify(processLock)};acquireProcessLock(${JSON.stringify(file+'.guard.sqlite')})`)
  assert.throws(()=>acquireProcessLock(file+'.guard.sqlite'),/process_locked/)
  await child.kill()
  if(type==='instance'){const release=acquireInstance(file,{recoverDead:true});release()}
  else {const ledger=createRequestLedger({file});assert.equal(ledger.recoverInterrupted().recovered,0);const id=ledger.reserve('turn');ledger.finish(id,{state:'received'})}
})
test('killed owner recovers instance and uncertain reserved request without replay',async t=>{
  const root=fresh(),file=path.join(root,'instance.json'),journal=path.join(root,'ledger.json')
  const child=await held(t,`import {acquireInstance} from ${JSON.stringify(pathToFileURL(path.join(modules,'web/instance.mjs')).href)};
    import {createRequestLedger} from ${JSON.stringify(pathToFileURL(path.join(modules,'providers/request-ledger.mjs')).href)};
    acquireInstance(${JSON.stringify(file)});createRequestLedger({file:${JSON.stringify(journal)}}).reserve('turn')`)
  assert.throws(()=>acquireInstance(file,{recoverDead:true}),/already_started/)
  const ledger=createRequestLedger({file:journal})
  assert.throws(()=>ledger.recoverInterrupted(),/request_in_progress/)
  await child.kill()
  const release=acquireInstance(file,{recoverDead:true});t.after(release)
  assert.equal(ledger.recoverInterrupted().recovered,1)
  assert.equal(JSON.parse(fs.readFileSync(journal)).attempts[0].error,'interrupted_outcome_unknown')
  assert.equal(ledger.snapshot().used,1)
  const id=ledger.reserve('turn');ledger.finish(id,{state:'received'});assert.equal(ledger.snapshot().used,2)
})
test('legacy known-dead startup gate is archived but unknown files are preserved',async t=>{
  const root=fresh(),file=path.join(root,'instance.json')
  const child=await held(t,'');await child.kill()
  fs.writeFileSync(file+'.startup-lock',JSON.stringify({pid:child.child.pid,owner:'legacy'}))
  acquireInstance(file,{recoverDead:true})()
  assert.ok(fs.readdirSync(root).some(n=>n.includes('startup-lock.interrupted-')))
  fs.writeFileSync(file+'.startup-lock','')
  assert.throws(()=>acquireInstance(file,{recoverDead:true}),/already_started/)
  assert.equal(fs.readFileSync(file+'.startup-lock','utf8'),'')
  const ledgerFile=path.join(root,'ledger.json');fs.writeFileSync(ledgerFile+'.lock','')
  assert.throws(()=>createRequestLedger({file:ledgerFile}).reserve('turn'),/ledger_locked/)
  assert.ok(fs.existsSync(ledgerFile+'.lock'))
})
test('corrupt state is not silently deleted and persistent sidecar is reusable',()=>{
  const root=fresh(),file=path.join(root,'instance.json')
  fs.writeFileSync(file,'broken')
  assert.throws(()=>acquireInstance(file,{recoverDead:true}),/instance_state_invalid/)
  assert.equal(fs.readFileSync(file,'utf8'),'broken')
  const guard=path.join(root,'reusable.sqlite'),release=acquireProcessLock(guard)
  assert.throws(()=>acquireProcessLock(guard),/process_locked/);release();release()
  acquireProcessLock(guard)();assert.ok(fs.existsSync(guard))
})
