import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {createProductHost} from '../../../apps/desktop/product/host.mjs'
const pause=ms=>new Promise(r=>setTimeout(r,ms))

test('independent service cold start, native auth, pause, clean quit and persistent restart',async()=>{
  const root=await fs.mkdtemp(path.resolve('.test-data/core012-desktop-'))
  const host=createProductHost({python:path.resolve('../companion-agent/.venv/Scripts/python.exe'),workspace:process.cwd(),dataRoot:path.join(root,'personal-space')})
  async function boot(){
    const child=spawn(process.execPath,['tools/personal_space.mjs'],{cwd:process.cwd(),windowsHide:true,env:{...process.env,PERSONAL_AI_HOME:root,PERSONAL_AI_PORT:'0'},stdio:['ignore','pipe','pipe']})
    let stderr='';child.stderr.on('data',d=>{stderr+=d});child.stdout.resume()
    const closed=new Promise(resolve=>child.once('close',resolve))
    try{for(let i=0;i<150;i++){
      if(child.exitCode!==null)throw Error('startup: '+stderr)
      try{const state=JSON.parse(await fs.readFile(path.join(root,'personal-space-server.json'),'utf8'));if(state.pid===child.pid)return {child,closed,state}}
      catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e}
      await pause(100)
    }}catch(e){child.kill();await closed;throw e}
    child.kill();await closed;throw Error('startup_timeout')
  }
  let run
  const call=async(action,args={})=>(await fetch(run.state.url+'/api/native',{method:'POST',headers:{'X-Morrow-Native':run.state.nativeToken,'Content-Type':'application/json'},body:JSON.stringify({action,args})})).json()
  try{
    run=await boot();assert.equal((await call('status')).ok,true)
    const forbidden=await fetch(run.state.url+'/api/native',{method:'POST',headers:{Origin:run.state.url,'X-Morrow-Native':run.state.nativeToken},body:'{}'})
    assert.equal(forbidden.status,403)
    const unauthorized=await fetch(run.state.url+'/api/native',{method:'POST',body:'{}'});assert.equal(unauthorized.status,403)
    const html=await (await fetch(run.state.url)).text();assert.equal(html.includes(run.state.nativeToken),false)
    let changed
    for(let i=0;i<30;i++){changed=await call('background.configure',{paused:true});if(changed.ok)break;await pause(100)}
    assert.equal(changed.ok,true)
    const reminder=await host.request('reminder.create',{command_id:randomUUID(),text:'Fixture reminder',due_at:new Date(Date.now()+3600000).toISOString()})
    assert.equal(reminder.ok,true)
    assert.equal((await call('quit')).ok,true);assert.equal(await run.closed,0)
    run=await boot();assert.equal((await call('status')).result.background.paused,true)
    assert.equal((await host.request('reminder.list',{})).result.items.length,1)
    assert.equal((await call('quit')).ok,true);assert.equal(await run.closed,0)
  }finally{if(run?.child.exitCode===null){run.child.kill();await run.closed}await host.dispose()}
})
