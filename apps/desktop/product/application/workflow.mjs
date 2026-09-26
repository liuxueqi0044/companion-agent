import {pick,validId} from './state.mjs'

/** Explicit, bounded public projection. No tickets, raw SQL, attachment rows or grants. */
export function workflowView(raw){
  if(raw===null||raw===undefined)return null
  if(raw.version!==1||!Number.isSafeInteger(raw.step_count)||raw.step_count<0||raw.step_count>(raw.goal?192:64)||
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
    if(step.role!==undefined&&!['director','worker','reviewer'].includes(step.role))return null
    steps.push(pick(step,['ordinal','state','reply','summary','action_ids','error','created_at','role','task_id','executor']))
  }
  const goal=raw.goal?goalView(raw.goal):null
  if(raw.goal&&!goal)return null
  return {...pick(raw,['version','step_count','plan','outcome','pause_reason','next','can_continue','has_more_steps']),steps,...(goal?{goal}:{})}
}

function goalView(raw){
  if(raw.version!==1||!['planning','dispatching','working','reviewing','finished','cancelled'].includes(raw.phase)||
    !['director','worker','reviewer'].includes(raw.role)||!Array.isArray(raw.tasks)||raw.tasks.length>12)return null
  const tasks=[];const ids=new Set()
  for(const t of raw.tasks){
    if(typeof t.id!=='string'||!/^[a-z][a-z0-9_-]{0,31}$/.test(t.id)||ids.has(t.id)||typeof t.title!=='string'||t.title.length>160||
      !['queued','working','submitted','accepted','rework'].includes(t.state)||!Number.isSafeInteger(t.attempt)||t.attempt<0||t.attempt>4||
      !['worker','claude'].includes(t.executor)||!Array.isArray(t.criteria)||t.criteria.length<1||t.criteria.length>6||t.criteria.some(c=>typeof c!=='string'||c.length>600)||
      !Array.isArray(t.depends_on)||t.depends_on.some(d=>!ids.has(d))||typeof t.summary!=='string'||t.summary.length>2000||
      !Array.isArray(t.evidence_ids)||t.evidence_ids.some(e=>!validId(e))||!Array.isArray(t.checks)||t.checks.length>6)return null
    const checks=[]
    for(const c of t.checks){
      if(!Number.isSafeInteger(c.criterion)||c.criterion<0||c.criterion>=t.criteria.length||typeof c.passed!=='boolean'||
        typeof c.reason!=='string'||c.reason.length>1000||!Array.isArray(c.evidence_ids)||c.evidence_ids.some(e=>!validId(e)))return null
      checks.push(pick(c,['criterion','passed','reason','evidence_ids']))
    }
    ids.add(t.id);tasks.push({...pick(t,['id','title','criteria','depends_on','state','attempt','executor','summary','evidence_ids']),checks})
  }
  if(raw.active_task!==null&&!ids.has(raw.active_task))return null
  return {...pick(raw,['version','phase','role','active_task','outcome']),tasks}
}
