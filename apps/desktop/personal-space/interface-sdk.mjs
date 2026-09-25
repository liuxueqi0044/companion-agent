/** morrow.ui/1 — browser SDK. No auth token, fetch, filesystem or raw host IPC. */
export function createClient({onSnapshot=()=>{},onConnection=()=>{}}={}){
  let port=null,closed=false,next=0,started=false,bootResolve,last=null
  const ready=new Promise(resolve=>{bootResolve=resolve}),pending=new Map(),listeners=new Set()
  const mountId=globalThis.__MORROW_MOUNT__
  if(typeof mountId!=='string')throw Error('interface_host_required')
  const accept=event=>{
    if(closed||port||event.source!==parent||event.data?.type!=='morrow.ui.bind'||event.data.mountId!==mountId||event.ports.length!==1)return
    port=event.ports[0];removeEventListener('message',accept)
    port.onmessage=({data})=>{
      if(closed)return
      if(data?.type==='snapshot'){last=data.value;onSnapshot(data.value);for(const fn of listeners){try{fn(data.value)}catch{}};bootResolve();onConnection(true)}
      else if(data?.type==='connection')onConnection(data.value===true)
      else if(data?.type==='reply'){const record=pending.get(data.id);if(record){pending.delete(data.id);clearTimeout(record.timer);record.resolve(data.value)}}
      else if(data?.type==='revoked')dispose()
    }
    port.start()
  }
  addEventListener('message',accept)
  parent.postMessage({type:'morrow.ui.ready',mountId},'*')
  const broken=()=>parent.postMessage({type:'morrow.ui.error',mountId},'*')
  addEventListener('error',broken);addEventListener('unhandledrejection',broken)
  async function call(action,args={}){
    if(closed)return {ok:false,error:'interface_revoked'}
    await ready
    if(closed||!port)return {ok:false,error:'interface_revoked'}
    const id=++next
    return new Promise(resolve=>{
      const timer=setTimeout(()=>{pending.delete(id);resolve({ok:false,error:'outcome_unknown'})},125000)
      pending.set(id,{resolve,timer})
      try{port.postMessage({type:'call',id,action,args})}catch{pending.delete(id);clearTimeout(timer);resolve({ok:false,error:'invalid_request'})}
    })
  }
  function dispose(){
    if(closed)return;closed=true;bootResolve();removeEventListener('message',accept);removeEventListener('error',broken);removeEventListener('unhandledrejection',broken);onConnection(false)
    for(const item of pending.values()){clearTimeout(item.timer);item.resolve({ok:false,error:'interface_revoked'})}
    pending.clear();listeners.clear();port?.close()
  }
  return Object.freeze({version:'morrow.ui/1',call,async start(){if(started)return;started=true;await ready},dispose,
    subscribe(fn){listeners.add(fn);if(last)fn(last);return()=>listeners.delete(fn)},
    conversation:{list:args=>call('conversations.read',args),turns:args=>call('turns.read',args),get:args=>call('turn.read',args),send:args=>call('send',args)},
    tasks:{get:args=>call('task.read',args),result:args=>call('task.result',args),stop:args=>call('work.stop',args)},
    artifacts:{read:args=>call('artifact.read',{...args,download:false}),download:args=>call('artifact.read',{...args,download:true})},
    tools:{list:()=>call('tools.list'),read:args=>call('tools.read',args),manage:args=>call('tools.manage',args)},
    state:{read:()=>call('ui.state.read'),write:args=>call('ui.state.write',args)},
    draft:{read:()=>call('draft.read'),write:args=>call('draft.write',args)},
    host:{openRecovery:()=>call('host.recovery'),configureWindow:settings=>call('host.window',settings)},
  })
}
