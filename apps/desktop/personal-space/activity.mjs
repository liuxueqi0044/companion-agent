import {projectActivity} from '../product/application/activity.mjs'

const runningPhases=new Set(['starting','beginning','generating','accepting','executing','working','reading','stopping'])
export function currentStop({send,work,pendingId}={}){
  if(send?.commandId&&(!pendingId||send.commandId===pendingId))return {action:'send.cancel',args:{commandId:send.commandId}}
  if(pendingId)return null // New input has not been acknowledged; never stop the previous turn.
  if(work?.selected&&work.turnId&&runningPhases.has(work.phase))return {action:'work.stop',args:{turnId:work.turnId}}
  return null
}
/** Presentation only: model reply text can never create a tool or completion badge. */
export function presentActivity(record,{activity,work,send,pendingId}={}){
  if(work?.selected&&work.turnId===record.id&&work.activity?.turnId===record.id)activity=work.activity
  const active=activity?.turnId===record.id
  const a=active?activity:projectActivity({turn:record})
  const ownedWork=work?.selected&&work.turnId===record.id
  const running=pendingId===record.id||send?.turnId===record.id||send?.commandId===record.id||
    !!(ownedWork&&runningPhases.has(work.phase))
  const hasActions=!!a?.actions?.length
  const done=(a?.taskStatus==='completed'||a?.displayState==='completed')&&!a?.protocolError&&!a?.needsReconciliation
  const summary=typeof record.provider_summary==='string'?record.provider_summary:a?.providerSummary
  const heading=hasActions?(done?(a?.taskId?'核对完成':'已完成'):({queued:'等待执行',running:'正在核对 CSV',cancelling:'正在停止',
    failed:'核对未完成',cancelled:'核对已停止',interrupted:'执行已中断'})[a.taskStatus]??'准备调用工具'):
    running?'正在思考':({model_failed:'这次回复未完成',cancelled:'已停止回复',outcome_unknown:'这次回复的状态待核对',
      queued:'等待回应',generating:'上次回复中断，待核对',saving:'输入是否保存待核对'})[record.state]??null
  return {active,activity:a,running,hasActions,done,heading,summary:summary||null,
    mode:hasActions?'tool':running?'thinking':heading?'notice':null}
}

export function visibleDraft(record,{progress,send,work,pendingId}={}){
  if(!progress||progress.turnId!==record.id||!['generating','received'].includes(progress.state)||
    !['saving','queued','generating'].includes(record.state))return null
  if(!presentActivity(record,{send,work,pendingId}).running)return null
  return {reply:typeof progress.reply==='string'?progress.reply:'',summary:typeof progress.summary==='string'?progress.summary:''}
}
