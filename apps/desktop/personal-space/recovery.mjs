import {createClient} from './client.mjs'
import {mountInterface} from './interface-host.mjs'
const q=s=>document.querySelector(s),status=q('#status')
let state=null,preview=null,mount=null,ready=false,operation=false,previewIntent=0
const clientId=sessionStorage.getItem('morrow.interface.client')??crypto.randomUUID()
sessionStorage.setItem('morrow.interface.client',clientId)
const client=createClient({token:q('meta[name="personal-space-session"]').content,onSnapshot:s=>{
  if(JSON.stringify(state)!==JSON.stringify(s.interfaces)){state=s.interfaces;render()}
}})
function message(text){status.textContent=text}
async function call(action,args={}){const r=await client.call('interface.'+action,args);if(!r.ok)message(`暂未完成：${r.error}`);return r}
async function exclusive(fn){if(operation)return;operation=true;try{await fn()}catch{message('未能处理文件，请检查代码包。')}finally{operation=false}}
function render(){
  if(!state)return
  if(state.error||state.dataError)message('界面记录需要修复。已保留原文件，初始界面与 AI 服务仍可使用。')
  const rows=[{hash:state.defaultHash,name:'Morrow · 初始界面'},...state.candidates]
  q('#versions').replaceChildren(...rows.map(row=>{const b=document.createElement('button');b.textContent=row.name+((state.active??state.defaultHash)===row.hash?' · 正在使用':'');b.onclick=()=>show(row.hash);return b}))
}
async function show(revision){
  const own=++previewIntent;preview?.dispose();preview=null;ready=false;mount=null;q('#activate').disabled=true;q('#trust').checked=false
  const r=await call('mount',{revision,preview:true,clientId});if(own!==previewIntent)return
  if(!r.ok)return
  mount=r.mount;q('#preview-section').hidden=false;q('#preview-title').textContent=mount.name
  q('#scopes').textContent='申请能力：'+mount.scopes.join('、')
  preview=mountInterface({container:q('#preview'),mount,client,onReady:()=>{ready=true;toggle()},onError:()=>{ready=false;toggle();message('预览未能正常打开，可以修正源码后重新导入。')}})
}
function toggle(){q('#activate').disabled=!ready||!q('#trust').checked}
q('#trust').onchange=toggle
q('#source').onclick=()=>exclusive(async()=>{
  const r=await call('source');if(!r.ok)return
  const source=r.result
  if(source.id==='morrow.default'){source.id='my.interface';source.name='我的界面'}
  const url=URL.createObjectURL(new Blob([JSON.stringify(source,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='morrow-interface.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
})
q('#import').onchange=e=>exclusive(async()=>{
  const file=e.target.files?.[0];e.target.value='';if(!file)return
  if(file.size>3*1024*1024){message('代码包超过 3 MB。');return}
  const source=JSON.parse(await file.text());message('正在构建界面…')
  const r=await call('import',{source,expectedVersion:state.version});if(r.ok){message('代码包已保存，正在打开预览。');await show(r.result.revision)}
})
q('#activate').onclick=()=>exclusive(async()=>{
  if(!ready||!q('#trust').checked||!mount)return
  const r=await call('activate',{mountId:mount.id,expectedVersion:state.version,trustSource:true});if(r.ok)location.href='/'
})
q('#original').onclick=()=>exclusive(async()=>{const r=await call('restore',{expectedVersion:state.version});if(r.ok)location.href='/'})
q('#previous').onclick=()=>exclusive(async()=>{const r=await call('restore',{expectedVersion:state.version,previous:true});if(r.ok)location.href='/'})
await client.start()
