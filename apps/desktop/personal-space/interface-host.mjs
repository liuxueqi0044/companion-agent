/** Trusted MessagePort bridge. Every port belongs to exactly one iframe/mount. */
export function mountInterface({container,mount,client,onReady=()=>{},onError=()=>{},onRecovery=()=>{location.href='/recover'},onCapabilities=()=>{location.href='/capabilities'}}){
  const frame=document.createElement('iframe')
  frame.title=mount.preview?'界面预览':mount.name
  frame.setAttribute('sandbox','allow-scripts allow-downloads allow-modals')
  frame.referrerPolicy='no-referrer';frame.src=mount.url
  let closed=false,bound=false,port=null,loads=0,inFlight=0,lastRevision=-1,epoch=null
  const timer=setTimeout(()=>{if(!bound)broken()},10000)
  function broken(){dispose();onError()}
  frame.addEventListener('load',()=>{if(++loads>1)broken()})
  const receive=event=>{
    if(!closed&&event.source===frame.contentWindow&&event.origin==='null'&&event.data?.type==='morrow.ui.error'&&event.data.mountId===mount.id){broken();return}
    if(closed||bound||event.source!==frame.contentWindow||event.origin!=='null'
      ||event.data?.type!=='morrow.ui.ready'||event.data.mountId!==mount.id)return
    bound=true;clearTimeout(timer)
    const channel=new MessageChannel();port=channel.port1
    port.onmessage=async({data})=>{
      if(closed||data?.type!=='call'||!Number.isSafeInteger(data.id)||typeof data.action!=='string'||inFlight>=12)return
      inFlight++
      try{
        if(data.action==='host.recovery'){if(!mount.preview)onRecovery();reply(data.id,{ok:true});return}
        if(data.action==='host.capabilities'){if(!mount.preview)onCapabilities();reply(data.id,mount.preview?{ok:false,error:'preview_read_only'}:{ok:true});return}
        if(data.action==='host.window'){
          const result=mount.preview?{ok:false,error:'preview_read_only'}:globalThis.morrowDesktop?await globalThis.morrowDesktop.configureWindow(mount.id,data.args??{}):{ok:false,error:'native_unavailable'}
          reply(data.id,result);return
        }
        const result=await client.call('interface.call',{mountId:mount.id,action:data.action,args:data.args??{}})
        reply(data.id,result);void refresh()
      }finally{inFlight--}
    }
    port.start();frame.contentWindow.postMessage({type:'morrow.ui.bind',mountId:mount.id},'*',[channel.port2])
    void refresh().then(async()=>{if(!closed){const r=await client.call('interface.ready',{mountId:mount.id});if(closed)return;if(r.ok)onReady();else broken()}})
  }
  function reply(id,value){if(!closed)port?.postMessage({type:'reply',id,value})}
  let reading=null,again=false
  async function refresh(){
    if(closed||!bound)return
    if(reading){again=true;return reading}
    reading=(async()=>{
      do{
        again=false
        const r=await client.call('interface.snapshot',{mountId:mount.id})
        if(closed)return
        if(!r.ok){if(r.error==='interface_revoked')broken();return}
        const s=r.result
        if(epoch!==s.epoch){epoch=s.epoch;lastRevision=-1}
        if(s.revision>=lastRevision){lastRevision=s.revision;port.postMessage({type:'snapshot',value:s})}
      }while(again&&!closed)
    })().finally(()=>{reading=null})
    return reading
  }
  function dispose(){
    if(closed)return;closed=true;clearTimeout(timer);removeEventListener('message',receive)
    port?.postMessage({type:'revoked'});port?.close();frame.remove()
    void client.call('interface.unmount',{mountId:mount.id})
  }
  addEventListener('message',receive);container.replaceChildren(frame)
  return {refresh,dispose,connection(value){if(!closed)port?.postMessage({type:'connection',value})}}
}
