/** Optional browser test server. Fresh isolated data; no credentials or model calls. */
import fs from 'node:fs/promises'
import path from 'node:path'
import {createProductHost} from '../../../apps/desktop/product/host.mjs'
import {createProductRuntime} from '../../../apps/desktop/product/runtime/index.mjs'
import {createSpaceService} from '../../../apps/desktop/product/space/service.mjs'
import {createPersonalSpaceServer} from '../../../apps/desktop/product/web/server.mjs'

await fs.mkdir('.test-data',{recursive:true})
const dataRoot=await fs.mkdtemp(path.resolve('.test-data/core-010-browser-'))
const probe={summary:'Browser isolation probe: synthetic data only.',files:{
  'view.html':'<main><h1>浏览器隔离检查</h1><p id="results">等待检查</p></main>',
  'view.css':'body{padding:28px;background:#edf2e4;color:#364a2b;font:16px/2 sans-serif}p{white-space:pre-wrap}',
  'view.js':`(async()=>{
const lines=[];
try{parent.document.querySelector('meta');lines.push('parent DOM: FAIL')}catch{lines.push('parent DOM: BLOCKED')}
try{localStorage.setItem('canvas-test','test');lines.push('local storage: FAIL')}catch{lines.push('local storage: BLOCKED')}
try{await fetch('/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'send',args:{text:'must not run'}})});lines.push('fetch: FAIL')}catch{lines.push('fetch: BLOCKED')}
parent.postMessage({type:'send',action:'send',args:{text:'must not run'}},'*');
document.querySelector('#results').textContent=lines.join('\\n')+'\\nFake command sent; host must ignore it.';
})();`,
}}
const broken={summary:'Intentional script failure: the host must keep recovery available.',files:{
 'view.html':'<h1>Broken fixture</h1>','view.css':'body{background:#ddd}','view.js':'throw Error("intentional fixture failure")'}}
const host=createProductHost({python:path.resolve('../companion-agent/.venv/Scripts/python.exe'),workspace:path.resolve('.'),dataRoot})
const runtime=createProductRuntime({host});await runtime.initialize()
const space=await createSpaceService({root:path.join(dataRoot,'canvas'),provider:{generate:async ctx=>ctx.request==='broken'?broken:probe}})
for(const prompt of ['probe','broken']){await space.generate({prompt,expectedVersion:space.snapshot().version});await space.whenIdle()}
const app=await createPersonalSpaceServer({runtime,space,vueFile:path.resolve('../companion-agent/node_modules/vue/dist/vue.runtime.esm-browser.prod.js')})
await fs.writeFile(path.resolve('.test-data/core010-edit/browser-server.json'),JSON.stringify({url:app.url,pid:process.pid,dataRoot}))
console.log(JSON.stringify({url:app.url,pid:process.pid,dataRoot}))
async function stop(){await app.close();await host.dispose()}
process.once('SIGINT',stop);process.once('SIGTERM',stop)
