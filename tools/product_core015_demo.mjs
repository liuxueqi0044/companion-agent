import {resolveRuntime} from '../apps/desktop/product/runtime-paths.mjs'
/** Scripted models, real local query/artifacts/role state/rework. No network or credentials. */
import fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import assert from 'node:assert/strict'
import {workflowView} from '../apps/desktop/product/application/workflow.mjs'
import {createProductHost} from '../apps/desktop/product/host.mjs'
import {createProductRuntime} from '../apps/desktop/product/runtime/index.mjs'
import {goalIntent,createGoalRouter} from '../apps/desktop/product/providers/goal.mjs'
import {createInterfaceService} from '../apps/desktop/product/interface/service.mjs'
import {createPersonalSpaceServer} from '../apps/desktop/product/web/server.mjs'
import {unavailableSpaceService} from '../apps/desktop/product/space/service.mjs'

const serve=process.argv.includes('--serve')
if(process.argv.slice(2).some(a=>a!=='--serve'))throw Error('invalid_arguments')
const workspace=process.cwd(),root=await fs.mkdtemp(path.resolve('.test-data/core015-demo-'))
const host=createProductHost({python:resolveRuntime('python'),workspace,dataRoot:root})
const answer=(reply,actions=[])=>({decision:{reply,actions}})
const provider={configured:true,respond:c=>{
  const g=c.goal
  if(!g)return answer('这里是离线目标模式演示，所有模型判断都是脚本，不会发出模型请求。')
  switch(g.phase){
    case 'planning':return answer('我会先核对数据，再根据真实结果生成报告。', [{kind:'goal.plan',tasks:[
      {id:'calculate',title:'核对附件中的数量',instruction:'按 name 汇总 qty',criteria:['实际查询得到 A=5、B=4'],depends_on:[]},
      {id:'report',title:'写一份清楚的汇总报告',instruction:'根据已验收的计算结果保存报告',criteria:['报告与计算结果一致'],depends_on:['calculate']}
    ]}])
    case 'dispatching':{
      const next=g.tasks.find(t=>t.state!=='accepted')
      return next?answer('把下一项交给执行者。',[{kind:'goal.dispatch',task_id:next.id,executor:'worker'}]):answer('两项任务均已完成核对。',[{kind:'goal.finish',outcome:'complete'}])
    }
    case 'working':{
      const receipt=g.task_receipts.find(r=>r.state==='accepted'&&['data.query','artifact.create'].includes(r.kind))
      if(receipt)return answer('提交实际成果，交由主控核对。',[{kind:'goal.submit',summary:'已生成成果',evidence_ids:[receipt.action_id]}])
      if(g.task.id==='calculate')return answer('现在计算附件中的数量。',[{kind:'data.query',title:'按名称汇总数量',sql:'SELECT name,sum(num(qty)) AS total FROM data GROUP BY name ORDER BY name'}])
      const content=g.task.attempt===1?'# 数量汇总\n\nA：5\nB：3\n':'# 数量汇总\n\nA：5\nB：4\n\n已按照实际查询结果修正。\n'
      return answer(g.task.attempt===1?'正在整理报告。':'按主控意见修正报告中的 B 数量。',[{kind:'artifact.create',title:'数量汇总报告',files:[{path:'report.md',content}]}])
    }
    case 'reviewing':{
      const own=g.source_previews.filter(s=>g.task.evidence_ids.includes(s.action_id))
      const passed=g.task.id==='calculate'?own.some(s=>s.content.includes('5')&&s.content.includes('4')):own.some(s=>s.content.includes('B：4'))
      return answer(passed?'已经对照实际成果完成核对。':'报告把 B 写成了 3，实际查询是 4，需要返工。',[{kind:'goal.review',task_id:g.task.id,verdict:passed?'accept':'rework',checks:[{criterion:0,passed,reason:passed?'实际文件与查询结果一致。':'B 的数量错误，应为 4。',evidence_ids:g.task.evidence_ids}]}])
    }
    case 'finished':return answer('报告已保存：A 共 5，B 共 4。报告曾出现一处错误，已退回修正，并对照实际结果重新验收。此处为离线脚本模型演示。')
  }
}}
const runtime=createProductRuntime({host,intent:goalIntent,turnProvider:createGoalRouter({turn:provider})})
const checked=r=>{if(!r?.ok)throw Error(JSON.stringify(r));return r.result}
let interfaces,server
try{
  checked(await runtime.initialize())
  const input={command_id:randomUUID(),conversation_id:randomUUID(),text:'目标模式：帮我核对这份虚构材料，整理一份数量报告。',csv_text:'name,qty\nA,2\nA,3\nB,4\n'}
  checked(await runtime.send(input))
  const end=checked(await runtime.resources.turn({turnId:input.command_id}))
  if(end.state!=='responded'||end.workflow.goal.tasks[1].attempt!==2||end.workflow.goal.tasks.some(t=>t.state!=='accepted'))throw Error('demo_incomplete')
  const reopened=checked(await host.request('turn.read',{turn_id:end.id}))
  assert.equal(reopened.state,end.state)
  assert.deepEqual(workflowView(reopened.workflow),end.workflow)
  const result={ok:true,root,turn_id:end.id,model:'offline_fixture',http_model_requests:0,steps:end.workflow.step_count,
    goal:reopened.workflow.goal,final_state:end.state}
  if(serve){
    const vueFile=resolveRuntime('vue')
    interfaces=await createInterfaceService({root:path.join(root,'interfaces'),runtime,vueFile})
    server=await createPersonalSpaceServer({runtime,interfaces,space:unavailableSpaceService(),vueFile,port:0,connection:()=>({configured:true,provider:'离线演示（虚构数据）'})})
    result.url=server.url
    await fs.writeFile('reports/core-015/evidence/browser-fixture.json',JSON.stringify(result,null,2))
    console.log(JSON.stringify(result))
    const close=async()=>{await server.close();runtime.dispose();await runtime.whenIdle();await host.dispose()}
    process.once('SIGINT',()=>void close());process.once('SIGTERM',()=>void close())
  }else{
    await fs.writeFile('reports/core-015/evidence/offline-demo.json',JSON.stringify(result,null,2))
    console.log(JSON.stringify(result));runtime.dispose();await runtime.whenIdle();await host.dispose()
  }
}catch(error){await server?.close();await interfaces?.close();runtime.dispose();await runtime.whenIdle();await host.dispose();throw error}
