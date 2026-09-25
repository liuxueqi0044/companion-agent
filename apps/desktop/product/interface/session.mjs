/** One presentation session per mounted UI; the execution runtime is shared. */
import {fail} from '../application/state.mjs'

export const SCOPES=Object.freeze(['conversation','tasks','memory','preferences','inbox','reminders','window'])
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k))
export async function createInterfaceSession({runtime,scopes=SCOPES,onChange=()=>{}}){
  const app=runtime.createView(),allowed=new Set(scopes)
  let closed=false,busy=false,ownSend=null,refreshFlight=null
  const own=()=>!closed
  const commands=new Map()
  const add=(name,scope,keys,fn,concurrent=false)=>commands.set(name,{scope,keys,fn,concurrent})
  add('snapshot',null,[],()=>({ok:true}),true)
  add('open',null,['panel','turnId','conversationId'],args=>{
    const needed={conversation:'conversation',memory:'memory',contact:'preferences',inbox:'inbox',reminders:'reminders'}[args.panel]
    return needed&&!allowed.has(needed)?fail('scope_denied'):app.open(args)
  })
  add('refresh',null,[],()=>app.refresh())
  add('conversation.list','conversation',[],async()=>{const r=await runtime.resources.conversations();return r.ok?{ok:true,result:r.result.items}:r},true)
  add('conversation.turns','conversation',['id'],async a=>{const r=await runtime.resources.turns({conversationId:a.id});return r.ok?{ok:true,result:r.result.items}:r},true)
  add('turn.read','conversation',['turnId'],a=>runtime.resources.turn(a),true)
  add('turns.read','conversation',['conversationId','before','limit'],a=>runtime.resources.turns(a),true)
  add('conversations.read','conversation',['before','limit'],a=>runtime.resources.conversations(a),true)
  add('send','conversation',['command_id','conversation_id','text','csv_text','temporary'],async a=>{
    const resultFlight=runtime.send(a);ownSend=a.command_id;onChange()
    const r=await resultFlight
    if(own()&&(r.ok||r.submission==='confirmed'))await app.open({panel:'conversation',turnId:a.command_id})
    if(ownSend===a.command_id)ownSend=null
    return r
  },true)
  add('send.cancel','conversation',['commandId'],a=>runtime.cancelSend(a),true)
  add('send.reconcile','conversation',[],()=>runtime.ui.conversation.replaySubmit())
  add('task.read','tasks',['turnId','taskId','attemptId'],a=>runtime.resources.task(a),true)
  add('task.result','tasks',['turnId','taskId','attemptId'],a=>runtime.resources.result(a),true)
  add('artifact.read','tasks',['turnId','actionId','download'],a=>runtime.resources.artifact(a),true)
  add('tools.list','tasks',[],()=>runtime.resources.tools(),true)
  add('tools.read','tasks',['toolId'],a=>runtime.resources.tool(a),true)
  add('tools.manage','tasks',['command_id','tool_id','expected_revision','operation','version'],a=>runtime.resources.manageTool(a))
  add('work.start','conversation',['turnId'],a=>runtime.resources.start(a),true)
  add('work.local','tasks',['turnId'],a=>runtime.resources.local(a),true)
  add('work.stop','tasks',['turnId','runId'],a=>runtime.resources.stop(a),true)
  add('work.reconcile','tasks',['turnId','runId'],a=>runtime.resources.reconcile(a),true)
  add('result.open','tasks',['turnId','taskId'],async a=>{
    // Compatibility view for the default UI. Its selection belongs to this mount only.
    const r=await app.open({panel:'conversation',turnId:a.turnId})
    return r.ok&&own()?app.result.open({taskId:a.taskId}):r
  })
  add('result.rows','tasks',['taskId'],a=>app.result.snapshot().taskId===a.taskId?app.result.loadMoreRows():fail('stale_view'))
  add('policy.memory','preferences',['expectedRevision','patch'],a=>app.policy.updateMemory(a))
  add('policy.contact','preferences',['expectedRevision','patch'],a=>app.policy.updateContact(a))
  add('memory.refresh','memory',[],()=>app.memory.refresh())
  add('memory.add','memory',['content','category'],a=>app.memory.add(a))
  for(const [name,keys,method] of [['memory.edit',['id','content'],a=>app.memory.edit({content:a.content})],['memory.forget',['id'],()=>app.memory.forget()]])
    add(name,'memory',keys,async a=>{const r=await app.memory.select({id:a.id});return r.ok&&own()?method(a):r})
  add('memory.clear','memory',['confirmed','expectedPolicyRevision'],a=>app.memory.clear(a))
  add('inbox.read','inbox',['id'],a=>app.inbox.markRead(a))
  add('inbox.explain','inbox',['id'],async a=>{const r=await app.inbox.select({id:a.id});return r.ok&&own()?app.inbox.explainSelected():r})
  add('reminders.create','reminders',['text','due_at'],a=>app.reminders.create(a))
  add('reminders.cancel','reminders',['id'],async a=>{const r=await app.reminders.select({id:a.id});return r.ok&&own()?app.reminders.cancel():r})
  function snapshot(){
    const value=app.snapshot(),runner=runtime.resources.execution(),meta=runtime.snapshot().runtime
    const selected=value.conversation?.selectedTurnId??ownSend
    value.runtime=meta
    value.execution=allowed.has('tasks')||allowed.has('conversation')?runner:null
    value.work=selected&&runner.turnId===selected?{available:true,selected:true,...runner}:{available:true,selected:false}
    if(!allowed.has('conversation')){value.conversation=null;value.activity=null;value.runtime={...meta,send:null}}
    if(!allowed.has('tasks')){value.work={available:false,selected:false};value.result=null;value.activity=null}
    for(const key of ['memory','inbox','reminders'])if(!allowed.has(key))value[key]=null
    if(!allowed.has('preferences'))value.policy=null
    return value
  }
  const offApp=app.subscribe(onChange)
  // Read-only refreshes after runner transitions; never resubmit/retry a command.
  let lastKey=null
  const offRuntime=runtime.subscribe(()=>{
    onChange()
    const runner=runtime.resources.execution(),key=JSON.stringify([runner.runId,runner.phase,runner.activity])
    if(key===lastKey)return;lastKey=key
    const current=app.conversation.snapshot()
    if(!closed&&!refreshFlight&&current.turn?.id===runner.turnId&&!current.loading){
      refreshFlight=app.conversation.refreshSelected().finally(()=>{refreshFlight=null})
    }
  })
  const boot=await app.initialize()
  if(!boot.ok){offApp();offRuntime();app.dispose();throw Error('interface_initialize_failed')}
  return {snapshot,async call(action,args={}){
    if(closed)return fail('interface_revoked')
    const spec=commands.get(action)
    if(!spec||!exact(args,spec.keys))return fail('invalid_request')
    if(spec.scope&&!allowed.has(spec.scope))return fail('scope_denied')
    if(!spec.concurrent&&busy)return fail('management_busy')
    if(!spec.concurrent)busy=true
    try{const r=await spec.fn(structuredClone(args));return closed?fail('interface_revoked'):r}
    catch{return fail('internal_error')}
    finally{if(!spec.concurrent)busy=false;onChange()}
  },dispose(){if(closed)return;closed=true;offApp();offRuntime();app.dispose()}}
}
