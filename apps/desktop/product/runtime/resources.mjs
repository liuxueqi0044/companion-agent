/** Versioned resource projections. No database handle, generation ticket or host IPC escapes. */
import {fail,request,validId,pick} from '../application/state.mjs'
import {turnView} from '../application/index.mjs'
import {createResultController} from '../application/results.mjs'
import {projectActivity} from '../application/activity.mjs'

export function createResourceAPI({host,operation,run,stop,execution,send,cancelSend}){
  function captured(value,fn){let copy;try{copy=structuredClone(value)}catch{return Promise.resolve(fail('invalid_request'))}
    return operation(()=>fn(copy))}
  async function readTurn({turnId}={}){
    if(!validId(turnId))return fail('invalid_request')
    const r=await request(host,'turn.read',{turn_id:turnId})
    if(!r.ok)return r
    if(r.result?.id!==turnId)return fail('protocol_error')
    return {ok:true,result:turnView(r.result)}
  }
  async function taskBinding(input){
    if(!input || !validId(input.taskId) || !(input.attemptId===null||validId(input.attemptId)))return fail('invalid_request')
    const r=await readTurn(input);if(!r.ok)return r
    const action=r.result.actions.find(a=>a.kind==='csv.audit'&&a.task?.task_id===input.taskId)
    if(!action)return fail('task_not_owned_by_turn')
    if((action.task.current_attempt_id??null)!==input.attemptId)return fail('stale_attempt')
    return {ok:true,result:{turn:r.result,action}}
  }
  async function page(action,payload,fields){
    const r=await request(host,action,payload)
    if(!r.ok)return r
    if(!Array.isArray(r.result?.items))return fail('protocol_error')
    return {ok:true,result:{...pick(r.result,['snapshot','next_before']),items:r.result.items.map(i=>pick(i,fields))}}
  }
  return Object.freeze({
    version:'1',execution,
    turn:input=>captured(input,readTurn),
    tools:()=>operation(()=>request(host,'tool.list',{})),
    tool:input=>captured(input,a=>validId(a?.toolId)?request(host,'tool.read',{tool_id:a.toolId}):fail('invalid_request')),
    manageTool:input=>captured(input,a=>request(host,'tool.manage',a)),
    artifact:input=>captured(input,async a=>{
      if(!a||!validId(a.turnId)||!validId(a.actionId)||typeof a.download!=='boolean')return fail('invalid_request')
      return request(host,a.download?'artifact.download':'artifact.read',{turn_id:a.turnId,action_id:a.actionId})
    }),
    conversations:({before,limit}={})=>operation(()=>page('conversation.list',
      {...(before===undefined?{}:{before}),...(limit===undefined?{}:{limit})},
      ['conversation_id','latest_turn_id','cursor','last_active_at','text_preview','reply_preview'])),
    turns:({conversationId,before,limit}={})=>operation(()=>validId(conversationId)?page('conversation.turns',
      {conversation_id:conversationId,...(before===undefined?{}:{before}),...(limit===undefined?{}:{limit})},
      ['id','conversation_id','cursor','text_preview','reply_preview','state','temporary','has_actions','created_at']):fail('invalid_request')),
    task:input=>captured(input,async input=>{const r=await taskBinding(input);return r.ok?{ok:true,result:{
      turnId:r.result.turn.id,task:r.result.action.task,events:r.result.action.events,
      activity:projectActivity({turn:r.result.turn})}}:r}),
    result:input=>captured(input,async input=>{
      const r=await taskBinding(input);if(!r.ok)return r
      const controller=createResultController({host})
      try{return await controller.open({turn:r.result.turn,taskId:input.taskId})}finally{controller.dispose()}
    }),
    start:input=>run(input),local:input=>run({...input,kind:'local'}),
    stop,reconcile:input=>run({...input,kind:'reconcile'}),send,cancelSend,
  })
}
