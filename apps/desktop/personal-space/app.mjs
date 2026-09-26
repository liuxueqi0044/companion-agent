import {createApp,h,ref,computed,onMounted,onUnmounted,nextTick,watch} from 'vue'
import {createClient} from '@morrow/sdk'
import {presentActivity,currentStop,visibleDraft} from './activity.mjs'
import {createAppearanceStore} from './appearance.mjs'
import {initialStarter} from './starter-config.mjs'
import {renderStarter,appearanceGallery} from './starters.mjs'

const paths={spark:'M12 2l2.5 6.8L22 12l-7.5 2.7L12 22l-2.6-7.3L2 12l7.4-3.2Z',
 arrow:'M5 12h14m-6-6 6 6-6 6',send:'m6 12 6-7 6 7m-6-6v14',close:'m6 6 12 12M6 18 18 6',
 plus:'M12 5v14M5 12h14',chevron:'m9 6 6 6-6 6',back:'m15 6-6 6 6 6',
 history:'M3 11a9 9 0 1 1 2 7M3 4v7h7m2-4v6l4 2',bell:'M5 16V10a7 7 0 0 1 14 0v6l2 3H3Zm5 6h4',
 memory:'M9 3a4 4 0 0 0-6 5 4 4 0 0 0 0 8 4 4 0 0 0 6 5V3Zm6 0a4 4 0 0 1 6 5 4 4 0 0 1 0 8 4 4 0 0 1-6 5V3M6 9h3m6 6h3',
 leaf:'M20 3C5 1 0 14 7 18s16-2 13-15ZM5 21 16 9',paper:'M8 3h7l5 5v13H4V3Zm7 0v6h5M8 13h8m-8 4h5',
 attach:'m9 12 6-6a3 3 0 0 1 4 4l-9 9a5 5 0 0 1-7-7l9-9',
 check:'m5 12 4 4L19 6',stop:'M6 6h12v12H6Z',more:'M5 12h.1M12 12h.1M19 12h.1',
 edit:'m4 16 12-12 4 4L8 20H4Zm10-10 4 4',trash:'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
 moon:'M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12',settings:'M5 6h14M5 12h14M5 18h14M9 3v6m6 0v6m-6 0v6',
 link:'m9 15 6-6M8 17l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 10a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1',
 download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5'}
const icon=(name,size=20)=>h('svg',{width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'},[h('path',{d:paths[name]??paths.spark})])
const btn=(label,action,props={},children=null)=>h('button',{type:'button',onClick:action,...props},children??label)
const field=(label,node,hint)=>h('label',{class:'field'},[h('span',label),node,hint?h('small',hint):null])
const para=text=>h('p',{class:'muted'},text)
const formatTime=value=>{try{return new Intl.DateTimeFormat('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value))}catch{return '时间待核对'}}
const errors={model_not_configured:'还没有连接模型。你的输入已保存。',provider_failed:'这次回应没有成功，请查看连接状态后再试。',
 workflow_waiting:'上一步还没有确认完成，请先核对实际状态。',workflow_checkpoint:'已保存进度，可以从当前结果继续。',workflow_step_limit:'这项任务的步骤较多，请基于已有结果开始一段新对话。',goal_no_progress:'连续几次未能推进目标，已保存进度。可以先查看失败原因，再决定是否继续。',goal_review_evidence_mismatch:'验收引用的成果与当前任务不符，请核对任务记录。',repeated_action:'模型重复提出了已经做过的写入，已停下，原成果仍保留。',superseded_turn:'这一步之后已有新的输入，请在新对话中继续。',
 tool_example_failed:'这个工具没有通过样例验证，未保存。可以让 AI 修改后再试。',tool_query_rejected:'这个工具无法处理当前输入，请检查列名、参数或修改工具。',tool_query_limit:'工具已达到本次计算限制，未继续执行。',tool_revision_conflict:'工具版本已改变，请重新选择最新版本。',tool_disabled:'这个工具已停用。',tool_parameters_invalid:'工具参数不完整或类型不匹配。',
 credential_rejected:'模型密钥未通过验证。',provider_insufficient_balance:'DeepSeek 账户余额不足。',provider_rate_limited:'模型服务暂时繁忙，请稍后再试。',
 transport_unavailable:'本地连接中断。操作结果可能尚未确认，请先重新连接并核对。',
 ledger_locked:'请求记录正在被另一项操作使用，请稍后再试。',ledger_invalid:'本地请求记录需要核对，已有对话仍然保留。',ledger_write_failed:'请求已结束，但本地记录未能确认保存，请先核对状态。',
 request_in_progress:'另一条模型请求尚未确认结束，请先核对连接状态。',
 stale_view:'当前内容已经变化，请刷新后再操作。',revision_conflict:'设置已被更新，请检查最新内容。',
 management_busy:'正在保存另一项操作，请稍候。',runner_busy:'还有一件事正在处理，请等它结束或先停止。',
 outcome_unknown:'操作结果待核对，不会自动重复执行。',reconciliation_required:'请先核对上一次操作的结果。',
 submit_pending_reconciliation:'上一次输入是否保存尚待核对，请先核对它。',provider_timeout:'等待模型回应超时，这次没有自动重试。',
 invalid_request:'这些内容暂时无法保存，请检查输入。',send_cancelled:'已停止继续处理；已经保存的输入会保留。',
 session_required:'连接已过期，请重新打开这个页面。',provider_invalid_output:'模型返回的格式无法使用，本次没有继续执行。',
 space_preview_required:'请先等预览完成，再启用这个版本。',space_preview_expired:'预览已过期，请重新打开。',
 space_generation_interrupted:'上次改版被服务重启打断了，原来的空间仍然保留。',space_html_format:'这次代码的页面格式不符合要求，原来的空间未改变。',
 space_js_syntax:'这次生成的交互代码有语法错误，原来的空间未改变。',space_external_resource:'生成的页面引用了外部资源，未开放预览。',
 space_save_failed:'新版本未能保存，当前空间未改变。',space_state_write_failed:'界面状态保存失败，请先核对当前版本。',
 space_state_invalid:'改版记录需要修复，已保留原文件并使用初始界面。聊天和记忆仍可正常使用。',
 space_revision_missing:'这个界面版本已经不可用。',space_no_previous:'还没有可以回退的版本。',provider_aborted:'这次改版已停止。'}
const eventLabel={submitted:'任务已保存',started:'开始核对材料',completed:'计算结果已保存',cancel_requested:'已请求停止',cancelled:'任务已取消',failed:'任务未完成',interrupted:'执行中断',retried:'重新开始'}
const columnLabel={item:'品名',unit:'单位',qty:'数量',unit_price:'单价',currency:'币种'}
const sourceLabel=value=>{const match=/^csv:record:\d+:column:.+:physical-lines:(\d+)-(\d+)$/.exec(value??'');return match?`原表第 ${match[1]===match[2]?match[1]:`${match[1]}–${match[2]}`} 行`:'来源待核对'}

createApp({setup(){
  const state=ref(null),connected=ref(true),panel=ref(null),draft=ref(''),attachment=ref(null),temporary=ref(false)
  const sending=ref(false),pendingMessage=ref(null),working=ref(false),toast=ref(null),records=ref([]),conversations=ref([])
  const conversationId=ref(crypto.randomUUID()),selectedTurn=ref(null),fileInput=ref(null),composer=ref(null),drawer=ref(null)
  const memoryText=ref(''),memoryCategory=ref('preferences'),editing=ref(null),editText=ref(''),styleText=ref('')
  const reminderText=ref(''),reminderDate=ref(''),contactForm=ref(null),resultVisible=ref(false)
  const toolItems=ref([]),toolDetail=ref(null),theme=ref(initialStarter),composerOptions=ref(false)
  let fileGeneration=0,previousFocus=null,toastTimer=null,client=null,navigationIntent=0
  let savedSelection=null,draftRevision=0,draftHydrated=false,draftFlight=Promise.resolve()
  const view=computed(()=>state.value?.view),policy=computed(()=>view.value?.policy?.policy)
  const connection=computed(()=>state.value?.connection)
  const busy=computed(()=>sending.value||!!view.value?.runtime.executionBusy)
  const chatRecords=computed(()=>records.value.filter(row=>row.conversation_id===conversationId.value))
  const name=computed(()=>view.value?.home?.profile.preferences.ai_name||'我的 AI')
  const notify=(text,error=false)=>{clearTimeout(toastTimer);toast.value={text,error};toastTimer=setTimeout(()=>{toast.value=null},error?10000:4500)}
  function accept(snapshot){
    const restarted=state.value?.epoch&&snapshot.epoch!==state.value.epoch
    state.value=snapshot
    const turn=snapshot.view.conversation?.turn
    if(turn){
      if(!records.value.length){conversationId.value=turn.conversation_id;temporary.value=!!turn.temporary}
      const idx=records.value.findIndex(item=>item.id===turn.id);if(idx<0)records.value.push({...turn});else records.value[idx]={...records.value[idx],...turn,preview:false};selectedTurn.value=turn.id
      if(!turn.temporary)savedSelection=turn.id
    }
    if(restarted&&!turn&&selectedTurn.value&&!panel.value&&!snapshot.view.runtime.executionBusy){
      const turnId=selectedTurn.value,intent=navigationIntent
      queueMicrotask(()=>{if(intent===navigationIntent)void call('open',{panel:'conversation',turnId})})
    }
  }
  client=createClient({onSnapshot:accept,onConnection:value=>{connected.value=value}})
  const appearance=createAppearanceStore({state:client.state,initial:initialStarter,onChange:id=>{theme.value=id},onError:()=>notify('外观已切换，但未能保存偏好。重新打开后可能恢复之前的样子。',true)})
  async function call(action,args={},success){
    if(['work.stop','work.reconcile'].includes(action))args={...args,runId:view.value?.work?.runId}
    working.value=true
    try{
      const result=await client.call(action,args)
      if(!result.ok)notify(errors[result.error]||`暂时没能完成这一步（${result.error}）`,true)
      else if(success)notify(success)
      return result
    }finally{working.value=false}
  }
  async function openPanel(target){
    navigationIntent++
    previousFocus=document.activeElement;panel.value=target;resultVisible.value=false;editing.value=null
    if(['memory','contact','inbox','reminders'].includes(target)){
      const result=await call('open',{panel:target})
      if(result.ok&&target==='contact')contactForm.value={...policy.value}
    }else if(target==='history'){
      const result=await call('conversation.list');if(result.ok)conversations.value=result.result
    }else if(target==='tools'){
      toolDetail.value=null
      const own=navigationIntent,result=await call('tools.list');if(result.ok&&own===navigationIntent&&panel.value==='tools')toolItems.value=result.result
    }
    await nextTick();drawer.value?.querySelector('button')?.focus()
  }
  async function closePanel(){
    const old=panel.value;panel.value=null;resultVisible.value=false;editing.value=null
    if(['memory','contact','inbox','reminders'].includes(old))await call('open',selectedTurn.value?
      {panel:'conversation',turnId:selectedTurn.value}:{panel:'home'})
    await nextTick();if(previousFocus?.isConnected)previousFocus.focus();else composer.value?.focus()
  }
  async function newConversation(){
    if(busy.value)return notify('先让正在做的事结束，或停止它。')
    navigationIntent++;savedSelection=null
    await call('open',{panel:'home'});conversationId.value=crypto.randomUUID();selectedTurn.value=null;panel.value=null;draft.value='';attachment.value=null
    await nextTick();composer.value?.focus()
  }
  async function loadConversation(item){
    if(busy.value)return notify('当前还有任务在进行，稍后再切换对话。')
    navigationIntent++
    const result=await call('conversation.turns',{id:item.conversation_id})
    if(!result.ok)return
    conversationId.value=item.conversation_id
    const prior=new Map(records.value.map(row=>[row.id,row]))
    records.value=[...records.value.filter(row=>row.conversation_id!==item.conversation_id),...result.result.slice().reverse().map(row=>prior.get(row.id)??{id:row.id,conversation_id:item.conversation_id,text:row.text_preview,reply:row.reply_preview,state:row.state,preview:true})]
    const selected=await call('open',{panel:'conversation',turnId:item.latest_turn_id})
    if(selected.ok){temporary.value=!!view.value?.conversation?.turn?.temporary;panel.value=null}
  }
  async function send(){
    if(!draft.value.trim()||busy.value||!connected.value)return
    navigationIntent++
    const text=draft.value,id=crypto.randomUUID()
    const input={command_id:id,conversation_id:conversationId.value,text,csv_text:attachment.value?.text??null,temporary:temporary.value}
    sending.value=true;pendingMessage.value=id
    records.value.push({id,conversation_id:conversationId.value,text,state:'saving',attachment:attachment.value?.name})
    const result=await client.call('send',input)
    sending.value=false;pendingMessage.value=null
    if(result.submission==='not_sent')records.value=records.value.filter(record=>record.id!==id)
    if(result.ok||result.submission==='confirmed'){if(draft.value===text)draft.value='';attachment.value=null;fileGeneration++}
    if(!result.ok)notify(result.error==='invalid_request'&&result.submission==='confirmed'?'模型的行动建议没有通过校验，这次没有继续执行。':errors[result.error]||`这次处理暂未完成（${result.error}）`,true)
    if(result.error==='transport_unavailable')notify('连接中断，输入可能已经保存。请从历史记录或核对入口确认，不要重复发送。',true)
    const nearEnd=document.documentElement.scrollHeight-window.innerHeight-window.scrollY<240
    await nextTick();if(nearEnd)document.querySelector('.conversation-end')?.scrollIntoView({block:'nearest'})
  }
  async function attach(event){
    const own=++fileGeneration,file=event.target.files?.[0];event.target.value=''
    if(!file)return
    if(!file.name.toLowerCase().endsWith('.csv')||file.size>256*1024)return notify('请选择不超过 256 KB 的 CSV 文件。',true)
    try{const text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());if(own===fileGeneration)attachment.value={name:file.name,text}}
    catch{notify('请使用 UTF-8 编码的 CSV 文件。',true)}
  }
  async function toggleMemory(){
    const result=await call('policy.memory',{expectedRevision:policy.value.revision,patch:{memory_enabled:!policy.value.memory_enabled}})
    if(result.ok)notify(policy.value.memory_enabled?'记忆已开启。':'记忆已关闭；你仍可以查看和管理已有内容。')
  }
  async function addMemory(){
    if(!memoryText.value.trim())return
    const result=await call('memory.add',{content:memoryText.value,category:memoryCategory.value},'记住了。')
    if(result.ok){memoryText.value='';await call('memory.refresh')}
  }
  async function editMemory(item){
    const result=await call('memory.edit',{id:item.id,content:editText.value},'已更新这条记忆。')
    if(result.ok)editing.value=null
  }
  async function forget(item){if(confirm('忘记这条记忆？删除后，不会再从相同来源自动学回。'))await call('memory.forget',{id:item.id},'已经忘记这条记忆。')}
  async function contactSave(){
    const p=contactForm.value
    const patch=Object.fromEntries(['proactive_enabled','timezone','start_minute','end_minute','daily_limit','topics'].map(k=>[k,p[k]]))
    const result=await call('policy.contact',{expectedRevision:policy.value.revision,patch},'联系偏好已保存。')
    if(result.ok)contactForm.value={...policy.value}
  }
  async function openResult(turnId=selectedTurn.value){
    if(view.value?.activity?.turnId!==turnId){const opened=await call('open',{panel:'conversation',turnId});if(!opened.ok)return}
    const activity=view.value?.activity
    if(!activity?.taskId)return
    const result=await call('result.open',{taskId:activity.taskId,turnId:activity.turnId})
    if(result.ok){previousFocus=document.activeElement;panel.value='result';resultVisible.value=true;await nextTick();drawer.value?.querySelector('button')?.focus()}
  }
  function downloadResult(){
    const result=view.value.result,blob=new Blob([JSON.stringify({metadata:result.metadata,rows:result.rows,issues:result.issues,
      partial:result.nextOffset!==null||result.nextIssueOffset!==null},null,2)],{type:'application/json'})
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='核对结果.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  function input(value,set,props={}){return h('input',{value,onInput:e=>set(e.target.value),...props})}
  function switchButton(on,action,label,disabled=false){return btn(label,action,{class:['switch',on?'on':''],role:'switch','aria-checked':on,'aria-label':label,disabled},h('span'))}
  function menuItem(symbol,title,description,action){return btn(title,action,{class:'menu-row'},[h('span',{class:'menu-icon'},icon(symbol)),h('span',[h('strong',title),h('small',description)]),icon('chevron',16)])}
  function empty(title,subtitle,symbol='leaf'){return h('div',{class:'empty'},[icon(symbol,28),h('h3',title),para(subtitle)])}
  function memoryPanel(){if(view.value?.memory.loading&&!view.value.memory.items.length)return [para('正在读取你的记忆…')];return [
    h('div',{class:'setting-top'},[h('div',[h('h3','让记忆慢慢长出来'),para('记住重要的事，也随时听你纠正。')]),switchButton(!!policy.value?.memory_enabled,toggleMemory,'长期记忆',working.value)]),
    h('div',{class:'soft-note'},policy.value?.memory_enabled?'只有有用的长期信息才会留下。你可以编辑、忘记，或随时关闭。':'记忆已关闭。已有内容保留，暂不用于对话；你仍可以在这里管理。'),
    h('div',{class:'section-label'},['已经记住的',h('span',String(view.value?.memory.items.length??0))]),
    ...(view.value?.memory.items.length?view.value.memory.items.map(item=>h('article',{class:'memory-item',key:item.id},[
      h('div',{class:'item-meta'},[h('span',({preferences:'偏好',work:'工作',goals:'目标'})[item.category]??item.category),h('span',item.source_id?.startsWith('manual:')?'由你直接写入':'来自我们的对话')]),
      editing.value===item.id?h('div',[h('textarea',{value:editText.value,onInput:e=>{editText.value=e.target.value},rows:3,'aria-label':'编辑记忆'}),h('div',{class:'inline-actions'},[btn('取消',()=>{editing.value=null},{class:'text-button'}),btn('保存',()=>editMemory(item),{class:'primary small',disabled:working.value})])]):h('p',{class:'memory-content'},item.content),
      editing.value!==item.id?h('div',{class:'item-actions'},[btn('编辑',()=>{editing.value=item.id;editText.value=item.content},{class:'text-button'},[icon('edit',14),'编辑']),btn('忘记',()=>forget(item),{class:'text-button'},[icon('trash',14),'忘记'])]):null,
    ])):[empty('这里还没有记忆','告诉我一个偏好，或者直接在下面写下来。')]),
    h('div',{class:'add-memory'},[h('h3','也可以直接告诉我'),h('textarea',{value:memoryText.value,onInput:e=>{memoryText.value=e.target.value},rows:3,placeholder:'比如：我喜欢直接一点的回答。','aria-label':'新增记忆'}),
      h('div',{class:'inline-actions spread'},[h('select',{value:memoryCategory.value,onChange:e=>{memoryCategory.value=e.target.value},'aria-label':'记忆类别'},['preferences','work','goals'].map(v=>h('option',{value:v},({preferences:'偏好',work:'工作',goals:'目标'})[v]))),btn('记住这件事',addMemory,{class:'primary small',disabled:working.value||!memoryText.value.trim()})])]),
    view.value?.memory.unknown?h('p',{class:'error-text'},'上次修改的结果待核对。请先刷新查看，不要重复保存。'):null,
  ]}
  function contactPanel(){
    const p=contactForm.value;if(!p)return [para('正在读取联系偏好…')]
    const minutes=t=>{const [a,b]=t.split(':').map(Number);return a*60+b}
    const time=m=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`
    const offset=-new Date().getTimezoneOffset(),localZone=`UTC${offset>=0?'+':'-'}${String(Math.floor(Math.abs(offset)/60)).padStart(2,'0')}:${String(Math.abs(offset)%60).padStart(2,'0')}`
    return [h('div',{class:'setting-top'},[h('div',[h('h3','偶尔，主动来找你'),para('有值得关心的事，再轻轻问候。')]),switchButton(p.proactive_enabled,()=>{p.proactive_enabled=!p.proactive_enabled},'允许主动联系')]),
      para('开启后，AI 可以结合后续互动决定是否、何时联系。你可以随时关闭，不回复也不会被反复追问。'),
      h('div',{class:'soft-note'},state.value?.capabilities.backgroundContact?'保持 Morrow 在托盘运行，即可在合适的时候收到问候。普通聊天不会预告时间。':'当前服务未启用后台调度。联系偏好仍会保存。'),
      field('我方便被联系的时间',h('div',{class:'time-pair'},[input(time(p.start_minute),v=>{p.start_minute=minutes(v)},{type:'time','aria-label':'开始时间'}),h('span','—'),input(time(p.end_minute),v=>{p.end_minute=minutes(v)},{type:'time','aria-label':'结束时间'})])),
      field('时区',h('select',{value:p.timezone,onChange:e=>{p.timezone=e.target.value}},[...new Set([p.timezone,localZone,'UTC'])].map(v=>h('option',{value:v},v===localZone?`${v} · 本机当前偏移`:v)))),
      field('每天最多几次',input(p.daily_limit,v=>{p.daily_limit=Number(v)},{type:'number',min:1,max:20})),
      field('可以关心的话题',h('div',{class:'topic-list'},['work','daily','wellbeing'].map(topic=>h('label',[h('input',{type:'checkbox',checked:p.topics.includes(topic),onChange:e=>{p.topics=e.target.checked?[...p.topics,topic]:p.topics.filter(v=>v!==topic)}}),({work:'工作与进展',daily:'日常生活',wellbeing:'我的近况'})[topic]])))),
      btn('保存联系偏好',contactSave,{class:'primary full',disabled:working.value}),
      menuItem('bell','我明确交办的提醒','与 AI 自主问候分开管理',()=>openPanel('reminders'))]
  }
  function inboxPanel(){const items=view.value?.inbox.items??[];return [
    para('你们一起做过的事，以及已经送达的消息。'),
    ...(items.length?[...items].reverse().map(item=>h('article',{class:['inbox-item',!item.read?'unread':''],key:item.id},[
      h('div',{class:'item-meta'},[h('span',({proactive:'来自我的 AI',reminder:'你的提醒',task:'任务近况'})[item.kind]??'近况'),h('time',formatTime(item.created_at))]),h('p',item.text),
      h('div',{class:'item-actions'},[!item.read?btn('标为已读',()=>call('inbox.read',{id:item.id}),{class:'text-button'}):h('span',{class:'subtle'},'已读'),
        btn('为什么收到这条',async()=>{const r=await call('inbox.explain',{id:item.id});if(r.ok)notify(({opt_in_and_model_reassessment:'你允许了主动联系，AI 在发送前重新判断了是否合适。',user_requested_work:'这是你明确交办的提醒或任务回执。'})[r.result.basis]??'这条消息来自已记录的任务或提醒。')},{class:'text-button'})])])):[empty('近况会留在这里','任务完成后，或收到消息时，都可以回来看看。','bell')])
  ]}
  function remindersPanel(){return [para('只安排你明确交办的提醒。当前版本不会在应用退出后唤醒设备。'),
    ...(view.value?.reminders.items??[]).map(item=>h('article',{class:'memory-item',key:item.id},[h('p',item.text),h('div',{class:'item-meta'},[h('span',formatTime(item.due_at)),h('span',({pending:'已安排',sent:'已送达',missed:'已错过',cancelled:'已取消'})[item.state]??item.state)]),item.state==='pending'?btn('取消提醒',()=>call('reminders.cancel',{id:item.id},'提醒已取消。'),{class:'text-button'}):null])),
    h('div',{class:'add-memory'},[field('提醒内容',input(reminderText.value,v=>{reminderText.value=v},{placeholder:'有什么需要我提醒你？'})),field('时间',input(reminderDate.value,v=>{reminderDate.value=v},{type:'datetime-local'})),btn('保存提醒',async()=>{if(!reminderDate.value||!reminderText.value.trim())return;const r=await call('reminders.create',{text:reminderText.value,due_at:new Date(reminderDate.value).toISOString()},'提醒已保存；保持 Morrow 在后台运行即可到期接收。');if(r.ok){reminderText.value='';reminderDate.value=''}},{class:'primary full',disabled:working.value||!reminderText.value.trim()||!reminderDate.value})])
  ]}
  function resultPanel(){const r=view.value.result;return [
    h('div',{class:'result-summary'},[h('span','实际计算结果'),h('strong',r.metadata?.total!==null?`${r.metadata.total} ${r.metadata.total_currency??''}`:'按币种分别汇总'),h('small','来自本地 CSV 核对工具')]),
    r.metadata?.total===null?Object.entries(r.metadata.currency_subtotals??{}).map(([k,v])=>h('p',`${k}　${v}`)):null,
    h('div',{class:'soft-note'},'按 CSV 中的数量和单价逐行计算。文本中的额外业务规则尚未作语义核对。'),
    ...r.rows.map(row=>h('article',{class:'result-row',key:row.record_index},[h('div',{class:'item-meta'},[`第 ${row.record_index} 条记录`,h('strong',`${row.subtotal??'—'} ${row.currency??''}`)]),h('dl',Object.entries(row.cells).flatMap(([key,value])=>[h('dt',columnLabel[key]??key),h('dd',[value,h('small',{title:row.source_refs?.[key]},sourceLabel(row.source_refs?.[key]))])]))])),
    r.issues.length?h('div',{class:'soft-note'},`有 ${r.issues.length} 项需要核对：${r.issues.map(v=>v.code).join('、')}`):null,
    r.nextOffset!==null?btn('查看更多记录',()=>call('result.rows',{taskId:r.taskId}),{class:'secondary full'}):null,
    btn('导出当前已加载结果',downloadResult,{class:'primary full'},[icon('download',17),'导出当前已加载结果'])
  ]}
  function connectionPanel(){const c=connection.value;return [
    h('div',{class:'connection-card'},[h('div',{class:['connection-light',c?.configured?'ready':'']}),h('strong',c?.configured?'DeepSeek 已配置':'模型尚未连接'),h('p',c?.configured?c.model:'可以查看和管理本地内容。')]),
    para('你的密钥只在本地服务端使用，不会交给界面。模型可以接收你这次对话所需的上下文；临时对话不会使用长期记忆。'),
    c?.lastError?h('p',{class:'error-text'},errors[c.lastError]??'上一次模型请求未成功。'):null,
    h('div',{class:'soft-note'},state.value?.capabilities.backgroundContact?'保持本地服务运行，就能继续处理到期消息。界面的源码、预览与恢复位于“改变这里”。':'当前服务未开启后台消息；已有内容仍可查看。')
  ]}
  async function inspectTool(item){const own=navigationIntent,r=await call('tools.read',{toolId:item.id});if(r.ok&&own===navigationIntent&&panel.value==='tools')toolDetail.value=r.result}
  async function changeTool(operation,version){
    const item=toolDetail.value;if(!item)return
    const r=await call('tools.manage',{command_id:crypto.randomUUID(),tool_id:item.id,expected_revision:item.revision,operation,...(version?{version}:{})},'工具已更新')
    if(r.ok){await inspectTool(item);const list=await call('tools.list');if(list.ok)toolItems.value=list.result}
  }
  async function requestTool(item,edit=false){
    await closePanel()
    draft.value=edit?`请修改我的工具「${item.name}」（ID：${item.id}）。我希望：`:`请使用我的工具「${item.name}」（ID：${item.id}）。${item.parameters.map(p=>`${p.description}：`).join('；')}`
    await nextTick();composer.value?.focus()
  }
  function toolsPanel(){const item=toolDetail.value
    if(item)return [btn('返回工具列表',()=>{toolDetail.value=null},{class:'secondary small'}),h('h3',item.definition.name),para(item.definition.description),
      h('p',`版本 ${item.version} · ${item.enabled?'可使用':'已停用'} · ${item.validation.passed} 个样例通过`),
      h('div',{class:'activity-actions'},[btn(item.enabled?'停用':'启用',()=>changeTool(item.enabled?'disable':'enable'),{class:'secondary small',disabled:working.value}),btn('让 AI 修改',()=>requestTool({...item,...item.definition},true),{class:'secondary small'})]),
      h('details',[h('summary','查看工具逻辑与样例'),h('pre',{style:'white-space:pre-wrap;overflow-wrap:anywhere'},JSON.stringify(item.definition,null,2))]),
      h('h3','已有版本'),...item.versions.map(v=>btn(`版本 ${v.version}${v.version===item.version?' · 当前':' · 恢复'}`,()=>changeTool('restore',v.version),{class:'history-item',disabled:v.version===item.version||working.value}))]
    return [para('这些做法会留下来，下次换一份材料也能继续用。可以直接在聊天里让 AI 创建或调用。'),
      ...toolItems.value.map(t=>h('div',{class:'memory-item',key:t.id},[h('h3',t.name),para(t.description),h('small',`版本 ${t.version} · ${t.enabled?'可使用':'已停用'}`),
        h('div',{class:'activity-actions'},[btn('使用',()=>requestTool(t),{class:'secondary small',disabled:!t.enabled||busy.value}),btn('查看与管理',()=>inspectTool(t),{class:'secondary small'})])])),
      !toolItems.value.length?empty('把有用的做法留下来','试着说：帮我做一个去掉重复行的工具，以后还要用。','spark'):null]
  }
  function content(){
    if(panel.value==='appearance')return appearanceGallery({theme:theme.value,select:id=>appearance.select(id),recover:async()=>{await saveDraft();await appearance.settled();await client.host.openRecovery()}})
    if(panel.value==='about')return [h('div',{class:'identity'},[h('div',{class:'identity-mark'},icon('spark',32)),h('h3',name.value),para('记住你，也为你做些事。')]),
      menuItem('plus','新的对话','从一页空白开始',newConversation),
      menuItem('history','我们的对话','翻翻之前一起聊过的事',()=>openPanel('history')),
      menuItem('bell','近况','消息与任务留下的记录',()=>openPanel('inbox')),
      menuItem('memory','记忆',policy.value?.memory_enabled?'正在开启 · 你随时可以修改':'已经关闭',()=>openPanel('memory')),
      menuItem('bell','主动联系',policy.value?.proactive_enabled?'已允许 · 可以随时调整':'默认关闭 · 由你决定是否开启',()=>openPanel('contact')),
      menuItem('spark','我的工具','把有用的做法留下来',()=>openPanel('tools')),
      menuItem('leaf','改变这里','三个起点，和更多属于你的可能',()=>openPanel('appearance')),
      menuItem('link','模型与连接',connection.value?.configured?'DeepSeek · 本机服务':'尚未连接模型',()=>openPanel('connection')),
      h('p',{class:'panel-footnote'},'同一个 AI，同一份记忆。外观可以改变，属于你的东西会留下。')]
    if(panel.value==='memory')return memoryPanel()
    if(panel.value==='tools')return toolsPanel()
    if(panel.value==='contact')return contactPanel()
    if(panel.value==='inbox')return inboxPanel()
    if(panel.value==='reminders')return remindersPanel()
    if(panel.value==='result')return resultPanel()
    if(panel.value==='connection')return connectionPanel()
    if(panel.value==='history')return conversations.value.length?conversations.value.map(item=>btn('',()=>loadConversation(item),{class:'history-item'},[h('strong',item.text_preview||'一段对话'),h('p',item.reply_preview||'这段对话还在等一个回应'),h('small',formatTime(item.last_active_at))])):[empty('从第一句话开始','之后的对话会留在这里。','history')]
    return []
  }
  const titles={about:'我的 AI',tools:'我的工具',memory:'记忆',contact:'主动联系',inbox:'近况',reminders:'我的提醒',appearance:'改变这里',connection:'模型与连接',history:'我们的对话',result:'核对结果'}
  const activityView=record=>presentActivity(record,{activity:view.value?.activity,work:view.value?.work,
    send:view.value?.runtime.send,pendingId:pendingMessage.value})
  const stopTarget=()=>currentStop({send:view.value?.runtime.send,work:view.value?.work,pendingId:pendingMessage.value})
  const stopCurrent=()=>{const target=stopTarget();if(target)return call(target.action,target.args)}
  const draftView=record=>visibleDraft(record,{progress:state.value?.progress,send:view.value?.runtime.send,
    work:view.value?.work,pendingId:pendingMessage.value})
  function summaryBlock(record){
    const partial=draftView(record),summary=partial?.summary||activityView(record).summary
    return summary?h('details',{class:'reasoning-summary',open:!!partial},[h('summary','处理思路'),
      h('p',summary),h('small',partial?'正在生成的公开摘要':'模型提供的简要说明；实际执行请看工具记录。')]):null
  }
  function activityBlock(record){
    const {activity:a,active,running,hasActions,done,heading,mode}=activityView(record)
    if(!mode)return null
    const stop=()=>view.value?.runtime.send?.commandId?call('send.cancel',{commandId:view.value.runtime.send.commandId}):call('work.stop',{turnId:record.id})
    const controls=[running?btn('停止',stop,{class:'text-button',disabled:!view.value?.runtime.send&&!active},[icon('stop',13),'停止']):null,
      !running&&a?.workflow?.can_continue?btn('从这里继续',async()=>{const r=await call('open',{panel:'conversation',turnId:record.id});if(r.ok)await call('work.start',{turnId:record.id})},{class:'secondary small',disabled:working.value||busy.value}):
      !running&&active&&['queued','model_failed'].includes(record.state)?btn('重新回应',()=>call('work.start',{turnId:record.id}),{class:'secondary small',disabled:working.value||busy.value}):null,
      active&&a?.needsReconciliation?btn('核对实际状态',()=>call('work.reconcile',{turnId:record.id}),{class:'secondary small',disabled:working.value}):null]
    if(!hasActions)return h('section',{class:['response-state',mode],'aria-label':'回复状态'},[
      h('div',{class:'thinking-row',role:'status'},[icon('spark',17),h('span',heading),...controls]),
      mode==='thinking'?h('p',{class:'thinking-note'},draftView(record)?.reply?'回复正在生成，尚未完成。':'正在准备回应…'):null])
    const events=(a.events??[]).filter(e=>!e.historical)
    const loop=a.workflow
    const step=loop?(record.state==='paused'?'已经做过的步骤和成果都保留了，继续时会先读取这些结果。':done?'已读取工具回执并整理结论；可展开查看每一步。':`第 ${loop.step_count} 轮处理 · 根据实际结果决定下一步`):
      done?(a.taskId?'结果来自真实计算，可以逐行查看来源。':'已保存到你的个人空间。'):a.taskId?'CSV 核对工具 · 以实际执行回执为准':'正在保存工具成果…'
    return h('section',{class:['activity-card',done?'complete':''],'aria-label':'工具执行过程'},[
      h('div',{class:'activity-heading'},[h('span',{class:'activity-symbol'},icon(done?'check':'spark',19)),h('div',[h('h3',heading),h('p',step)])]),
      loop?.plan.length?h('ol',{class:'workflow-plan','aria-label':'处理计划'},loop.plan.map((p,i)=>h('li',{key:i},p))):null,
      loop?.goal?h('div',{class:'goal-board','aria-label':'目标与分工'},[
        h('p',{class:'item-meta'},`目标模式 · ${loop.goal.phase==='finished'?'已收束':loop.goal.phase==='cancelled'?'已停止':({director:'主控规划',worker:'执行任务',reviewer:'主控验收'})[loop.goal.role]}`),
        ...loop.goal.tasks.map(t=>h('details',{class:'goal-task',key:t.id,open:['working','submitted','rework'].includes(t.state)},[
          h('summary',[h('strong',t.title),h('span',({queued:'等待分派',working:'执行中',submitted:'等待验收',accepted:'主控已验收',rework:'需要返工'})[t.state])]),
          h('p',{class:'muted'},`${t.executor==='claude'?'Claude Code':'执行模型'} · 第 ${t.attempt} 次派工${t.depends_on.length?' · 依赖：'+t.depends_on.join('、'):''}`),
          ...t.criteria.map((c,i)=>h('p',{key:i},`${i+1}. ${c}`)),
          ...t.checks.map(c=>h('p',{class:c.passed?'workflow-receipt':'error-text',key:c.criterion},`${c.passed?'通过':'需修改'}：${c.reason}`)),
        ])),h('small',{class:'muted'},'验收依据是实际成果与模型判断；语法检查不等于行为测试。')]):null,
      loop?h('details',{class:'workflow-trace',open:running||!done},[
        h('summary',`处理记录 · ${loop.step_count} 步`),
        loop.has_more_steps?h('p',{class:'muted'},'这里显示最近 12 步；更早的动作成果仍保留在下面。'):null,
        ...loop.steps.map(s=>h('section',{class:'workflow-step',key:s.ordinal},[
          h('div',{class:'item-meta'},[h('strong',`第 ${s.ordinal} 步${s.role?' · '+({director:'主控',worker:s.executor==='claude'?'Claude Code':'执行者',reviewer:'验收'})[s.role]:''}`),h('span',s.state==='generating'?'正在思考':s.state==='failed'?'已中断':'已记录')]),
          s.summary||s.reply?h('p',s.summary||s.reply):null,
          s.error?h('p',{class:'error-text'},errors[s.error]||`未继续处理（${s.error}）`):null,
          ...s.action_ids.map(id=>{const action=(record.actions??[]).find(x=>x.id===id)??a.actions.find(x=>x.id===id);return action?h('p',{class:action.state==='failed'?'error-text':'workflow-receipt',key:id},[
            ({'data.query':'查询附件','tool.save':'保存可复用工具','tool.run':'运行工具','artifact.create':'保存文件','csv.audit':'核对 CSV','reminder.create':'设置提醒','profile.change':'更新偏好','goal.plan':'拆分目标','goal.dispatch':'分派任务','goal.submit':'提交成果','goal.review':'验收成果','goal.finish':'收束目标'})[action.kind]??'工具',
            ' · ',({ready:'等待执行',accepted:'回执已确认',failed:'未执行成功',blocked:'已停止',outcome_unknown:'结果待核对'})[action.state],
            Number.isSafeInteger(action.row_count)?` · 输出 ${action.row_count} 行`:'',action.error?` · ${errors[action.error]||action.error}`:'']):null})
        ]))
      ]):null,
      ...(record.actions??[]).filter(x=>x.artifact&&x.state==='accepted').map(x=>h('div',{class:'memory-item',key:x.id},[
        h('h3',x.artifact.title),h('p',x.artifact.files.map(f=>f.path).join(' · ')),
        loop?.goal?h('p',{class:'item-meta'},loop.goal.tasks.some(t=>t.state==='accepted'&&t.evidence_ids.includes(x.id))?'当前已验收成果':'过程文件 · 未列入当前已验收成果'):null,
        h('small',x.artifact.files.some(f=>/\.(py|js|mjs|ts|html|svg)$/.test(f.path))?'源码已保存，尚未执行或部署。':`共 ${x.artifact.files.length} 个文件，可下载保存。`),
        btn('下载成果',async()=>{const r=await call('artifact.read',{turnId:record.id,actionId:x.id,download:true});if(!r.ok)return;
          const bytes=Uint8Array.from(atob(r.result.base64),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:r.result.mime}));
          const a=document.createElement('a');a.href=url;a.download=r.result.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
        },{class:'secondary small'},[icon('download',16),'下载成果'])])),
      ...(record.actions??[]).filter(x=>x.reminder&&x.state==='accepted').map(x=>h('p',{key:x.id},['已安排提醒：',x.reminder.text,' · ',formatTime(x.reminder.due_at)])),
      ...(record.actions??[]).filter(x=>x.tool&&x.state==='accepted').map(x=>h('div',{class:'memory-item',key:x.id},[
        h('strong',x.kind==='tool.save'?`已保存工具 · ${x.tool.name}`:`已运行工具 · ${x.tool.name}`),
        h('p',x.kind==='tool.save'?`版本 ${x.tool.version} · ${x.tool.validation.passed} 个样例通过，下次可以继续使用。`:`版本 ${x.tool.version} · 实际输出 ${x.row_count} 行`),
        btn('我的工具',()=>openPanel('tools'),{class:'secondary small'})])),
      events.length?h('ol',{class:'event-list'},events.map(e=>h('li',{key:e.seq},[h('span',{class:'event-dot'}),h('span',eventLabel[e.kind]??e.kind),h('time',e.occurredAt?formatTime(e.occurredAt):'')]))):null,
      h('div',{class:'activity-actions'},[...controls,done&&a.taskId?btn('查看成果与来源',()=>openResult(record.id),{class:'primary small',disabled:busy.value},['查看成果与来源',icon('arrow',16)]):null,
        active&&a.taskStatus==='queued'&&!running?btn('继续本地任务',()=>call('work.local',{turnId:record.id}),{class:'secondary small'}):null]),
    ])
  }
  function onKeys(event){
    if(!panel.value){if(event.key==='Escape')composerOptions.value=false;return}
    if(event.key==='Escape'){event.preventDefault();void closePanel();return}
    if(event.key==='Tab'){
      const elements=[...drawer.value.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],summary,iframe')]
      const first=elements[0],last=elements.at(-1)
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
    }
  }
  function saveDraft(){
    if(!draftHydrated)return Promise.resolve()
    const value={text:draft.value,attachment:attachment.value,temporary:temporary.value,conversationId:conversationId.value,selectedTurn:savedSelection}
    draftFlight=draftFlight.then(async()=>{
      const r=await client.draft.write({expectedRevision:draftRevision,value})
      if(r.ok)draftRevision=r.result.revision
      else if(r.error==='revision_conflict'){draftHydrated=false;notify('草稿在另一个界面发生了变化。当前文字仍保留在这里，请核对后重新打开。',true)}
    })
    return draftFlight
  }
  watch([draft,attachment,temporary,conversationId,selectedTurn],()=>{void saveDraft()},{flush:'post'})
  onMounted(async()=>{
    document.addEventListener('keydown',onKeys)
    const intent=navigationIntent
    await client.start()
    await appearance.initialize()
    const saved=await client.draft.read()
    if(saved.ok){draftRevision=saved.result.revision;const d=saved.result.value;draft.value=d.text??'';attachment.value=d.attachment??null;temporary.value=d.temporary??false;if(d.conversationId)conversationId.value=d.conversationId;savedSelection=d.selectedTurn??null}
    draftHydrated=saved.ok
    if(!saved.ok&&saved.error!=='preview_read_only')notify('未能读取跨界面草稿。当前仍可对话，旧草稿文件会保留供恢复。',true)
    if(intent!==navigationIntent)return
    const ongoing=view.value?.runtime.send?.turnId??(view.value?.runtime.executionBusy?view.value?.execution?.turnId:null)
    if(ongoing)await call('open',{panel:'conversation',turnId:ongoing})
    if(!view.value?.conversation?.turn&&!busy.value){
      const saved=savedSelection
      if(saved&&/^[0-9a-f-]{36}$/i.test(saved))await call('open',{panel:'conversation',turnId:saved})
    }
    const turn=view.value?.conversation?.turn
    // Resource reads do not change this or another interface's selected conversation.
    if(turn&&intent===navigationIntent&&!turn.temporary&&!busy.value){
      const id=turn.conversation_id,result=await client.call('conversation.turns',{id})
      if(result.ok&&intent===navigationIntent&&conversationId.value===id){
        const rows=new Map(result.result.slice().reverse().map(row=>[row.id,{id:row.id,conversation_id:id,text:row.text_preview,reply:row.reply_preview,state:row.state,preview:true}]))
        for(const row of records.value.filter(r=>r.conversation_id===id))rows.set(row.id,row)
        records.value=[...records.value.filter(r=>r.conversation_id!==id),...rows.values()]
        await call('open',{panel:'conversation',turnId:turn.id})
      }
    }
  })
  onUnmounted(()=>{client.dispose();document.removeEventListener('keydown',onKeys);clearTimeout(toastTimer)})
  const conversationView=()=>h('section',{class:'conversation','aria-label':'对话'},[
          h('div',{class:'conversation-label'},['一段属于你的对话',temporary.value?h('span','临时对话'):null]),
          ...chatRecords.value.map(record=>h('article',{key:record.id,class:'exchange'},[h('div',{class:'user-message'},[h('span',{class:'speaker'},'你'),h('p',record.text)]),
            summaryBlock(record),(record.reply||draftView(record)?.reply)?h('div',{class:['ai-message',draftView(record)?'streaming':'']},[h('span',{class:'ai-symbol'},icon('spark',19)),h('div',[h('span',{class:'speaker'},name.value),h('p',record.reply||draftView(record)?.reply),record.preview?btn('查看完整内容',()=>call('open',{panel:'conversation',turnId:record.id}),{class:'text-button'}):null])]):null,
            activityBlock(record)])),h('div',{class:'conversation-end'})])
  const composerView=()=>h('div',{class:['composer-area',composerOptions.value?'options-open':'']},[
    attachment.value?h('div',{class:'attachment-chip'},[icon('paper',15),h('span',attachment.value.name),btn('移除附件',()=>{fileGeneration++;attachment.value=null},{class:'icon-button tiny','aria-label':'移除附件'},icon('close',13))]):null,
    h('div',{class:['composer',busy.value?'processing':'']},[
      h('div',{class:'composer-entry'},[
        btn('更多输入选项',()=>{composerOptions.value=!composerOptions.value},{class:'composer-expand','aria-label':'更多输入选项','aria-expanded':composerOptions.value,title:'附件、临时对话与目标模式'},icon(composerOptions.value?'close':'plus',18)),
        h('textarea',{ref:composer,value:draft.value,onInput:e=>{draft.value=e.target.value},rows:theme.value==='atelier'?5:1,
          placeholder:theme.value==='whale'?'跟我说句话…':theme.value==='form'?'一个问题，一个想法。':'今天，想从哪句话开始？',
          'aria-label':'给 AI 的消息',disabled:sending.value,
          onKeydown:event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();void send()}}}),
        busy.value?btn('停止回复',stopCurrent,{class:'send-button stop-button','aria-label':'停止回复',disabled:!stopTarget()},icon('stop',15)):
        btn('发送消息',send,{class:['send-button',!draft.value.trim()?'send-empty':''],'aria-label':'发送消息',disabled:!draft.value.trim()||!connected.value||!state.value},icon('arrow',19)),
      ]),
      composerOptions.value?h('div',{class:'composer-options'},[
        btn('添加 CSV 材料',()=>fileInput.value?.click(),{class:'compose-option',disabled:busy.value},[icon('attach',16),'添加材料']),
        btn('临时对话',()=>{temporary.value=!temporary.value},{class:['compose-option',temporary.value?'selected':''],'aria-pressed':temporary.value,title:'临时对话不读取或写入长期记忆',disabled:busy.value},[icon('moon',15),'临时对话']),
        btn('目标模式',()=>{draft.value=/^\s*(?:\/goal(?:\s|$)|目标模式[：:])/u.test(draft.value)?draft.value.replace(/^\s*(?:\/goal\s*|目标模式[：:]\s*)/u,''):'目标模式：'+draft.value;composer.value?.focus()},
          {class:['compose-option',/^\s*(?:\/goal(?:\s|$)|目标模式[：:])/u.test(draft.value)?'selected':''],'aria-pressed':/^\s*(?:\/goal(?:\s|$)|目标模式[：:])/u.test(draft.value),disabled:busy.value},[icon('spark',15),'目标模式']),
        h('div',{class:'composer-meta'},[btn(policy.value?.memory_enabled?'记忆已开启':'记忆已关闭',()=>openPanel('memory'),{class:'quiet-control'},policy.value?.memory_enabled?'记忆已开启':'记忆已关闭'),btn('模型与连接',()=>openPanel('connection'),{class:'quiet-control'},[icon('link',13),'模型与连接'])]),
      ]):null,
    ]),
    temporary.value&&!composerOptions.value?h('span',{class:'input-mode-note'},'临时对话'):null,
    /^\s*(?:\/goal(?:\s|$)|目标模式[：:])/u.test(draft.value)&&!composerOptions.value?h('span',{class:'input-mode-note'},'目标模式'):null,
    h('input',{ref:fileInput,type:'file',accept:'.csv,text/csv',class:'file-input',onChange:attach,'aria-label':'选择 CSV 文件'}),
    view.value?.conversation?.submitUnknown?btn('核对上一条输入是否已保存',()=>call('send.reconcile'),{class:'text-button error-text'}):null,
  ])
  return ()=>h('div',{class:['app-shell',`theme-${theme.value}`]},[
    renderStarter({theme:theme.value,name:name.value,hasConversation:!!chatRecords.value.length,busy:busy.value,
      runningTools:chatRecords.value.some(record=>{const a=activityView(record);return a.running&&a.hasActions}),unread:view.value?.home?.unreadCount,inert:!!panel.value,
      open:openPanel,newConversation,icon,
      lastArtifact:chatRecords.value.flatMap(record=>(record.actions??[]).filter(a=>a.state==='accepted'&&a.artifact).map(a=>a.artifact)).at(-1),
      prompt:text=>{draft.value=text;nextTick(()=>composer.value?.focus())},
      banner:!connected.value?h('div',{class:'connection-banner',role:'status'},['本地连接已断开。已保存的内容不会丢失。',btn('重新连接',()=>client.call('snapshot'),{class:'text-button'})]):null,
      conversation:chatRecords.value.length?conversationView():null,composer:composerView(),
    }),
    panel.value?h('div',{class:'panel-layer'},[h('div',{class:'scrim',onClick:closePanel}),h('aside',{ref:drawer,class:['drawer',panel.value==='result'?'wide':'',panel.value==='appearance'?'appearance-drawer':''],role:'dialog','aria-modal':'true','aria-labelledby':'panel-title'},[
      h('header',{class:'drawer-header'},[h('div',[panel.value!=='about'?btn('返回我的 AI',()=>openPanel('about'),{class:'icon-button small-icon','aria-label':'返回我的 AI'},icon('back',17)):null,h('h2',{id:'panel-title'},titles[panel.value])]),btn('关闭面板',closePanel,{class:'icon-button','aria-label':'关闭面板'},icon('close'))]),
      h('div',{class:'drawer-content'},content())])]):null,
    toast.value?h('div',{class:['toast',toast.value.error?'error':''],role:toast.value.error?'alert':'status'},[icon(toast.value.error?'paper':'check',17),h('span',toast.value.text),btn('关闭提示',()=>{toast.value=null},{class:'icon-button tiny','aria-label':'关闭提示'},icon('close',14))]):null,
  ])
}}).mount('#app')
