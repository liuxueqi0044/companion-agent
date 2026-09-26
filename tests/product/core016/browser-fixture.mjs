/** Isolated real host with a deterministic local responder. No model/credential/network provider. */
import fs from 'node:fs/promises'
import path from 'node:path'
import {createProductHost} from '../../../apps/desktop/product/host.mjs'
import {createProductRuntime} from '../../../apps/desktop/product/runtime/index.mjs'
import {createInterfaceService} from '../../../apps/desktop/product/interface/service.mjs'
import {createPersonalSpaceServer} from '../../../apps/desktop/product/web/server.mjs'
const root=await fs.mkdtemp(path.resolve('.test-data/core016-browser-'))
const host=createProductHost({python:path.resolve('../companion-agent/.venv/Scripts/python.exe'),workspace:process.cwd(),dataRoot:root})
const runtime=createProductRuntime({host,intent:()=>['artifact.create'],turnProvider:{configured:true,async respond(){
  await new Promise(r=>setTimeout(r,4500))
  return {decision:{reply:'我们先把事情放下来，一件一件看。\n\n我帮你整理了一份明日小清单：先完成最重要的一件事，给零碎事项留一个固定时段，也给自己留一点空白。清单已经交给文件工具保存。',actions:[
    {kind:'artifact.create',title:'明日小清单',files:[{path:'tomorrow.md',content:'# 明日小清单\n\n- 先做最重要的一件事\n- 集中处理零碎事项\n- 给自己留一点空白\n'}]},
  ]}}
}}})
await runtime.initialize()
const vueFile=path.resolve('../companion-agent/node_modules/vue/dist/vue.runtime.esm-browser.prod.js')
const interfaces=await createInterfaceService({root:path.join(root,'interfaces'),runtime,vueFile,background:{},connection:()=>({configured:true,model:'本地界面验证 · 不调用模型'})})
const app=await createPersonalSpaceServer({runtime,interfaces,vueFile,background:{},nativeToken:'core016-fixture-only',nativeControl:async action=>{
  if(action==='quit'){setTimeout(async()=>{await app.close();await host.dispose()},25);return {ok:true}}
  return {ok:false,error:'invalid_request'}
}})
await fs.writeFile('.test-data/core016-browser.json',JSON.stringify({root,url:app.url,pid:process.pid}))
console.log(JSON.stringify({url:app.url,pid:process.pid,mode:'offline-fixture'}))
