import {pick,validId} from './state.mjs'

/** Explicit, bounded public projection. No tickets, raw SQL, attachment rows or grants. */
export function workflowView(raw){
  if(raw===null||raw===undefined)return null
  if(raw.version!==1||!Number.isSafeInteger(raw.step_count)||raw.step_count<0||raw.step_count>64||
    !Array.isArray(raw.plan)||raw.plan.length>8||raw.plan.some(p=>typeof p!=='string'||p.length>400)||
    !Array.isArray(raw.steps)||raw.steps.length>12||typeof raw.can_continue!=='boolean'||
    typeof raw.has_more_steps!=='boolean'||!['continue','none'].includes(raw.next)||
    ![null,'complete','needs_input','incomplete'].includes(raw.outcome))return null
  let previous=0
  const steps=[]
  for(const step of raw.steps){
    if(!Number.isSafeInteger(step.ordinal)||step.ordinal<=previous||step.ordinal>raw.step_count||
      !['generating','accepted','failed'].includes(step.state)||!Array.isArray(step.action_ids)||
      step.action_ids.length>2||step.action_ids.some(id=>!validId(id))||
      [step.reply,step.summary,step.error,step.created_at].some(v=>v!==null&&typeof v!=='string'))return null
    previous=step.ordinal
    steps.push(pick(step,['ordinal','state','reply','summary','action_ids','error','created_at']))
  }
  return {...pick(raw,['version','step_count','plan','outcome','pause_reason','next','can_continue','has_more_steps']),steps}
}
