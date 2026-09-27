import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {projectRoot,resolveRuntime} from '../../../apps/desktop/product/runtime-paths.mjs'

function fresh(){fs.mkdirSync('.test-data',{recursive:true});return fs.mkdtempSync(path.resolve('.test-data/core020-portable-'))}
test('runtime dependencies use explicit overrides or this installation, never named siblings',()=>{
  const root=fresh(),python=path.join(root,'python-test.exe');fs.writeFileSync(python,'test fixture')
  assert.throws(()=>resolveRuntime('python',{root,env:{}}),/dependency_missing/)
  assert.equal(resolveRuntime('python',{root,env:{PERSONAL_AI_PYTHON:python}}),python)
  assert.throws(()=>resolveRuntime('python',{root,env:{PERSONAL_AI_PYTHON:'relative.exe'}}),/must_be_absolute/)
  fs.writeFileSync(path.join(root,'runtime.json'),JSON.stringify({python:'../outside.exe'}))
  assert.throws(()=>resolveRuntime('python',{root,env:{}}),/runtime_configuration_escape/)
  fs.writeFileSync(path.join(root,'runtime.json'),JSON.stringify({python:'python-test.exe'}))
  assert.equal(resolveRuntime('python',{root,env:{}}),python)
})
test('relocated source builds actual starters and strictly checks product contracts',()=>{
  const root=fresh()
  for(const dir of ['apps/desktop/product','apps/desktop/personal-space','services','packages/contracts','tools','tests/product','tests/spikes/personal-space/core']){
    fs.cpSync(path.join(projectRoot,dir),path.join(root,dir),{recursive:true,filter:p=>!p.includes('__pycache__')})
  }
  const pkg=JSON.parse(fs.readFileSync(path.join(projectRoot,'package.json'),'utf8'))
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify(pkg))
  assert.equal(pkg.scripts.build,'node tools/product.mjs build')
  assert.equal(pkg.scripts.typecheck,'node tools/product.mjs typecheck')
  assert.equal(pkg.scripts.test,'node tools/product.mjs test')
  const env={...process.env,PERSONAL_AI_PYTHON:resolveRuntime('python'),PERSONAL_AI_VUE:resolveRuntime('vue'),
    PERSONAL_AI_BUNDLER:resolveRuntime('bundler'),PERSONAL_AI_TYPESCRIPT:resolveRuntime('typescript'),PERSONAL_AI_NODE_TYPES:resolveRuntime('nodeTypes')}
  const run=(...args)=>{
    const result=spawnSync(process.execPath,args,{cwd:root,env,encoding:'utf8',windowsHide:true,timeout:90000})
    assert.equal(result.status,0,(result.stdout??'')+(result.stderr??''));return result.stdout
  }
  assert.match(run('tools/product.mjs','build'),/product-interface/)
  const artifact=JSON.parse(fs.readFileSync(path.join(root,'dist/product/form.bundle.json')))
  assert.ok(artifact.js.includes('morrow.ui/1'))
  assert.equal(artifact.source.id,'morrow.starter.form')
  assert.match(run('tools/product.mjs','typecheck'),/PASS/)
  // A real type error must fail; checking only declarations or syntax is insufficient.
  fs.appendFileSync(path.join(root,'apps/desktop/product/providers/context-window.mjs'),'\n/** @type {number} */ const wrong = "not a number"\n')
  const bad=spawnSync(process.execPath,['tools/product.mjs','typecheck'],{cwd:root,env,encoding:'utf8',windowsHide:true})
  assert.equal(bad.status,1);assert.match(bad.stderr,/not assignable/)
  // Actual Python host/SQLite work through the portable Node test entry point.
  assert.match(run('tools/product.mjs','test:node','tests/product/host.test.mjs'),/fail 0/)
})
