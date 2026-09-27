import {resolveRuntime} from '../../../apps/desktop/product/runtime-paths.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {createProductHost} from '../../../apps/desktop/product/host.mjs'
import {createProductRuntime} from '../../../apps/desktop/product/runtime/index.mjs'
import {createDeepSeekProviders} from '../../../apps/desktop/product/providers/deepseek.mjs'
import {createRequestLedger} from '../../../apps/desktop/product/providers/request-ledger.mjs'
import {createGoalRouter,goalIntent,isGoalInput} from '../../../apps/desktop/product/providers/goal.mjs'
import {createClaudeGateway,createClaudeProvider,claudeCommand,collectCodingFiles} from '../../../apps/desktop/product/providers/claude.mjs'
import {workflowView} from '../../../apps/desktop/product/application/workflow.mjs'
const python=resolveRuntime('python')
const reply=actions=>({decision:{reply:'当前步骤',actions,memories:[],followup:null}})
const task={id:'report',title:'结果报告',instruction:'查询 CSV 并生成结果',criteria:['A=5/B=4'],depends_on:[]}
const plan=()=>reply([{kind:'goal.plan',tasks:[task]}])
const query=()=>reply([{kind:'data.query',title:'汇总',sql:'SELECT name,sum(num(qty)) AS qty FROM data GROUP BY name ORDER BY name'}])
const dispatch=()=>reply([{kind:'goal.dispatch',task_id:'report',executor:'worker'}])
async function fixture(provider){
  const root=await fs.mkdtemp(path.resolve('.test-data/core015-'))
  const host=createProductHost({python,workspace:process.cwd(),dataRoot:root})
  const runtime=createProductRuntime({host,intent:goalIntent,turnProvider:provider})
  assert.ok((await runtime.initialize()).ok)
  return {root,host,runtime,input:{command_id:randomUUID(),conversation_id:randomUUID(),text:'/goal 汇总附件',csv_text:'name,qty\nA,2\nA,3\nB,4\n'},
    async close(){runtime.dispose();await runtime.whenIdle();await host.dispose()}}
}

test('goal routing is explicit and does not grant claude or goals in ordinary chat',()=>{
  assert.ok(isGoalInput({text:'目标模式：写工具'}));assert.ok(isGoalInput({text:'/goal make it'}))
  assert.ok(!isGoalInput({text:'what is /goal mode?'}))
  assert.ok(!goalIntent({text:'hello'}).includes('goal.plan'))
  assert.ok(!goalIntent({text:'/goal x'}).includes('agent.claude'))
  assert.ok(goalIntent({text:'/goal x'},{claude:true}).includes('agent.claude'))
})

test('real Node/Python/SQLite role cycle reviews real query evidence then completes',async()=>{
  const seen=[]
  const provider={configured:true,respond:c=>{
    seen.push(c.goal.role)
    switch(c.goal.phase){
      case 'planning':return plan()
      case 'dispatching':return c.goal.tasks.every(t=>t.state==='accepted')?reply([{kind:'goal.finish',outcome:'complete'}]):dispatch()
      case 'working':{
        assert.deepEqual(c.history,[]);assert.deepEqual(c.memories,[])
        const receipt=c.goal.task_receipts.find(r=>r.kind==='data.query'&&r.state==='accepted')
        if(!receipt)return query()
        assert.deepEqual(receipt.rows,[{name:'A',qty:5},{name:'B',qty:4}])
        return reply([{kind:'goal.submit',summary:'verified query',evidence_ids:[receipt.action_id]}])
      }
      case 'reviewing':return reply([{kind:'goal.review',task_id:'report',verdict:'accept',checks:[{criterion:0,passed:true,reason:'actual rows A5 B4',evidence_ids:c.goal.task.evidence_ids}]}])
      case 'finished':return reply([])
    }
  }}
  const f=await fixture(createGoalRouter({turn:provider}))
  try{
    const r=await f.runtime.send(f.input);assert.ok(r.ok,JSON.stringify(r));await f.runtime.whenIdle()
    const end=(await f.runtime.resources.turn({turnId:f.input.command_id})).result
    assert.equal(end.state,'responded');assert.equal(end.workflow.goal.phase,'finished')
    assert.equal(end.workflow.goal.tasks[0].state,'accepted');assert.ok(workflowView(end.workflow))
    assert.deepEqual(seen,['director','director','worker','worker','reviewer','director','director'])
  }finally{await f.close()}
})

test('provider failure in worker is not retried and restart retains the assignment',async()=>{
  let failOnce=true,calls=0
  const f=await fixture({configured:true,respond:c=>{calls++;if(c.goal.phase==='planning')return plan();if(c.goal.phase==='dispatching')return dispatch();if(failOnce){failOnce=false;throw Error('network')};return query()}})
  try{
    const r=await f.runtime.send(f.input);assert.equal(r.ok,false);await f.runtime.whenIdle();assert.equal(calls,3)
    const saved=(await f.host.request('turn.read',{turn_id:f.input.command_id})).result
    assert.equal(saved.workflow.goal.active_task,'report');assert.equal(saved.state,'model_failed')
    assert.equal(saved.workflow.goal.tasks[0].attempt,1);assert.equal(saved.workflow.can_continue,true)
  }finally{await f.close()}
})

test('stop holds the shared slot until a delegated provider actually returns',async()=>{
  let entered,release;const waiting=new Promise(r=>{entered=r}),late=new Promise(r=>{release=r})
  const f=await fixture({configured:true,respond:c=>{if(c.goal.phase==='planning')return plan();if(c.goal.phase==='dispatching')return dispatch();entered();return late}})
  try{
    const sending=f.runtime.send(f.input);await Promise.race([waiting,sending.then(r=>{throw Error('send ended before worker: '+JSON.stringify(r))})])
    const stopped=await f.runtime.cancelSend({commandId:f.input.command_id});assert.ok(stopped.ok)
    await sending;assert.equal(f.runtime.snapshot().runtime.executionBusy,true)
    const blocked=await f.runtime.send({...f.input,command_id:randomUUID()});assert.equal(blocked.error,'runner_busy')
    release(query());await f.runtime.whenIdle()
    const end=(await f.host.request('turn.read',{turn_id:f.input.command_id})).result
    assert.equal(end.state,'cancelled');assert.equal(end.actions.length,2)
    assert.equal(end.workflow.goal.phase,'cancelled')
  }finally{release(reply([]));await f.close()}
})

test('director/worker/reviewer model configs are separate and journal labels are durable',async()=>{
  const root=await fs.mkdtemp(path.resolve('.test-data/core015-models-')),ledger=createRequestLedger({file:path.join(root,'ledger.json')}),models=[]
  const p=createDeepSeekProviders({apiKey:'fixture-secret',ledger,roleModels:{director:'director-model',worker:'worker-model'},fetchImpl:async(url,options)=>{
    const body=JSON.parse(options.body);models.push(body.model)
    assert.ok(body.messages[0].content.includes('GOAL MODE'))
    return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"reply":"done","actions":[]}'}}]}),{status:200})
  }})
  for(const role of ['director','worker','reviewer'])await p.turn.respond({goal:{role}})
  assert.deepEqual(models,['director-model','worker-model','director-model'])
  const rows=JSON.parse(await fs.readFile(path.join(root,'ledger.json'),'utf8')).attempts
  assert.deepEqual(rows.map(r=>r.kind),['goal_director','goal_worker','goal_reviewer']);assert.equal(ledger.snapshot().used,3)
})

test('claude gateway rejects other routes and credentials; upstream failure prevents retries',async()=>{
  let calls=0;const gateway=await createClaudeGateway({apiKey:'real-fixture-secret',model:'configured',fetchImpl:async(url,options)=>{
    calls++;assert.equal(url,'https://api.deepseek.com/anthropic/v1/messages')
    assert.equal(options.headers['x-api-key'],'real-fixture-secret');assert.equal(JSON.parse(options.body).model,'configured')
    return new Response('{"error":"failed"}',{status:500})
  }})
  try{
    assert.equal((await fetch(gateway.url+'/v1/messages',{method:'POST',body:'{}'})).status,403)
    const options={method:'POST',headers:{'x-api-key':gateway.token},body:'{"model":"wrong"}'}
    assert.equal((await fetch(gateway.url+'/other',options)).status,403)
    assert.equal((await fetch(gateway.url+'/v1/messages',options)).status,500)
    assert.equal((await fetch(gateway.url+'/v1/messages',options)).status,409)
    assert.equal(calls,1)
  }finally{await gateway.close()}
})

test('claude command is bare, scoped, no shell/Codex or inherited provider login',()=>{
  const c=claudeCommand({home:'fixture-home',settingsFile:'settings.json',proxyURL:'http://127.0.0.1:1',token:'local-token',model:'test'})
  assert.ok(c.args.includes('--bare'));assert.ok(c.args.includes('--no-session-persistence'))
  assert.equal(c.args[c.args.indexOf('--tools')+1],'Read,Write,Edit,Glob,Grep')
  assert.equal(c.env.ANTHROPIC_API_KEY,'local-token');assert.equal(c.env.OPENAI_API_KEY,undefined)
  assert.equal(c.env.ANTHROPIC_AUTH_TOKEN,undefined);assert.equal(c.env.NODE_OPTIONS,undefined)
  assert.ok(!c.args.includes('--dangerously-skip-permissions'))
})

test('actual CLI-shaped child edits file, gateway records request, host returns bound syntax evidence',async()=>{
  const root=await fs.mkdtemp(path.resolve('.test-data/core015-claude-'))
  const child=path.join(root,'fixture.mjs')
  await fs.writeFile(child,`import fs from 'node:fs/promises';await new Promise(r=>{process.stdin.on('data',()=>{});process.stdin.on('end',r)});const r=await fetch(process.env.ANTHROPIC_BASE_URL+'/v1/messages',{method:'POST',headers:{'x-api-key':process.env.ANTHROPIC_API_KEY},body:'{}'});await r.text();await fs.writeFile('answer.mjs','export const answer=42;');console.log(JSON.stringify({type:'assistant',message:{content:[{type:'tool_use',name:'Write'}]}}));console.log(JSON.stringify({type:'result',subtype:'success',is_error:false}));`)
  const ledger=createRequestLedger({file:path.join(root,'ledger.json')})
  const provider=createClaudeProvider({executable:process.execPath,prefixArgs:[child,'--'],root:path.join(root,'runs'),apiKey:'fixture-private',ledger,python,
    fetchImpl:async()=>new Response('{"content":[]}',{status:200})})
  const r=await provider.respond({capabilities:['artifact.create'],goal:{role:'worker',task:{...task,executor:'claude',attempt:1,evidence_ids:[]},source_previews:[]}})
  assert.equal(r.decision.actions[0].files[0].content,'export const answer=42;')
  assert.equal(r.executionEvidence.checks[0].status,'passed');assert.equal(r.executionEvidence.api_requests,1)
  assert.equal(r.executionEvidence.tool_calls,1);assert.equal(ledger.snapshot().inFlight,false)
})

test('collector reports syntax failures without running the generated program and rejects hardlinks',async()=>{
  const root=await fs.mkdtemp(path.resolve('.test-data/core015-collect-'))
  await fs.writeFile(path.join(root,'invalid.mjs'),'export = (')
  const r=await collectCodingFiles(root,{python});assert.equal(r.checks[0].status,'failed')
  await fs.link(path.join(root,'invalid.mjs'),path.join(root,'alias.mjs'))
  await assert.rejects(collectCodingFiles(root,{python}),/coding_unsafe_output/)
})

test('aborting an actual coding child closes its process and settles the ledger before reuse',async()=>{
  const root=await fs.mkdtemp(path.resolve('.test-data/core015-abort-')),child=path.join(root,'wait.mjs')
  await fs.writeFile(child,`process.stdin.resume();setInterval(()=>{},1000);`)
  const ledger=createRequestLedger({file:path.join(root,'ledger.json')}),controller=new AbortController()
  const provider=createClaudeProvider({executable:process.execPath,prefixArgs:[child,'--'],root:path.join(root,'runs'),apiKey:'fixture-private',ledger,python})
  const running=provider.respond({capabilities:['artifact.create'],goal:{role:'worker',task:{...task,executor:'claude',attempt:1}}},{signal:controller.signal})
  const rejection=assert.rejects(running,/provider_aborted/)
  let pid
  for(let n=0;n<200&&!pid;n++){
    try{pid=JSON.parse(await fs.readFile(path.join(root,'ledger.json'),'utf8')).attempts[0]?.external_pid}catch{}
    if(!pid)await new Promise(r=>setTimeout(r,10))
  }
  controller.abort();await rejection
  const saved=JSON.parse(await fs.readFile(path.join(root,'ledger.json'),'utf8')).attempts[0]
  assert.equal(saved.state,'failed');assert.equal(ledger.snapshot().inFlight,false)
  assert.ok(pid,'test must observe an actual child PID')
  assert.throws(()=>process.kill(pid,0),'child must have closed before respond rejects')
})

test('projection drops private fields and rejects malformed dependency structure',()=>{
  const goal={version:1,phase:'working',role:'worker',active_task:'report',outcome:null,tasks:[{...task,state:'working',attempt:1,executor:'worker',summary:'',evidence_ids:[],checks:[],secret:'never'}]}
  const raw={version:1,step_count:1,plan:[],steps:[],can_continue:false,has_more_steps:false,next:'none',outcome:null,goal}
  assert.equal(workflowView(raw).goal.tasks[0].secret,undefined)
  goal.tasks[0].depends_on=['missing'];assert.equal(workflowView(raw),null)
})
