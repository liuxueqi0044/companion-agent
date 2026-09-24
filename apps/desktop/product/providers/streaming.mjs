import {readSse} from '../../personal-space/sse.mjs'

const invalid=()=>Object.assign(Error('provider_invalid_output'),{code:'provider_invalid_output'})
/** Decode only top-level public string fields. Partial JSON never becomes a decision. */
export function publicPrefix(text){
  let i=0;const fields={},seen=new Set()
  const whitespace=()=>{while(/\s/.test(text[i]??'')&&i<text.length)i++}
  const string=()=>{
    if(text[i]!=='"')throw invalid()
    const start=i++;let escaped=false
    while(i<text.length){
      const char=text[i++]
      if(escaped){escaped=false;continue}
      if(char==='\\'){escaped=true;continue}
      if(char==='"')return {value:JSON.parse(text.slice(start,i)),complete:true}
    }
    // Incomplete escape/unicode tails are held until they can be decoded exactly.
    let fragment=text.slice(start)
    for(let cut=0;cut<=6&&cut<fragment.length;cut++){
      try{return {value:JSON.parse(fragment.slice(0,fragment.length-cut)+'"'),complete:false}}catch{}
    }
    return {value:'',complete:false}
  }
  whitespace();if(i===text.length)return fields
  if(text[i++]!=='{')throw invalid()
  while(i<text.length){
    whitespace();if(i===text.length||text[i]==='}')return fields
    const key=string();if(!key.complete)return fields
    if(seen.has(key.value))throw invalid();seen.add(key.value)
    whitespace();if(i===text.length)return fields
    if(text[i++]!==':')throw invalid();whitespace();if(i===text.length)return fields
    if(text[i]==='"'){
      const value=string()
      if(['reply','displayable_summary'].includes(key.value))fields[key.value]=value
      if(!value.complete)return fields
    }else{
      // Skip other values, including nested quoted keys. They are never projected.
      let depth=0,inString=false,escaped=false
      for(;i<text.length;i++){
        const c=text[i]
        if(inString){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')inString=false;continue}
        if(c==='"'){inString=true;continue}
        if(depth===0&&(c===','||c==='}'))break
        if(c==='{'||c==='[')depth++
        if(c==='}'||c===']')depth--
        if(depth<0)throw invalid()
      }
      if(i===text.length)return fields
    }
    whitespace();if(i===text.length||text[i]==='}')return fields
    if(text[i++]!==',')throw invalid()
  }
  return fields
}

export async function readChatStream(body,{signal,onContent=()=>{},secret}={}){
  let content='',finish=null,done=false,usage=null,streamId=null
  for await(const data of readSse(body,{signal,maxFrameBytes:128*1024,maxTotalBytes:1024*1024})){
    if(signal?.aborted)throw Object.assign(Error('provider_aborted'),{code:'provider_aborted'})
    if(data==='[DONE]'){done=true;break}
    if(secret&&data.includes(secret))throw Object.assign(Error('credential_echo_detected'),{code:'credential_echo_detected'})
    const part=JSON.parse(data)
    if(part.error||!Array.isArray(part.choices))throw invalid()
    if(part.id!==undefined){if(streamId!==null&&part.id!==streamId)throw invalid();streamId=part.id}
    if(part.usage)usage=part.usage
    if(part.choices.length===0){if(!finish||!part.usage)throw invalid();continue}
    if(part.choices.length!==1||part.choices[0].index!==0)throw invalid()
    const choice=part.choices[0],delta=choice.delta
    if(!delta||typeof delta!=='object'||delta.tool_calls||delta.function_call)throw invalid()
    if(finish)throw invalid()
    if(delta.content!==null&&delta.content!==undefined){
      if(typeof delta.content!=='string')throw invalid()
      content+=delta.content
      if(content.length>64*1024)throw invalid()
      const fields=publicPrefix(content),preview={reply:'',summary:''}
      for(const [name,value] of Object.entries(fields)){
        if(secret&&value.value.includes(secret))throw Object.assign(Error('credential_echo_detected'),{code:'credential_echo_detected'})
        // Do not leak a credential in fragments before a full-key echo is detectable.
        let text=value.complete?value.value:value.value.slice(0,Math.max(0,value.value.length-(secret?.length??1)))
        if(/[\uD800-\uDBFF]$/.test(text))text=text.slice(0,-1)
        preview[name==='reply'?'reply':'summary']=text
      }
      onContent(preview)
    }
    if(choice.finish_reason!==null&&choice.finish_reason!==undefined){
      if(choice.finish_reason!=='stop')throw invalid();finish='stop'
    }
  }
  if(!done||finish!=='stop')throw invalid()
  return {choices:[{finish_reason:'stop',message:{content}}],usage}
}
