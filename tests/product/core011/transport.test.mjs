import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import {setup,alternate,vueFile,input} from './helpers.mjs'
import {createInterfaceService} from '../../../apps/desktop/product/interface/service.mjs'
import {createPersonalSpaceServer} from '../../../apps/desktop/product/web/server.mjs'
test('HTTP shell bridge keeps token out of iframe, rejects null origins, and scopes calls to a live mount',async()=>{
  const x=await setup();let server
  try{
    const interfaces=await createInterfaceService({root:path.join(x.root,'interfaces'),runtime:x.runtime,vueFile})
    server=await createPersonalSpaceServer({runtime:x.runtime,interfaces,vueFile})
    const html=await(await fetch(server.url)).text(),token=html.match(/name="personal-space-session" content="([^"]+)"/)[1]
    assert.match(html,/shell.mjs/);assert.doesNotMatch(html,/app.mjs/)
    const headers={Origin:server.url,'Content-Type':'application/json','X-Personal-Space-Token':token}
    const post=async(action,args={})=>(await(await fetch(server.url+'/api/command',{method:'POST',headers,body:JSON.stringify({action,args})})).json()).reply
    const mount=(await post('interface.mount')).mount
    const frame=await fetch(server.url+mount.url),body=await frame.text()
    assert.equal(frame.status,200);assert.match(frame.headers.get('content-security-policy'),/sandbox allow-scripts/)
    assert.equal(body.includes(token),false);assert.equal(body.includes('X-Personal-Space-Token'),false)
    assert.equal((await fetch(server.url+'/api/command',{method:'POST',headers:{...headers,Origin:'null'},body:'{}'})).status,403)
    const call=(action,args)=>post('interface.call',{mountId:mount.id,action,args})
    assert.equal((await call('interface.restore',{})).error,'invalid_request')
    const i=input(),r=await call('send',i);assert.equal(r.ok,true,JSON.stringify(r))
    assert.equal((await call('turn.read',{turnId:i.command_id})).result.actions[0].task.status,'completed')
    await post('interface.unmount',{mountId:mount.id})
    assert.equal((await call('send',input())).error,'interface_revoked')
    assert.equal((await fetch(server.url+'/recover')).status,200)
  }finally{await server?.close();await x.close()}
})
