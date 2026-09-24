import fs from 'node:fs/promises'
import path from 'node:path'
import {createProductHost} from '../../../apps/desktop/product/host.mjs'
import {createProductRuntime} from '../../../apps/desktop/product/runtime/index.mjs'
import {createInterfaceService} from '../../../apps/desktop/product/interface/service.mjs'
import {createPersonalSpaceServer} from '../../../apps/desktop/product/web/server.mjs'
const root=await fs.mkdtemp(path.resolve('.test-data/core012-browser-'))
const host=createProductHost({python:path.resolve('../companion-agent/.venv/Scripts/python.exe'),workspace:process.cwd(),dataRoot:root})
const runtime=createProductRuntime({host,intent:()=>['artifact.create','reminder.create'],turnProvider:{configured:true,async respond(){
  await new Promise(r=>setTimeout(r,500));return {decision:{reply:'周报草稿已整理，正在保存为文件。',actions:[
    {kind:'artifact.create',title:'这周的小进展',files:[{path:'weekly-notes.md',content:'# 这周的小进展\n\n- 完成资料核对\n- 留出休息时间\n'}]},
    {kind:'reminder.create',text:'看看本周的进展',due_at:new Date(Date.now()+3600000).toISOString()}]}}
}}})
await runtime.initialize()
const vueFile=path.resolve('../companion-agent/node_modules/vue/dist/vue.runtime.esm-browser.prod.js')
const interfaces=await createInterfaceService({root:path.join(root,'interfaces'),runtime,vueFile,background:{},connection:()=>({configured:true,model:'离线验证 · 无模型请求'})})
const app=await createPersonalSpaceServer({runtime,interfaces,vueFile,background:{},nativeToken:'fixture-only',nativeControl:async action=>{
  if(action==='quit'){setTimeout(async()=>{await app.close();await host.dispose()},25);return {ok:true}}
  return {ok:false,error:'invalid_request'}
}})
await fs.writeFile('.test-data/core012-browser.json',JSON.stringify({root,url:app.url,pid:process.pid}))
console.log(JSON.stringify({url:app.url,pid:process.pid}))
