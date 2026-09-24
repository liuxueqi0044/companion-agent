/** Local trial transport for the handwritten trusted UI, not a generated-code sandbox. */
import http from 'node:http'
import fs from 'node:fs/promises'
import {randomBytes,timingSafeEqual} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

const deny=error=>({ok:false,error})
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
const exact=(value,keys)=>plain(value)&&Object.keys(value).every(k=>keys.includes(k))

export async function createPersonalSpaceServer({runtime,connection=()=>({configured:false}),vueFile,port=0}={}){
  if(!runtime?.snapshot||!path.isAbsolute(vueFile))throw Error('trusted_server_configuration_required')
  const root=fileURLToPath(new URL('../../personal-space/',import.meta.url))
  const token=randomBytes(32).toString('base64url')
  const staticFiles=new Map([
    ['/',{file:path.join(root,'index.html'),type:'text/html; charset=utf-8'}],
    ['/app.mjs',{file:path.join(root,'app.mjs'),type:'text/javascript; charset=utf-8'}],
    ['/client.mjs',{file:path.join(root,'client.mjs'),type:'text/javascript; charset=utf-8'}],
    ['/activity.mjs',{file:path.join(root,'activity.mjs'),type:'text/javascript; charset=utf-8'}],
    ['/product/application/activity.mjs',{file:path.resolve(root,'../product/application/activity.mjs'),type:'text/javascript; charset=utf-8'}],
    ['/product/application/state.mjs',{file:path.resolve(root,'../product/application/state.mjs'),type:'text/javascript; charset=utf-8'}],
    ['/styles.css',{file:path.join(root,'styles.css'),type:'text/css; charset=utf-8'}],
    ['/vendor/vue.mjs',{file:vueFile,type:'text/javascript; charset=utf-8'}],
  ])
  let revision=0,origin=null,managementBusy=false,closed=false
  const unsubscribe=runtime.subscribe(()=>{revision++})
  const snapshot=()=>({revision,view:runtime.snapshot(),connection:connection(),
    capabilities:{nativeIsolation:false,backgroundContact:false,generatedInterfaces:false}})
  const selected=id=>typeof id==='string'&&runtime.snapshot().conversation?.turn?.id===id&&
    runtime.snapshot().conversation?.selectedTurnId===id&&!runtime.snapshot().conversation?.loading
  const commands=new Map([
    ['snapshot',[[],()=>({ok:true})]],
    ['open',[['panel','turnId','conversationId'],args=>runtime.open(args)]],
    ['refresh',[[],()=>runtime.refresh()]],
    ['send',[['command_id','conversation_id','text','csv_text','temporary'],args=>runtime.send(args)]],
    ['send.cancel',[['commandId'],args=>runtime.cancelSend(args)]],
    ['send.reconcile',[[],()=>runtime.ui.conversation.replaySubmit()]],
    ['conversation.list',[[],()=>runtime.ui.conversation.loadConversations()]],
    ['conversation.turns',[['id'],args=>runtime.ui.conversation.openConversation(args.id)]],
    ['work.start',[['turnId'],args=>selected(args.turnId)?runtime.ui.work.startSelected():deny('stale_view')]],
    ['work.stop',[['turnId'],args=>selected(args.turnId)?runtime.ui.work.stopSelected():deny('stale_view')]],
    ['work.reconcile',[['turnId'],args=>selected(args.turnId)?runtime.ui.work.reconcileSelected():deny('stale_view')]],
    ['work.local',[['turnId'],args=>selected(args.turnId)?runtime.ui.work.runLocalOnceSelected():deny('stale_view')]],
    ['result.open',[['taskId','turnId'],args=>selected(args.turnId)?runtime.ui.result.open({taskId:args.taskId}):deny('stale_view')]],
    ['result.rows',[['taskId'],args=>runtime.snapshot().result.taskId===args.taskId?runtime.ui.result.loadMoreRows():deny('stale_view')]],
    ['policy.memory',[['expectedRevision','patch'],args=>runtime.ui.policy.updateMemory(args)]],
    ['policy.contact',[['expectedRevision','patch'],args=>runtime.ui.policy.updateContact(args)]],
    ['memory.refresh',[[],()=>runtime.ui.memory.refresh()]],
    ['memory.add',[['content','category'],args=>runtime.ui.memory.add(args)]],
    ['memory.edit',[['id','content'],async args=>{
      const chosen=await runtime.ui.memory.select({id:args.id})
      return chosen.ok?runtime.ui.memory.edit({content:args.content}):chosen
    }]],
    ['memory.forget',[['id'],async args=>{
      const chosen=await runtime.ui.memory.select({id:args.id})
      return chosen.ok?runtime.ui.memory.forget():chosen
    }]],
    ['memory.clear',[['confirmed','expectedPolicyRevision'],args=>runtime.ui.memory.clear(args)]],
    ['inbox.read',[['id'],args=>runtime.ui.inbox.markRead(args)]],
    ['inbox.explain',[['id'],async args=>{
      const chosen=await runtime.ui.inbox.select({id:args.id})
      return chosen.ok?runtime.ui.inbox.explainSelected():chosen
    }]],
    ['reminders.create',[['text','due_at'],args=>runtime.ui.reminders.create(args)]],
    ['reminders.cancel',[['id'],async args=>{
      const chosen=await runtime.ui.reminders.select({id:args.id})
      return chosen.ok?runtime.ui.reminders.cancel():chosen
    }]],
  ])
  const concurrent=new Set(['snapshot','send','send.cancel','work.start','work.stop','work.reconcile','work.local'])
  const modelCommands=new Set(['send','work.start'])
  const publicProviderErrors=new Set(['request_in_progress','credential_rejected',
    'provider_insufficient_balance','provider_rate_limited','provider_http_error','provider_timeout',
    'provider_invalid_output','provider_response_too_large','ledger_locked','ledger_invalid','ledger_write_failed'])
  async function dispatch(action,args){
    const command=commands.get(action)
    if(!command||!exact(args,command[0]))return deny('invalid_request')
    // Compound select+write operations cannot be rebound by another tab's navigation.
    const management=!concurrent.has(action)
    if(management&&managementBusy)return deny('management_busy')
    if(management)managementBusy=true
    try{
      const result=await command[1](args)
      // The frozen runner records a generic provider failure. Present only allowlisted
      // codes from our trusted adapter, never exception text or provider response bodies.
      if(modelCommands.has(action)&&result?.error==='provider_failed'){
        const detail=connection().lastError
        if(publicProviderErrors.has(detail))return {...result,error:detail}
      }
      return result
    }finally{if(management)managementBusy=false}
  }
  const headers={
    'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
    'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'Cross-Origin-Resource-Policy':'same-origin','X-Frame-Options':'DENY',
  }
  const server=http.createServer(async(req,res)=>{
    const send=(status,value)=>{if(res.destroyed)return;res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value))}
    try{
      if(closed)return send(503,deny('closing'))
      if(req.headers.host!==new URL(origin).host||req.headers['sec-fetch-site']==='cross-site')return send(403,deny('origin_denied'))
      if(req.method==='GET'&&staticFiles.has(req.url)){
        if(req.headers.origin&&req.headers.origin!==origin)return send(403,deny('origin_denied'))
        const entry=staticFiles.get(req.url)
        let data=await fs.readFile(entry.file)
        if(req.url==='/')data=Buffer.from(data.toString('utf8').replace('__SESSION_TOKEN__',token))
        res.writeHead(200,{...headers,'Content-Type':entry.type});res.end(data);return
      }
      if(req.method!=='POST'||req.url!=='/api/command')return send(404,deny('not_found'))
      if(req.headers.origin!==origin)return send(403,deny('origin_denied'))
      const supplied=Buffer.from(String(req.headers['x-personal-space-token']??'')),expected=Buffer.from(token)
      if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return send(401,deny('session_required'))
      if(req.headers['content-type']!=='application/json')return send(415,deny('invalid_content_type'))
      let size=0;const chunks=[]
      for await(const chunk of req){size+=chunk.length;if(size>384*1024){send(413,deny('request_too_large'));return}chunks.push(chunk)}
      let message
      try{message=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{return send(400,deny('invalid_json'))}
      if(!exact(message,['action','args'])||typeof message.action!=='string')return send(400,deny('invalid_request'))
      const result=await dispatch(message.action,message.args??{})
      send(200,{reply:result,snapshot:snapshot()})
    }catch{send(500,deny('internal_error'))}
  })
  server.requestTimeout=15000;server.headersTimeout=10000
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)})
  origin=`http://127.0.0.1:${server.address().port}`
  return {url:origin,snapshot,async close(){
    if(closed)return;closed=true;unsubscribe();runtime.dispose()
    server.closeIdleConnections()
    const stopped=new Promise(resolve=>server.close(resolve))
    await runtime.whenIdle();server.closeAllConnections();await stopped
  }}
}
