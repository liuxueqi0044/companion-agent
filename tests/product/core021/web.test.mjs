import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {createProductHost} from '../../../apps/desktop/product/host.mjs'
import {createProductRuntime} from '../../../apps/desktop/product/runtime/index.mjs'
import {createCapabilityService} from '../../../apps/desktop/product/capabilities/service.mjs'
import {createPersonalSpaceServer} from '../../../apps/desktop/product/web/server.mjs'
import {resolveRuntime,projectRoot} from '../../../apps/desktop/product/runtime-paths.mjs'

test('capability management stays behind first-party auth; a busy task still permits disabling',async()=>{
  await fs.mkdir('.test-data',{recursive:true});const root=await fs.mkdtemp(path.resolve('.test-data/core021-web-'))
  const host=createProductHost({python:resolveRuntime('python'),workspace:projectRoot,dataRoot:root})
  const runtime=createProductRuntime({host}),capabilities=createCapabilityService({host,root:path.join(root,'capabilities')})
  let server,busy=false
  try{
    assert.ok((await runtime.initialize()).ok)
    server=await createPersonalSpaceServer({runtime:{...runtime,snapshot(){const s=runtime.snapshot();s.runtime.executionBusy=busy;return s}},capabilities,vueFile:resolveRuntime('vue')})
    const page=await fetch(server.url+'/capabilities');assert.equal(page.status,200)
    assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/)
    const text=await page.text(),token=text.match(/personal-space-session" content="([A-Za-z0-9_-]+)"/)[1]
    const command=async(action,args={},origin=server.url)=>{
      const response=await fetch(server.url+'/api/command',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Personal-Space-Token':token},body:JSON.stringify({action,args})})
      return {status:response.status,value:await response.json()}
    }
    assert.equal((await command('capabilities.list',{},'null')).status,403)
    assert.equal((await command('capability.definition',{id:'a'.repeat(32),version:'b'.repeat(64)})).value.reply.ok,false)
    let item=(await command('capabilities.import',{files:[{path:'SKILL.md',content:'---\nname: test-web\ndescription: A test skill\n---\nUse user-provided facts.'}]})).value.reply.result
    item=(await command('capabilities.manage',{id:item.id,expected_revision:item.revision,operation:'enable',version:null})).value.reply.result
    busy=true
    assert.equal((await command('capabilities.save-set',{name:'no',items:[{id:item.id,version:item.version}]})).value.reply.error,'runner_busy')
    const disabled=await command('capabilities.manage',{id:item.id,expected_revision:item.revision,operation:'disable',version:null})
    assert.equal(disabled.value.reply.ok,true);assert.equal(disabled.value.reply.result.enabled,false)
  }finally{if(server)await server.close();else{runtime.dispose();await runtime.whenIdle();await capabilities.close()}await host.dispose()}
})
