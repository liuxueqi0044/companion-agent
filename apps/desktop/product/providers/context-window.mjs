/** Transport packing, not a rewrite of durable history or an invented summary. */
export const MAX_REQUEST_BYTES=96*1024
const fail=()=>Object.assign(Error('provider_input_too_large'),{code:'provider_input_too_large'})

/** @param {{prompt:string,context:Record<string,unknown>,now?:string,request?:(messages:{role:string,content:string}[])=>unknown,maxBytes?:number}} options */
export function packMessages({prompt,context,now=new Date().toISOString(),request=messages=>({messages}),maxBytes=MAX_REQUEST_BYTES}){
  const packed=structuredClone(context)
  const fields=['memories','history','recent_interactions']
  /** @type {Record<string,unknown[]>} */
  const original={}
  /** @type {Record<string,unknown[]>} */
  const selected={}
  /** @type {Record<string,number>} */
  const omissions={}
  for(const key of fields){
    const value=packed[key];original[key]=Array.isArray(value)?value:[]
    omissions['omitted_'+key]=original[key].length
    if(Array.isArray(value))packed[key]=selected[key]=[]
  }
  const messages=()=>[{role:'system',content:prompt},{role:'user',content:JSON.stringify({current_time_utc:now,
    context:Object.values(omissions).some(n=>n>0)?{...packed,
      context_window:{...omissions,note:'Omitted context remains stored. Absence is not evidence that a preference, conversation or action never existed.'}}:packed})}]
  const size=()=>Buffer.byteLength(JSON.stringify(request(messages())))
  // Current input, permission/policy, goal and actual tool receipts must never be silently cut.
  if(size()>maxBytes)throw fail()
  for(const key of fields){
    if(!Array.isArray(packed[key]))continue
    const entries=key==='memories'?original[key]:[...original[key]].reverse()
    for(const entry of entries){
      const next=key==='memories'?[...selected[key],entry]:[entry,...selected[key]]
      // Reserve room for conversation even if there are many individually valid memories.
      if(key==='memories'&&Buffer.byteLength(JSON.stringify(next))>24*1024)continue
      const previous=selected[key];packed[key]=selected[key]=next;omissions['omitted_'+key]--
      if(size()>maxBytes){packed[key]=selected[key]=previous;omissions['omitted_'+key]++}
    }
  }
  return messages()
}
