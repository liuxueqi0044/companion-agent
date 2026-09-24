import {createClient} from './client.mjs'
import {mountInterface} from './interface-host.mjs'
const surface=document.querySelector('#surface'),recovery=document.querySelector('#recovery')
let mounted=null,current=null,epoch=null,loading=false,lastRevision=-1,intent=0
const clientId=sessionStorage.getItem('morrow.interface.client')??crypto.randomUUID()
sessionStorage.setItem('morrow.interface.client',clientId)
const client=createClient({token:document.querySelector('meta[name="personal-space-session"]').content,
  onConnection:connected=>mounted?.connection(connected),onSnapshot:s=>{
    if(s.epoch!==epoch){epoch=s.epoch;current=undefined;lastRevision=-1}
    if(s.revision===lastRevision)return;lastRevision=s.revision
    const revision=s.interfaces?.active??s.interfaces?.defaultHash
    if(revision&&revision!==current&&!loading)void load(revision)
    else void mounted?.refresh()
  }})
async function load(revision){
  const own=++intent;loading=true;current=revision;mounted?.dispose();mounted=null
  recovery.hidden=true
  const r=await client.call('interface.mount',{clientId})
  if(own!==intent)return
  loading=false
  if(!r.ok){recovery.hidden=false;return}
  mounted=mountInterface({container:surface,mount:r.mount,client,onError:()=>{recovery.hidden=false}})
}
document.querySelector('#retry').onclick=()=>{void load(current)}
addEventListener('keydown',e=>{if(e.ctrlKey&&e.shiftKey&&e.code==='Backspace')location.href='/recover'})
await client.start()
