/** Trusted in-memory Rolldown configuration. Source/config from authors is never evaluated in Node. */
import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {pathToFileURL,fileURLToPath} from 'node:url'
import {SCOPES} from './session.mjs'
export const sha=value=>createHash('sha256').update(value).digest('hex')
const fail=code=>Object.assign(Error(code),{code})
const workspace=fileURLToPath(new URL('../../../..',import.meta.url))
const sourceRoot=fileURLToPath(new URL('../../personal-space/',import.meta.url))
export const BUILD_VERSION='morrow-ui/1-rolldown-1.2.9'
export function validateSource(source){
  if(!source||Object.keys(source).sort().join('|')!=='entry|files|id|name|scopes|sdk|styles'
    ||source.sdk!=='morrow.ui/1'||typeof source.id!=='string'||!/^[-a-z0-9.]{1,80}$/.test(source.id)
    ||typeof source.name!=='string'||!source.name.trim()||source.name.length>100
    ||!Array.isArray(source.scopes)||source.scopes.some(s=>!SCOPES.includes(s))||new Set(source.scopes).size!==source.scopes.length
    ||!source.files||typeof source.files!=='object'||Array.isArray(source.files)
    ||!Array.isArray(source.styles)||source.styles.some(s=>typeof s!=='string'||!s.endsWith('.css')))
    throw fail('interface_invalid_source')
  const names=Object.keys(source.files)
  if(!names.length||names.length>100||!names.includes(source.entry)||source.styles.some(s=>!names.includes(s)))throw fail('interface_invalid_source')
  let size=0
  for(const name of names){
    const text=source.files[name]
    if(!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.(?:mjs|js|ts|css)$/.test(name)||typeof text!=='string')throw fail('interface_invalid_source')
    const bytes=Buffer.byteLength(text);size+=bytes
    if(bytes>256*1024||size>2*1024*1024)throw fail('interface_source_too_large')
  }
  if(!/\.(?:mjs|js|ts)$/.test(source.entry))throw fail('interface_invalid_source')
  return structuredClone(source)
}
export async function defaultSource(){
  const files={}
  for(const name of ['app.mjs','activity.mjs','styles.css'])files[name]=await fs.readFile(path.join(sourceRoot,name),'utf8')
  files['core/activity.mjs']=await fs.readFile(path.resolve(sourceRoot,'../product/application/activity.mjs'),'utf8')
  files['core/state.mjs']=await fs.readFile(path.resolve(sourceRoot,'../product/application/state.mjs'),'utf8')
  files['activity.mjs']=files['activity.mjs'].replace('../product/application/activity.mjs','./core/activity.mjs')
  return {sdk:'morrow.ui/1',id:'morrow.default',name:'Morrow · 初始界面',entry:'app.mjs',styles:['styles.css'],scopes:[...SCOPES],files}
}
export async function buildInterface(value,{vueFile,bundlerFile=path.resolve(workspace,'../companion-agent/node_modules/rolldown/dist/index.mjs')}={}){
  const source=validateSource(value)
  const sdk=await fs.readFile(new URL('../../personal-space/interface-sdk.mjs',import.meta.url),'utf8')
  const vue=await fs.readFile(vueFile,'utf8')
  const {rolldown}=await import(pathToFileURL(bundlerFile))
  const modules=new Map(Object.entries(source.files).filter(([n])=>!n.endsWith('.css')).map(([n,s])=>['/'+n,s]))
  modules.set('/@morrow/sdk',sdk);modules.set('/@vendor/vue',vue)
  let build
  try{
    build=await rolldown({input:'/'+source.entry,treeshake:true,logLevel:'silent',plugins:[{
      name:'morrow-closed-source-map',resolveId(id,importer){
        if(id==='@morrow/sdk')return '/@morrow/sdk'
        if(id==='vue')return '/@vendor/vue'
        const target=id.startsWith('.')&&importer?path.posix.resolve(path.posix.dirname(importer),id):id
        if(!modules.has(target))throw fail('interface_import_denied')
        return target
      },load(id){if(!modules.has(id))throw fail('interface_import_denied');return modules.get(id)},
    }]})
    const result=await build.generate({format:'iife',codeSplitting:false,sourcemap:false})
    if(result.output.length!==1||result.output[0].type!=='chunk')throw fail('interface_build_failed')
    const js=result.output[0].code,css=source.styles.map(n=>source.files[n]).join('\n')
    if(Buffer.byteLength(js)+Buffer.byteLength(css)>4*1024*1024)throw fail('interface_build_too_large')
    const artifact={format:'morrow.bundle/1',builder:BUILD_VERSION,source,js,css,
      dependencies:{sdk:sha(sdk),vue:sha(vue)}}
    return {...artifact,hash:sha(JSON.stringify(artifact))}
  }catch(e){throw fail(e.code==='interface_import_denied'?'interface_import_denied':'interface_build_failed')}
  finally{await build?.close()}
}
export function verifyArtifact(artifact){
  if(!artifact||typeof artifact.hash!=='string')throw fail('interface_integrity_error')
  const {hash,...body}=artifact
  if(sha(JSON.stringify(body))!==hash||body.format!=='morrow.bundle/1'||body.builder!==BUILD_VERSION)throw fail('interface_integrity_error')
  validateSource(body.source)
  return artifact
}
export function frameDocument(bundle,mountId){
  // Hash-authorized scripts; no author markup enters the trusted document.
  const boot=`globalThis.__MORROW_MOUNT__=${JSON.stringify(mountId)};`
  const scripts=[boot,bundle.js]
  const hashes=scripts.map(s=>`'sha256-${createHash('sha256').update(s).digest('base64')}'`).join(' ')
  // An executable closing tag would escape the hashed script even before CSP; reject it.
  if(/<\/script/i.test(bundle.js)||/<\/style/i.test(bundle.css))throw fail('interface_embedded_closing_tag')
  return {html:'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    +'<style>html,body{margin:0;min-height:100%;}'+bundle.css+'</style></head><body><div id="app"></div>'
    +scripts.map(s=>'<script>'+s+'</script>').join('')+'</body></html>',
    csp:`sandbox allow-scripts allow-downloads allow-modals; default-src 'none'; script-src ${hashes}; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; font-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'`}
}
