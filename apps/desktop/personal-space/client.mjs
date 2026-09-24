/** Browser-only narrow client. No Node imports, secrets, generic host or execution endpoints. */
export function createClient({token,fetchImpl=globalThis.fetch,onSnapshot=()=>{},onConnection=()=>{}}){
  let revision=-1,disposed=false,polling=false,timer=null
  async function call(action,args={}){
    if(disposed)return {ok:false,error:'disposed'}
    let body
    try{body=JSON.stringify({action,args})}catch{return {ok:false,error:'invalid_request'}}
    try{
      const response=await fetchImpl('/api/command',{method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json','X-Personal-Space-Token':token},body})
      const value=await response.json()
      if(disposed)return {ok:false,error:'disposed'}
      if(!response.ok||!value.snapshot){onConnection(false);return {ok:false,error:value.error??'transport_unavailable'}}
      const snapshot=value.snapshot
      if(Number.isSafeInteger(snapshot.revision)&&snapshot.revision>=revision){revision=snapshot.revision;onSnapshot(snapshot)}
      onConnection(true)
      return value.reply
    }catch{if(!disposed)onConnection(false);return {ok:false,error:'transport_unavailable'}}
  }
  async function poll(){
    if(disposed||polling)return
    polling=true
    try{await call('snapshot')}finally{polling=false;if(!disposed)timer=setTimeout(poll,document.hidden?5000:900)}
  }
  return {call,start:poll,dispose(){disposed=true;clearTimeout(timer)}}
}
