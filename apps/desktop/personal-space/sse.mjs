/** Small shared SSE framing reader; never evaluates received content. */
export async function* readSse(body,{signal,maxFrameBytes=512*1024,maxTotalBytes=Infinity}={}){
  if(!body?.getReader)throw Error('invalid_event_stream')
  const reader=body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true})
  let buffer='',data=[],frameSize=0,total=0
  const abort=()=>{void reader.cancel().catch(()=>{})}
  signal?.addEventListener('abort',abort,{once:true})
  try{
    while(true){
      if(signal?.aborted)throw Error('stream_aborted')
      const {value,done}=await reader.read()
      if(value){total+=value.byteLength;if(total>maxTotalBytes)throw Error('event_stream_too_large')}
      buffer+=done?decoder.decode():decoder.decode(value,{stream:true})
      if(done&&buffer)buffer+='\n'
      let match
      while((match=/[\r\n]/.exec(buffer))){
        const index=match.index
        if(!done&&buffer[index]==='\r'&&index===buffer.length-1)break
        const line=buffer.slice(0,index),width=buffer.slice(index,index+2)==='\r\n'?2:1
        buffer=buffer.slice(index+width);frameSize+=line.length
        if(frameSize>maxFrameBytes)throw Error('event_frame_too_large')
        if(line===''){
          if(data.length)yield data.join('\n')
          data=[];frameSize=0
        }else if(line.startsWith('data:'))data.push(line.slice(5).replace(/^ /,''))
      }
      if(buffer.length+frameSize>maxFrameBytes)throw Error('event_frame_too_large')
      if(done){if(data.length)throw Error('incomplete_event');break}
    }
  }finally{
    signal?.removeEventListener('abort',abort)
    await reader.cancel().catch(()=>{});reader.releaseLock()
  }
}
