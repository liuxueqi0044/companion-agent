import {boundedMerge,clone,createState,fail,pick,request,validId} from './state.mjs'

const META = ['schema_version','tool_version','requirements_interpretation','headers',
  'currency_subtotals','total','total_currency','completeness','source_rule']
const ROW = ['record_index','cells','source_refs','subtotal','currency','formula']
const ISSUE = ['code','column','record_index','source']
const nonnegative = value => Number.isSafeInteger(value) && value >= 0

export function createResultController({host}) {
  if (!host || typeof host.request !== 'function') throw new TypeError('trusted_host_required')
  const state=createState({active:true,turnId:null,taskId:null,attemptId:null,metadata:null,
    rows:[],issues:[],nextOffset:null,nextIssueOffset:null,loading:false,loadingRows:false,
    loadingIssues:false,error:null,truncatedRows:false,truncatedIssues:false})
  let generation=0,rowSeq=0,issueSeq=0,rowFlight=null,issueFlight=null
  const snapshot=state.snapshot,subscribe=state.subscribe
  function parse(page,taskId,attemptId,offset,issueOffset) {
    if (page?.task_id!==taskId || page.attempt_id!==attemptId || page.status!=='completed' ||
      !Array.isArray(page.rows) || page.rows.length>50 || !Array.isArray(page.issues) ||
      page.issues.length>50 || !page.metadata || typeof page.metadata!=='object') return null
    for (const [next,start,items] of [[page.next_offset,offset,page.rows],
      [page.next_issue_offset,issueOffset,page.issues]]) {
      if (next!==null && (!nonnegative(next) || next!==start+items.length || !items.length)) return null
    }
    return {metadata:pick(page.metadata,META),rows:page.rows.map(item=>pick(item,ROW)),
      issues:page.issues.map(item=>pick(item,ISSUE)),nextOffset:page.next_offset,
      nextIssueOffset:page.next_issue_offset}
  }
  async function open({turn,taskId}={}) {
    if (state.disposed) return fail('disposed')
    const action=turn?.actions?.find(item=>item.kind==='csv.audit' && item.state==='accepted' &&
      item.task?.task_id===taskId && item.task?.status==='completed')
    const attemptId=action?.task?.current_attempt_id
    if (!validId(turn?.id) || !validId(taskId) || !validId(attemptId)) return fail('result_not_ready')
    const own=++generation
    rowSeq++;issueSeq++
    state.publish({active:true,turnId:turn.id,taskId,attemptId,metadata:null,rows:[],issues:[],
      nextOffset:null,nextIssueOffset:null,loading:true,loadingRows:false,loadingIssues:false,
      error:null,truncatedRows:false,truncatedIssues:false})
    const reply=await request(host,'task.result',{task_id:taskId,offset:0,limit:50,
      issue_offset:0,issue_limit:50},()=>!state.disposed && own===generation && snapshot().active)
    if (state.disposed || own!==generation || !snapshot().active) return fail('stale_view')
    if (!reply.ok) {state.publish({loading:false,error:reply.error});return reply}
    const parsed=parse(reply.result,taskId,attemptId,0,0)
    if (!parsed) {state.publish({loading:false,error:'protocol_error'});return fail('protocol_error')}
    state.publish({...parsed,loading:false,error:null})
    return {ok:true,result:snapshot()}
  }
  function load(kind) {
    if (state.disposed) return Promise.resolve(fail('disposed'))
    const current=snapshot(),rows=kind==='rows'
    const offset=rows ? current.nextOffset : current.nextIssueOffset
    if (!current.active || current.loading || !current.taskId || offset===null)
      return Promise.resolve(fail('no_more_pages'))
    const prior=rows ? rowFlight : issueFlight
    if (prior?.offset===offset && prior.generation===generation) return prior.flight
    const own=rows ? ++rowSeq : ++issueSeq, ownGeneration=generation
    const rowOffset=rows ? offset : current.nextOffset ?? 0
    const issueOffset=rows ? current.nextIssueOffset ?? 0 : offset
    const flight=Promise.resolve().then(()=>request(host,'task.result',{task_id:current.taskId,offset:rowOffset,
      limit:rows ? 50 : 1,issue_offset:issueOffset,issue_limit:rows ? 1 : 50},
      ()=>!state.disposed && ownGeneration===generation && own===(rows ? rowSeq : issueSeq) &&
        snapshot().active)).then(reply=>{
      if (state.disposed || ownGeneration!==generation || own !== (rows ? rowSeq : issueSeq) ||
        !snapshot().active) return fail('stale_view')
      if (!reply.ok) {state.publish(rows ? {loadingRows:false,error:reply.error}
        : {loadingIssues:false,error:reply.error});return reply}
      const parsed=parse(reply.result,current.taskId,current.attemptId,rowOffset,issueOffset)
      if (!parsed) {state.publish(rows ? {loadingRows:false,error:'protocol_error'}
        : {loadingIssues:false,error:'protocol_error'});return fail('protocol_error')}
      if (rows) {
        const merged=boundedMerge(snapshot().rows,parsed.rows,'record_index',500)
        state.publish({rows:merged.items,nextOffset:merged.truncated ? null : parsed.nextOffset,
          truncatedRows:merged.truncated,loadingRows:false,error:null})
      } else {
        const old=snapshot().issues
        const items=[...old,...parsed.issues].slice(0,500)
        const truncated=old.length+parsed.issues.length>500
        state.publish({issues:items,nextIssueOffset:truncated ? null : parsed.nextIssueOffset,
          truncatedIssues:truncated,loadingIssues:false,error:null})
      }
      return {ok:true,result:snapshot()}
    }).finally(()=>{if(rows && rowFlight?.flight===flight)rowFlight=null
      if(!rows && issueFlight?.flight===flight)issueFlight=null})
    if(rows)rowFlight={offset,generation:ownGeneration,flight}
    else issueFlight={offset,generation:ownGeneration,flight}
    state.publish(rows ? {loadingRows:true,error:null} : {loadingIssues:true,error:null})
    return flight
  }
  const loadMoreRows=()=>load('rows'),loadMoreIssues=()=>load('issues')
  function invalidate() {
    if (state.disposed) return
    generation++;rowSeq++;issueSeq++
    state.publish({turnId:null,taskId:null,attemptId:null,metadata:null,rows:[],issues:[],
      nextOffset:null,nextIssueOffset:null,loading:false,loadingRows:false,loadingIssues:false,
      error:null,truncatedRows:false,truncatedIssues:false})
  }
  function deactivate() {invalidate();state.publish({active:false})}
  function dispose() {generation++;rowSeq++;issueSeq++;state.dispose()}
  return {snapshot,subscribe,open,loadMoreRows,loadMoreIssues,invalidate,deactivate,dispose}
}
