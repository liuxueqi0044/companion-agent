import path from 'node:path'
import {readJSON,writeJSON} from '../product/storage.mjs'
// Persist before submission to the OS. Delivery is at-most-once; the inbox is
// authoritative when the OS suppresses a toast or the process dies afterwards.
export async function createNotificationConsumer({root,show,supported=()=>false}){
  const file=path.join(root,'desktop-notifications.json')
  let state=await readJSON(file,{version:1,sequence:0}),flight=null,phase='idle',closed=false
  if(state.version!==1||!Number.isSafeInteger(state.sequence)||state.sequence<0)throw Error('notification_state_invalid')
  function poll(){
    if(closed)return Promise.resolve({skipped:true})
    if(flight)return flight
    flight=(async()=>{
      const notice=await readJSON(path.join(root,'notification.json'),null)
      if(notice===null)return {skipped:true}
      if(!Number.isSafeInteger(notice.sequence)||notice.sequence<1||!Number.isSafeInteger(notice.count)||notice.count<0)throw Error('notification_record_invalid')
      if(notice.sequence<=state.sequence)return {skipped:true}
      const next={version:1,sequence:notice.sequence}
      await writeJSON(file,next);state=next
      if(!notice.count||closed)return {skipped:true}
      if(!supported()){phase='unsupported';return {supported:false}}
      try{await show();phase='submitted';return {submitted:true}}catch{phase='failed';return {submitted:false}}
    })().finally(()=>{flight=null})
    return flight
  }
  return {poll,snapshot:()=>({supported:!!supported(),phase}),async close(){closed=true;await flight}}
}
