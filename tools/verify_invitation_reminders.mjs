/** Actual local reminder/wake path against an explicitly isolated offline desktop. */
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
const [homeArg,reportArg]=process.argv.slice(2)
if(!homeArg||!reportArg||process.argv.length!==4)throw Error('home_and_report_required')
const home=path.resolve(homeArg),reportFile=path.resolve(reportArg)
if(!home.startsWith(path.resolve('.test-data')+path.sep))throw Error('test_home_required')
const state=JSON.parse(await fs.readFile(path.join(home,'personal-space-server.json'),'utf8'));assert.equal(state.live,false)
const token=(await(await fetch(state.url)).text()).match(/name="personal-space-session" content="([^"]+)"/)[1]
const command=async(action,args={})=>{
  const r=await(await fetch(state.url+'/api/command',{method:'POST',headers:{Origin:state.url,'Content-Type':'application/json','X-Personal-Space-Token':token},body:JSON.stringify({action,args})})).json()
  assert.equal(r.reply?.ok,true,JSON.stringify(r.reply));return r.reply
}
const native=async(action,args={})=>{
  const r=await(await fetch(state.url+'/api/native',{method:'POST',headers:{'Content-Type':'application/json','X-Morrow-Native':state.nativeToken},body:JSON.stringify({action,args})})).json()
  assert.equal(r.ok,true,JSON.stringify(r));return r
}
const mountId=(await command('interface.mount')).mount.id
const call=async(action,args={})=>command('interface.call',{mountId,action,args})
const report={checks:[],modelRequests:0,physicalSleep:false,passed:false}
try{
  await native('background.configure',{paused:true})
  await call('reminders.create',{text:'邀请版离线提醒验证',due_at:new Date(Date.now()+3000).toISOString()})
  await new Promise(r=>setTimeout(r,3500))
  assert.equal((await native('background.tick')).skipped,true)
  report.checks.push({name:'paused_due_reminder_is_not_delivered',passed:true})
  await native('background.configure',{paused:false})
  await Promise.all([native('background.tick'),native('background.tick')])
  await native('background.tick')
  await call('open',{panel:'inbox'})
  const snapshot=(await command('interface.snapshot',{mountId})).result
  const rows=snapshot.view.inbox.items
  assert.equal(rows.filter(r=>r.text==='邀请版离线提醒验证').length,1)
  const notice=JSON.parse(await fs.readFile(path.join(home,'notification.json'),'utf8'))
  assert.equal(notice.sequence,1);assert.equal(notice.count,1)
  report.checks.push({name:'concurrent_and_repeated_wake_delivers_once',passed:true,inboxCount:rows.length,sequence:notice.sequence})
  report.passed=true
}catch(e){report.error=String(e.message);process.exitCode=1}
finally{
  await command('interface.unmount',{mountId})
  await fs.writeFile(reportFile,JSON.stringify(report,null,2),{flag:'wx'})
  console.log(JSON.stringify(report))
}
