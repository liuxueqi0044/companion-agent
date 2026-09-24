/** Liveness only. The child has no host data, model commands, or write capabilities. */
export function observeCanvas({frame,mount,eventTarget=window,onStatus,timeoutMs=7000}){
  let closed=false,loads=0,settled=false
  const status=value=>{if(!closed)onStatus(value)}
  function fail(){if(closed)return;settled=true;clearTimeout(timer);status('failed');dispose()}
  function message(event){
    if(closed||event.source!==frame.contentWindow||event.origin!=='null')return
    const v=event.data
    if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join('|')!=='mountId|type'||v.mountId!==mount.id)return
    if(v.type==='morrow.canvas.error')return fail()
    if(v.type==='morrow.canvas.ready'&&!settled){settled=true;clearTimeout(timer);status('ready')}
  }
  function loaded(){if(++loads>1)fail()}
  const timer=setTimeout(fail,timeoutMs)
  eventTarget.addEventListener('message',message);frame.addEventListener('load',loaded)
  status('loading')
  function dispose(){if(closed)return;closed=true;clearTimeout(timer);eventTarget.removeEventListener('message',message);frame.removeEventListener('load',loaded)}
  return {dispose}
}

export function makeCanvasComponent({h,ref,onMounted,onUnmounted}){
  return {props:['mount','title'],emits:['status'],setup(props,{emit}){
    const frame=ref(null);let observer
    onMounted(()=>{
      observer=observeCanvas({frame:frame.value,mount:props.mount,onStatus:s=>emit('status',s)})
      frame.value.src=props.mount.url
    })
    onUnmounted(()=>observer?.dispose())
    return ()=>h('iframe',{ref:frame,class:'personal-canvas',title:props.title||'你的个人空间',
      sandbox:'allow-scripts',referrerpolicy:'no-referrer',
      allow:"camera 'none'; microphone 'none'; geolocation 'none'; fullscreen 'none'; clipboard-read 'none'; clipboard-write 'none'"})
  }}
}
