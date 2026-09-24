/** Fresh synthetic browser fixture; no credentials, live model or user database. */
import fs from 'node:fs/promises'
import path from 'node:path'
import {setup,alternate,vueFile} from './helpers.mjs'
import {createInterfaceService} from '../../../apps/desktop/product/interface/service.mjs'
import {createPersonalSpaceServer} from '../../../apps/desktop/product/web/server.mjs'
const x=await setup({configured:true,async respond(context){
  await new Promise(r=>setTimeout(r,700))
  return {decision:{reply:'这是离线测试回应。界面已经通过 SDK 连到同一个 AI 服务。',actions:[]}}
}})
const interfaces=await createInterfaceService({root:path.join(x.root,'interfaces'),runtime:x.runtime,vueFile,
  connection:()=>({configured:true,model:'离线测试 · 无模型请求'})})
const imported=await interfaces.importSource({source:alternate(),expectedVersion:0})
const app=await createPersonalSpaceServer({runtime:x.runtime,interfaces,vueFile})
await fs.writeFile('.test-data/core011-edit/browser-server.json',JSON.stringify({url:app.url,pid:process.pid,root:x.root,alternate:imported.result.revision}))
console.log(JSON.stringify({url:app.url,pid:process.pid}))
async function stop(){await app.close();await x.close()}
process.once('SIGINT',stop);process.once('SIGTERM',stop)
