/** Default offline product commands. No servers, credentials or providers are started. */
import fs from 'node:fs'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'
import {projectRoot,resolveRuntime} from '../apps/desktop/product/runtime-paths.mjs'

process.chdir(projectRoot)
const [command,...args]=process.argv.slice(2)
function files(dir,pattern){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
  const file=path.join(dir,e.name);return e.isDirectory()?files(file,pattern):pattern.test(e.name)?[file]:[]
}).sort()}
function run(executable,args){
  const env={...process.env}
  // An independently launched suite must not inherit a parent node:test IPC context.
  delete env.NODE_TEST_CONTEXT
  const result=spawnSync(executable,args,{cwd:projectRoot,env,stdio:'inherit',windowsHide:true,shell:false})
  if(result.error)throw result.error
  if(result.status!==0)throw Error(`command_failed:${path.basename(executable)}:${result.status??result.signal}`)
}
async function build(){
  const {buildInterface,defaultSource,verifyArtifact}=await import('../apps/desktop/product/interface/builder.mjs')
  const {availableStarterIds}=await import('../apps/desktop/personal-space/starter-config.mjs')
  const out=path.join(projectRoot,'dist/product');fs.mkdirSync(out,{recursive:true})
  for(const starter of availableStarterIds){
    const artifact=verifyArtifact(await buildInterface(await defaultSource({starter,standalone:true})))
    fs.writeFileSync(path.join(out,starter+'.bundle.json'),JSON.stringify(artifact))
    console.log(JSON.stringify({build:'product-interface',starter,sha256:artifact.hash,bytes:Buffer.byteLength(artifact.js)+Buffer.byteLength(artifact.css)}))
  }
}
async function typecheck(){
  const {default:ts}=await import(pathToFileURL(resolveRuntime('typescript')).href)
  const config=JSON.parse(fs.readFileSync('apps/desktop/product/tsconfig.json','utf8'))
  const parsed=ts.parseJsonConfigFileContent(config,ts.sys,path.join(projectRoot,'apps/desktop/product'))
  parsed.options.typeRoots=[path.dirname(resolveRuntime('nodeTypes'))]
  const program=ts.createProgram(parsed.fileNames,parsed.options)
  const errors=[...parsed.errors,...ts.getPreEmitDiagnostics(program)]
  if(errors.length){console.error(ts.formatDiagnosticsWithColorAndContext(errors,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>projectRoot,getNewLine:()=> '\n'}));throw Error('product_typecheck_failed')}
  console.log(JSON.stringify({typecheck:'PASS',rootFiles:parsed.fileNames.map(f=>path.relative(projectRoot,f)),scope:'SDK contract and checked reliability modules; remaining JS covered by syntax/build/runtime tests'}))
}
function pythonTests(){run(resolveRuntime('python'),['-I','-B','-X','utf8','tools/run_product_tests.py',...args])}
function nodeTests(){run(process.execPath,['--test','--test-concurrency=1',...(args.length?args:files('tests/product',/\.test\.mjs$/))])}
async function check(){
  for(const file of ['apps/desktop/product','apps/desktop/personal-space','apps/desktop/native','tools'].flatMap(dir=>files(dir,/\.(?:mjs|cjs)$/)))run(process.execPath,['--check',file])
  run(resolveRuntime('python'),['-I','-B','-X','utf8','tools/check_product.py'])
  await typecheck();await build()
}
try{
  if(command==='build')await build()
  else if(command==='typecheck')await typecheck()
  else if(command==='check')await check()
  else if(command==='test:python')pythonTests()
  else if(command==='test:node')nodeTests()
  else if(command==='test'){if(args.length)throw Error('use test:node or test:python to select tests');pythonTests();nodeTests()}
  else throw Error('usage: product.mjs build|typecheck|check|test|test:python|test:node')
}catch(e){console.error(e.message);process.exitCode=1}
