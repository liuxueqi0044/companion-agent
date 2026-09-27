import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {resolveRuntime,projectRoot} from '../../../apps/desktop/product/runtime-paths.mjs'

test('portable build carries the pinned MCP/parser dependency closure and imports without the source tree',async()=>{
  await fs.mkdir('.test-data',{recursive:true})
  const root=await fs.mkdtemp(path.resolve('.test-data/core021-package-'))
  const script="import sys,json,runpy;from pathlib import Path;m=runpy.run_path(str(Path(sys.argv[1])/'tools/build_windows.py'));print(json.dumps(m['copy_node_dependencies'](Path(sys.argv[2]),Path(sys.argv[1])/'node_modules',['@modelcontextprotocol/client','yaml','ajv'])))"
  const copied=spawnSync(resolveRuntime('python'),['-I','-B','-c',script,projectRoot,root],{encoding:'utf8',windowsHide:true,timeout:60000})
  assert.equal(copied.status,0,copied.stderr);const manifest=JSON.parse(copied.stdout)
  assert.equal(manifest['@modelcontextprotocol/client'].version,'2.1.0');assert.equal(manifest.yaml.version,'2.9.1')
  for(const name of Object.keys(manifest)){
    const metadata=JSON.parse(await fs.readFile(path.join(root,'node_modules',name,'package.json'),'utf8'))
    for(const dependency of Object.keys(metadata.dependencies??{}))assert.ok(manifest[dependency],`${name} is missing ${dependency}`)
  }
  const check=`import {Client} from '@modelcontextprotocol/client';import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';import {parseDocument} from 'yaml';import Ajv from 'ajv';if(!new Client({name:'packaged',version:'1'})||!StdioClientTransport||parseDocument('name: test').toJS().name!=='test'||!new Ajv().compile({type:'object'})({}))throw Error('broken_package');console.log('PASS')`
  // Resolve the entry packages from the staged root; explicitly check every transitive dependency above.
  await fs.writeFile(path.join(root,'verify.mjs'),check)
  const result=spawnSync(process.execPath,[path.join(root,'verify.mjs')],{cwd:root,encoding:'utf8',windowsHide:true,timeout:10000})
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/PASS/)
  assert.ok((await fs.stat(path.join(root,'node_modules/@modelcontextprotocol/client/LICENSE'))).isFile())
})
