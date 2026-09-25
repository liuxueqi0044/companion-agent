import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {createProductHost} from '../../../apps/desktop/product/host.mjs'
import {createProductRuntime} from '../../../apps/desktop/product/runtime/index.mjs'
import {createInterfaceSession} from '../../../apps/desktop/product/interface/session.mjs'
test('save validated SQL then reuse on new data across real Node/Python, SDK and reopen',async()=>{
 const root=await fs.mkdtemp(path.resolve('.test-data/core013-tools-'))
 const host=createProductHost({python:path.resolve('../companion-agent/.venv/Scripts/python.exe'),workspace:process.cwd(),dataRoot:root})
 let selected
 const runtime=createProductRuntime({host,intent:()=>['tool.save','tool.run'],turnProvider:{configured:true,respond:context=>({decision:{reply:'准备处理。',actions:[selected?{kind:'tool.run',tool_id:selected.id,version:selected.version,parameters:{}}:{kind:'tool.save',definition:{name:'去重',description:'name 去重排序',sql:'SELECT DISTINCT name FROM data ORDER BY name',parameters:[],examples:[{csv_text:'name\nB\nA\nB\n',parameters:{},expected:[{name:'A'},{name:'B'}]}]}}]}})}})
 let denied,allowed
 try{
  assert.ok((await runtime.initialize()).ok)
  const conversation_id=randomUUID(),first=randomUUID()
  const saved=await runtime.send({command_id:first,conversation_id,text:'创建去重工具'});assert.ok(saved.ok,JSON.stringify(saved))
  selected=(await runtime.resources.tools()).result[0];assert.equal(selected.version,1)
  const second=randomUUID(),run=await runtime.send({command_id:second,conversation_id,text:'用去重工具处理新材料',csv_text:'name\nD\nC\nD\n'})
  assert.ok(run.ok,JSON.stringify(run));const action=(await runtime.resources.turn({turnId:second})).result.actions[0]
  assert.equal(action.kind,'tool.run');assert.equal(action.state,'accepted');assert.equal(action.row_count,2)
  const result=await runtime.resources.artifact({turnId:second,actionId:action.id,download:false})
  assert.deepEqual(JSON.parse(result.result.files[0].content),[{name:'C'},{name:'D'}])
  denied=await createInterfaceSession({runtime,scopes:['conversation']});allowed=await createInterfaceSession({runtime,scopes:['tasks']})
  assert.equal((await denied.call('tools.list')).error,'scope_denied')
  assert.equal((await allowed.call('tools.list')).result.length,1)
  const change=await allowed.call('tools.manage',{command_id:randomUUID(),tool_id:selected.id,expected_revision:selected.revision,operation:'disable'})
  assert.ok(change.ok,JSON.stringify(change));assert.equal((await runtime.resources.tools()).result[0].enabled,false)
  const reopened=createProductHost({python:path.resolve('../companion-agent/.venv/Scripts/python.exe'),workspace:process.cwd(),dataRoot:root})
  try{assert.equal((await reopened.request('tool.list',{})).result[0].enabled,false)}finally{await reopened.dispose()}
 }finally{denied?.dispose();allowed?.dispose();runtime.dispose();await runtime.whenIdle();await host.dispose()}
})
