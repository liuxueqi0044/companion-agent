import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import http from 'node:http'
import {randomUUID} from 'node:crypto'
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/server'
import {fixtureServer} from './mcp-fixture.mjs'
import {importCapability,normalizeConnection} from '../../../apps/desktop/product/capabilities/importer.mjs'
import {createMcpAdapter} from '../../../apps/desktop/product/capabilities/mcp.mjs'
import {createCapabilityService} from '../../../apps/desktop/product/capabilities/service.mjs'
import {createProductHost} from '../../../apps/desktop/product/host.mjs'
import {createProductRuntime} from '../../../apps/desktop/product/runtime/index.mjs'
import {createInterfaceSession} from '../../../apps/desktop/product/interface/session.mjs'
import {resolveRuntime} from '../../../apps/desktop/product/runtime-paths.mjs'

const fresh=async()=>{await fs.mkdir('.test-data',{recursive:true});return fs.mkdtemp(path.resolve('.test-data/core021-'))}
const source='---\nname: compare-sources\ndescription: Compare evidence without inventing sources.\n---\nRead provided notes, identify differences and save a summary when asked.\n'
const skill=(content=source)=>({files:[{path:'SKILL.md',content}]})
const stdio=(root,mode='normal')=>({type:'stdio',command:'node',args:[path.resolve('tests/product/core021/mcp-fixture.mjs'),'--stdio',mode,path.join(root,'calls.jsonl')],env:{}})
const rawPackage=connection=>({name:'test-notes',files:[{path:'.claude-plugin/plugin.json',content:'{"name":"test-notes","description":"Fictional notes","license":"MIT"}'},{path:'.mcp.json',content:JSON.stringify({mcpServers:{notes:connection}})}]})

test('Skills, Codex and Claude imports are data; unsupported dependencies are explicit',()=>{
  const one=importCapability(skill());assert.equal(one.name,'compare-sources');assert.equal(one.components[0].kind,'skill');assert.equal(one.issues.length,0)
  for(const format of ['codex','claude']){
    const p=importCapability({files:[{path:`.${format}-plugin/plugin.json`,content:'{"name":"research","skills":"./skills","hooks":"./hooks/hooks.json"}'},{path:'skills/notes/SKILL.md',content:source},{path:'skills/notes/scripts/read.py',content:'not executed'}]})
    assert.equal(p.format,format);assert.ok(p.issues.includes('requires_host_component:hooks'));assert.ok(p.components[0].issues.includes('requires_script_runtime'))
  }
  assert.throws(()=>importCapability({files:[{path:'../SKILL.md',content:source}]}),/capability_invalid_package/)
  assert.throws(()=>importCapability({files:[{path:'SKILL.md',content:source},{path:'skill.md',content:source}]}),/capability_duplicate_path/)
  assert.throws(()=>importCapability(skill('---\nname: &a test\ndescription: *a\n---\nx')),/capability_skill_invalid/)
  assert.throws(()=>importCapability(skill('---\nname: test\nname: duplicate\ndescription: test\n---\nx')),/capability_skill_invalid/)
  const creds=normalizeConnection({url:'https://example.com/mcp',headers:{Authorization:'Bearer private-value'}})
  assert.ok(creds.issues.includes('credential_reference_required'));assert.ok(!JSON.stringify(creds).includes('private-value'))
  assert.ok(normalizeConnection({url:'http://example.com/mcp'}).issues.includes('endpoint_not_supported'))
  assert.equal(normalizeConnection({url:'https://example.com/mcp',headers:{Authorization:'Bearer ${MORROW_PLUGIN_NOTES}'}}).issues.length,0)
})

test('real SDK stdio discovery, schema validation, receipt and process close',async()=>{
  const root=await fresh(),adapter=createMcpAdapter({root,env:{...process.env,OPENAI_API_KEY:'test-must-not-inherit'}}),connection=stdio(root)
  const {tools}=await adapter.list(connection);assert.deepEqual(tools.map(t=>t.name),['read_note','write_note'])
  const tool=tools[0]
  await assert.rejects(()=>adapter.call(connection,{tool,arguments:{wrong:1}}),e=>e.code==='capability_arguments_invalid'&&e.outcome==='failed')
  await assert.rejects(()=>adapter.call(connection,{tool:{...tool,description:'changed'},arguments:{name:'one'}}),/capability_tools_changed/)
  const r=await adapter.call(connection,{tool,arguments:{name:'sample'}});assert.equal(r.status,'succeeded');assert.equal(r.result.structuredContent.total,42);assert.equal(r.result.structuredContent.accountInherited,false)
  const logs=(await fs.readFile(path.join(root,'calls.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);assert.equal(logs.length,1)
  assert.throws(()=>process.kill(logs[0].pid,0),e=>e.code==='ESRCH')
})

test('tool errors are definite; oversize and cancellation after send are uncertain without retry',async()=>{
  const root=await fresh(),adapter=createMcpAdapter({root}),tool=(await adapter.list(stdio(root))).tools[0]
  assert.equal((await adapter.call(stdio(root,'error'),{tool,arguments:{name:'absent'}})).status,'failed')
  await assert.rejects(()=>adapter.call(stdio(root,'oversize'),{tool,arguments:{name:'large'}}),e=>e.outcome==='unknown'&&e.code==='capability_response_too_large')
  const controller=new AbortController(),flight=adapter.call(stdio(root,'slow'),{tool,arguments:{name:'slow'},signal:controller.signal})
  const cancelling=assert.rejects(()=>flight,e=>e.outcome==='unknown'&&e.code==='capability_aborted')
  for(let n=0;n<100;n++){if((await fs.readFile(path.join(root,'calls.jsonl'),'utf8')).includes('slow'))break;await new Promise(r=>setTimeout(r,30))}
  controller.abort();await cancelling
  const logs=(await fs.readFile(path.join(root,'calls.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);assert.equal(logs.length,3)
  assert.throws(()=>process.kill(logs.at(-1).pid,0),e=>e.code==='ESRCH')
})

test('real SDK Streamable HTTP discovers and calls without redirecting credentials',async()=>{
  const root=await fresh(),transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:()=>randomUUID(),enableJsonResponse:true})
  const mcp=fixtureServer();await mcp.connect(transport)
  const server=http.createServer(async(req,res)=>{try{
    const chunks=[];for await(const chunk of req)chunks.push(chunk)
    const request=new Request(`http://127.0.0.1:${server.address().port}${req.url}`,{method:req.method,headers:req.headers,...(chunks.length?{body:Buffer.concat(chunks),duplex:'half'}:{})})
    const r=await transport.handleRequest(request);res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()))
  }catch{res.writeHead(500);res.end()}})
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  try{
    const adapter=createMcpAdapter({root}),connection={type:'http',url:`http://127.0.0.1:${server.address().port}/mcp`,headers:{}}
    const tool=(await adapter.list(connection)).tools[0]
    // Stateful test transport gets a fresh session for the next standalone connection.
    await mcp.close()
    const second=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:()=>randomUUID(),enableJsonResponse:true})
    const next=fixtureServer();await next.connect(second)
    transport.handleRequest=second.handleRequest.bind(second)
    const r=await adapter.call(connection,{tool,arguments:{name:'http'}});assert.equal(r.result.structuredContent.total,42)
    await next.close()
  }finally{await mcp.close();server.closeAllConnections();await new Promise(r=>server.close(r))}
})

test('HTTP redirects cannot forward credential references to another URL',async()=>{
  const root=await fresh();let calls=0,forwarded=0,received=false
  const server=http.createServer((req,res)=>{calls++;if(req.url==='/elsewhere')forwarded++
    received ||= req.headers.authorization==='Bearer fictional-test-key'
    res.writeHead(302,{location:'/elsewhere'});res.end()
  })
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  try{
    const adapter=createMcpAdapter({root,env:{MORROW_PLUGIN_NOTES:'fictional-test-key'}})
    await assert.rejects(()=>adapter.list({type:'http',url:`http://127.0.0.1:${server.address().port}/mcp`,headers:{Authorization:'Bearer ${MORROW_PLUGIN_NOTES}'}}),/capability_connection_failed/)
    assert.equal(forwarded,0);assert.equal(calls,1);assert.equal(received,true)
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
})

test('stopping a running MCP action retains the execution slot until the actual call settles',async()=>{
  const root=await fresh(),host=createProductHost({python:resolveRuntime('python'),workspace:process.cwd(),dataRoot:root})
  let release,enter,signal,calls=0,part,item
  const gate=new Promise(r=>{release=r}),entered=new Promise(r=>{enter=r})
  const tool={name:'read_note',description:'Read notes',inputSchema:{type:'object'},annotations:{readOnlyHint:true}}
  const service=createCapabilityService({host,root:path.join(root,'capabilities'),adapter:{list:async()=>({tools:[tool]}),call:async(_,{signal:s})=>{calls++;signal=s;enter();await gate;return {status:'succeeded',result:{content:[{type:'text',text:'late'}]},error:null}}}})
  const runtime=createProductRuntime({host,capabilityExecutor:service.execute,intent:()=>['task.loop','capability.describe','capability.call'],turnProvider:{configured:true,respond:()=>({decision:{reply:'Reading',actions:[{kind:'capability.call',package_id:item.id,version:item.version,component:part.id,tool:'read_note',arguments:{}}]}})}})
  try{
    assert.ok((await runtime.initialize()).ok)
    item=await service.command('import',rawPackage(stdio(root)));part=item.components[0]
    item=await service.command('connect',{id:item.id,version:item.version,component:part.id,expected_revision:item.revision,trustSource:true})
    item=await service.command('grant',{id:item.id,component:part.id,expected_revision:item.revision,tools:['read_note']})
    item=await service.command('manage',{id:item.id,expected_revision:item.revision,operation:'enable',version:null})
    const input={command_id:randomUUID(),conversation_id:randomUUID(),text:'Read once'}
    const sending=runtime.send(input);await entered
    assert.ok((await runtime.cancelSend({commandId:input.command_id})).ok)
    assert.equal(signal.aborted,true);assert.equal(runtime.snapshot().runtime.executionBusy,true)
    assert.equal((await runtime.send({...input,command_id:randomUUID()})).error,'runner_busy')
    release();await sending;await runtime.whenIdle()
    const turn=(await host.request('turn.read',{turn_id:input.command_id})).result
    assert.equal(turn.state,'cancelled');assert.equal(turn.actions[0].state,'blocked');assert.equal(calls,1)
  }finally{release();runtime.dispose();await runtime.whenIdle();await service.close();await host.dispose()}
})

test('Node → Python → SQLite → MCP → observation → saved result; generated UI cannot grant',async()=>{
  const root=await fresh(),host=createProductHost({python:resolveRuntime('python'),workspace:process.cwd(),dataRoot:root})
  const service=createCapabilityService({host,root:path.join(root,'capabilities'),python:resolveRuntime('python')})
  let item,part,calls=0
  const runtime=createProductRuntime({host,capabilityExecutor:service.execute,intent:()=>['task.loop','capability.describe','capability.call','artifact.create'],turnProvider:{configured:true,respond:context=>{
    calls++;assert.equal(context.capability_catalog[0].id,item.id)
    const base={package_id:item.id,version:item.version,component:part.id}
    const decision=calls===1?{reply:'查看这个工具。',actions:[{kind:'capability.describe',...base,tool:'read_note'}]}:
      calls===2?{reply:'读取样本。',actions:[{kind:'capability.call',...base,tool:'read_note',arguments:{name:'integration'}}]}:
      calls===3?{reply:'保存结果。',actions:[{kind:'artifact.create',title:'核对',files:[{path:'result.md',content:'Verified total: '+context.workflow.receipts.at(-1).receipt.result.structuredContent.total}]}]}:
      {reply:'结果是 42，已保存。',actions:[],outcome:'complete'}
    return {decision}
  }}})
  let ui
  try{
    assert.ok((await runtime.initialize()).ok)
    item=await service.command('import',rawPackage(stdio(root)));assert.equal(item.enabled,false);part=item.components[0]
    await assert.rejects(()=>service.command('connect',{id:item.id,version:item.version,component:part.id,expected_revision:item.revision,trustSource:false}),/capability_trust_required/)
    item=await service.command('connect',{id:item.id,version:item.version,component:part.id,expected_revision:item.revision,trustSource:true})
    await assert.rejects(()=>service.command('grant',{id:item.id,component:part.id,expected_revision:item.revision,tools:['write_note']}),/capability_write_not_supported/)
    item=await service.command('grant',{id:item.id,component:part.id,expected_revision:item.revision,tools:['read_note']})
    item=await service.command('manage',{id:item.id,expected_revision:item.revision,operation:'enable',version:null})
    ui=await createInterfaceSession({runtime,scopes:['conversation','tasks']})
    for(const action of ['capability.grant','capabilities.connect','capabilities.import'])assert.equal((await ui.call(action,{})).ok,false)
    const input={command_id:randomUUID(),conversation_id:randomUUID(),text:'Read the sample and save the result.'}
    const r=await runtime.send(input);assert.ok(r.ok,JSON.stringify(r));assert.equal(calls,4)
    const end=(await host.request('turn.read',{turn_id:input.command_id})).result
    assert.equal(end.state,'responded');assert.equal(end.actions[1].state,'accepted');assert.equal(end.workflow.outcome,'complete')
    const saved=await service.command('save-set',{name:'My research',items:[{id:item.id,version:item.version}]})
    const exported=await service.command('export-set',{id:saved.id});assert.equal(exported.items.length,1);assert.ok(!JSON.stringify(exported).includes(root));assert.equal(exported.items[0].name,'test-notes')
    const imported=await service.command('inspect-set',{recipe:exported});assert.equal(imported.items[0].status,'available')
    assert.equal((await fs.readFile(path.join(root,'calls.jsonl'),'utf8')).trim().split('\n').length,1)
  }finally{ui?.dispose();runtime.dispose();await runtime.whenIdle();await service.close();await host.dispose()}
})
