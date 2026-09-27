import {resolveRuntime} from '../../../apps/desktop/product/runtime-paths.mjs'
import fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {createProductRuntime} from '../../../apps/desktop/product/runtime/index.mjs'
import {createProductHost} from '../../../apps/desktop/product/host.mjs'
export const vueFile=resolveRuntime('vue')
export const input=()=>({command_id:randomUUID(),conversation_id:randomUUID(),text:'Fictional audit',
  csv_text:'item,unit,qty,unit_price,currency\nPen,piece,2,3,CNY\n'})
export const decision={decision:{reply:'Fictional audit complete.',actions:[{kind:'csv.audit'}]}}
export const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}}
export async function setup(provider={configured:true,respond:()=>decision}){
  await fs.mkdir('.test-data',{recursive:true})
  const root=await fs.mkdtemp(path.resolve('.test-data/core-011-'))
  const host=createProductHost({python:resolveRuntime('python'),workspace:path.resolve('.'),dataRoot:root})
  const runtime=createProductRuntime({host,intent:i=>i.csv_text?['csv.audit']:[],turnProvider:provider})
  await runtime.initialize()
  return {root,host,runtime,async close(){runtime.dispose();await runtime.whenIdle();await host.dispose()}}
}
export const alternate=()=>({sdk:'morrow.ui/1',id:'fixture.workbench',name:'验证工作台',entry:'main.mjs',styles:['theme.css'],scopes:['conversation','tasks'],files:{
  'main.mjs':`import {createClient} from '@morrow/sdk';import {heading} from './parts/title.mjs';
const api=createClient({onSnapshot:s=>{document.querySelector('#busy').textContent=s.view.runtime.executionBusy?'执行中':'可用'}});
document.querySelector('#app').innerHTML='<section><h1>'+heading+'</h1><p id="busy"></p><textarea aria-label="工作台输入"></textarea><button id="send">发给我的 AI</button><pre id="reply"></pre><button id="restore">界面管理</button></section>';
awaitReady();async function awaitReady(){await api.start();const d=await api.draft.read();if(d.ok)document.querySelector('textarea').value=d.result.value.text??'';}
document.querySelector('#send').onclick=async()=>{const command_id=crypto.randomUUID(),conversation_id=crypto.randomUUID();const r=await api.conversation.send({command_id,conversation_id,text:document.querySelector('textarea').value});const t=await api.conversation.get({turnId:command_id});document.querySelector('#reply').textContent=t.ok?t.result.reply:r.error;};
document.querySelector('#restore').onclick=()=>api.host.openRecovery();`,
  'parts/title.mjs':`export const heading='另一种界面，同一个 AI';`,
  'theme.css':'body{background:#12243a;color:#cfe6ff;font:18px/1.6 sans-serif}section{max-width:700px;margin:10vh auto;padding:32px}h1{font-size:36px}textarea{display:block;width:100%;min-height:100px}button{padding:12px;margin:20px 10px 0 0}',
}})
