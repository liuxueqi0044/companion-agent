import {resolveRuntime} from '../apps/desktop/product/runtime-paths.mjs'
/** Real local tools with a deterministic offline model; optional browser fixture. */
import fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {createProductHost} from '../apps/desktop/product/host.mjs'
import {createProductRuntime} from '../apps/desktop/product/runtime/index.mjs'
import {createInterfaceService} from '../apps/desktop/product/interface/service.mjs'
import {createPersonalSpaceServer} from '../apps/desktop/product/web/server.mjs'
import {unavailableSpaceService} from '../apps/desktop/product/space/service.mjs'

const serve=process.argv.includes('--serve')
if(process.argv.slice(2).some(a=>a!=='--serve'))throw Error('invalid_arguments')
const workspace=process.cwd(),root=await fs.mkdtemp(path.resolve('.test-data/core014-demo-'))
const host=createProductHost({python:resolveRuntime('python'),workspace,dataRoot:root})
const contexts=[]
const runtime=createProductRuntime({host,intent:input=>['task.loop','artifact.create',...(input.csv_text?['data.query']:[])],turnProvider:{configured:true,respond:async c=>{
  contexts.push(c)
  const step=c.workflow.step
  let decision
  if(!c.csv_attached)decision={reply:'这是离线演示。可以附上含 name 和 qty 列的 CSV，查看多步计算、修正与报告。',actions:[]}
  else if(step===1)decision={reply:'我先检查材料，再核对汇总结果。',plan:['读取附件并计算汇总','检查实际结果，必要时修正','保存一份简短报告'],actions:[{kind:'data.query',title:'第一轮查询（故意使用错误列名以演示修正）',sql:'SELECT absent FROM data'}]}
  else if(step===2)decision={reply:'刚才的查询没有通过。我会按照实际列名修正。',actions:[{kind:'data.query',title:'按名称汇总数量',sql:'SELECT name, sum(num(qty)) AS total FROM data GROUP BY name ORDER BY name'}]}
  else if(step===3){
    const result=c.workflow.receipts.at(-1)
    if(result.state!=='accepted'||result.rows_truncated)throw Error('unexpected_fixture_receipt')
    decision={reply:'已经读到计算结果，接下来保存报告。',actions:[{kind:'artifact.create',title:'数量汇总报告',files:[{path:'report.md',content:'# 数量汇总\n\n'+result.rows.map(r=>`- ${r.name}：${r.total}`).join('\n')+'\n\n依据本次附件的真实查询结果。\n'}]}]}
  }else decision={reply:'已完成核对并保存报告。结果来自本地计算；最初的查询错误和修正过程也保留在记录中。',actions:[],outcome:'complete'}
  return {decision,displayableSummary:'按当前步骤的实际回执继续处理。'}
}}})
let interfaces,server
const checked=r=>{if(!r?.ok)throw Error(typeof r?.error==='string'?r.error:r?.error?.code??'demo_failed');return r.result}
try{
  checked(await runtime.initialize())
  const input={command_id:randomUUID(),conversation_id:randomUUID(),text:'请检查这份虚构材料，按名称汇总数量，核对之后保存报告。',csv_text:'name,qty\nA,2\nA,3\nB,4\n'}
  checked(await runtime.send(input))
  const end=checked(await runtime.resources.turn({turnId:input.command_id}))
  const actual=end.actions.find(a=>a.kind==='data.query'&&a.state==='accepted')
  const output=checked(await runtime.resources.artifact({turnId:end.id,actionId:actual.id,download:false}))
  if(JSON.stringify(JSON.parse(output.files[0].content))!==JSON.stringify([{name:'A',total:5},{name:'B',total:4}]))throw Error('unexpected_result')
  const reopened=checked(await host.request('turn.read',{turn_id:end.id}))
  const result={ok:true,root,turn_id:end.id,model:'offline_fixture',http_model_requests:0,steps:end.workflow.step_count,
    states:reopened.actions.map(a=>({kind:a.kind,state:a.state})),rows:2,final_state:end.state}
  if(serve){
    const vueFile=resolveRuntime('vue')
    interfaces=await createInterfaceService({root:path.join(root,'interfaces'),runtime,vueFile})
    server=await createPersonalSpaceServer({runtime,interfaces,space:unavailableSpaceService(),vueFile,port:0,connection:()=>({configured:true,provider:'离线演示（虚构数据）'})})
    result.url=server.url
    await fs.writeFile('reports/core-014/evidence/browser-fixture.json',JSON.stringify(result,null,2))
    console.log(JSON.stringify(result))
    const close=async()=>{await server.close();await host.dispose();process.exitCode=0}
    process.once('SIGINT',()=>void close());process.once('SIGTERM',()=>void close())
  }else{
    await fs.writeFile('reports/core-014/evidence/offline-demo.json',JSON.stringify(result,null,2))
    console.log(JSON.stringify(result));runtime.dispose();await runtime.whenIdle();await host.dispose()
  }
}catch(error){await server?.close();await interfaces?.close();runtime.dispose();await runtime.whenIdle();await host.dispose();throw error}
