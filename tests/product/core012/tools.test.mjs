import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {createProductHost} from '../../../apps/desktop/product/host.mjs'
import {createProductRuntime} from '../../../apps/desktop/product/runtime/index.mjs'
import {createInterfaceSession} from '../../../apps/desktop/product/interface/session.mjs'

test('real tool chain persists a multi-file deliverable, grants SDK access and survives restart',async()=>{
  const root=await fs.mkdtemp(path.resolve('.test-data/core012-tools-'))
  const host=createProductHost({python:path.resolve('../companion-agent/.venv/Scripts/python.exe'),workspace:process.cwd(),dataRoot:root})
  const runtime=createProductRuntime({host,intent:()=>['artifact.create'],turnProvider:{configured:true,respond:()=>({decision:{reply:'准备成果。',actions:[
    {kind:'artifact.create',title:'Notes',files:[{path:'notes.md',content:'# Fictional notes'}]}]}})}})
  let session
  try{
    assert.equal((await runtime.initialize()).ok,true)
    const id=randomUUID(),r=await runtime.send({command_id:id,conversation_id:randomUUID(),text:'Write notes'})
    assert.equal(r.ok,true,JSON.stringify(r))
    const read=await runtime.resources.turn({turnId:id}),action=read.result.actions[0]
    assert.equal(action.artifact.title,'Notes');assert.equal(action.state,'accepted')
    assert.equal(read.result.reply,'准备成果。')
    const result=await runtime.resources.artifact({turnId:id,actionId:action.id,download:true})
    assert.equal(result.ok,true);assert.equal(Buffer.from(result.result.base64,'base64').subarray(0,2).toString(),'PK')
    session=await createInterfaceSession({runtime,scopes:['conversation']})
    assert.equal((await session.call('artifact.read',{turnId:id,actionId:action.id,download:false})).error,'scope_denied')
    const wrong=await runtime.resources.artifact({turnId:randomUUID(),actionId:action.id,download:false})
    assert.equal(wrong.error,'artifact_not_found')
    const reopened=createProductHost({python:path.resolve('../companion-agent/.venv/Scripts/python.exe'),workspace:process.cwd(),dataRoot:root})
    try{assert.equal((await reopened.request('artifact.read',{turn_id:id,action_id:action.id})).result.files[0].content,'# Fictional notes')}
    finally{await reopened.dispose()}
  }finally{session?.dispose();runtime.dispose();await runtime.whenIdle();await host.dispose()}
})
