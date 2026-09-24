/** Browser-only transport. Reconnects the read stream; never replays writes. */
import {readSse} from './sse.mjs'
export function createClient({token,fetchImpl=globalThis.fetch,onSnapshot=()=>{},onConnection=()=>{},reconnectMs=800}={}){
  let revision=-1,epoch=null,disposed=false,timer=null,stream=null,started=false,generation=0
  const headers=()=>({'Content-Type':'application/json','X-Personal-Space-Token':token})
  function accept(snapshot,own){
    if(disposed||own!==generation||!Number.isSafeInteger(snapshot?.revision))return
    if(snapshot.epoch&&snapshot.epoch!==epoch){epoch=snapshot.epoch;revision=-1}
    if(snapshot.revision>=revision){revision=snapshot.revision;onSnapshot(snapshot)}
    onConnection(true)
  }
  async function call(action,args={}){
    if(disposed)return {ok:false,error:'disposed'}
    let body
    try{body=JSON.stringify({action,args})}catch{return {ok:false,error:'invalid_request'}}
    const own=generation
    try{
      const response=await fetchImpl('/api/command',{method:'POST',credentials:'same-origin',headers:headers(),body})
      const value=await response.json()
      if(disposed)return {ok:false,error:'disposed'}
      if(own!==generation)return {ok:false,error:'session_required'}
      if(!response.ok||!value.snapshot){onConnection(false);return {ok:false,error:value.error??'transport_unavailable'}}
      accept(value.snapshot,own);return value.reply
    }catch{if(!disposed)onConnection(false);return {ok:false,error:'transport_unavailable'}}
  }
  async function renewSession(){
    const response=await fetchImpl('/',{credentials:'same-origin',cache:'no-store'})
    if(!response.ok)throw Error('session_unavailable')
    const html=await response.text(),next=html.match(/name="personal-space-session" content="([A-Za-z0-9_-]+)"/)?.[1]
    if(!next)throw Error('session_unavailable')
    if(next!==token){token=next;generation++;epoch=null;revision=-1}
  }
  async function connect(){
    if(disposed||stream)return
    const controller=new AbortController();stream=controller
    let watchdog=setTimeout(()=>controller.abort(),35000)
    try{
      const own=generation
      const response=await fetchImpl('/api/events',{method:'POST',credentials:'same-origin',headers:headers(),body:'{}',signal:controller.signal})
      if(response.status===401){await renewSession();throw Error('session_renewed')}
      if(!response.ok||!response.headers.get('content-type')?.includes('text/event-stream'))throw Error('events_unavailable')
      for await(const data of readSse(response.body,{signal:controller.signal})){
        clearTimeout(watchdog);watchdog=setTimeout(()=>controller.abort(),35000)
        accept(JSON.parse(data),own)
      }
    }catch{/* A disconnected reader has no authority to retry generation. */}
    finally{
      clearTimeout(watchdog)
      if(stream===controller)stream=null
      if(!disposed){onConnection(false);timer=setTimeout(()=>{void connect()},reconnectMs)}
    }
  }
  return {call,async start(){if(started||disposed)return;started=true;await call('snapshot');if(!disposed)void connect()},
    dispose(){disposed=true;clearTimeout(timer);stream?.abort()}}
}
