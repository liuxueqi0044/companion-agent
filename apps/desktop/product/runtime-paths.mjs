/** Resolve this installation or explicit overrides; never infer a sibling project. */
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

export const projectRoot=fileURLToPath(new URL('../../..',import.meta.url))
const specifications={
  python:['PERSONAL_AI_PYTHON',process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python'],
  vue:['PERSONAL_AI_VUE','node_modules/vue/dist/vue.runtime.esm-browser.prod.js'],
  bundler:['PERSONAL_AI_BUNDLER','node_modules/rolldown/dist/index.mjs'],
  typescript:['PERSONAL_AI_TYPESCRIPT','node_modules/typescript/lib/typescript.js'],
  nodeTypes:['PERSONAL_AI_NODE_TYPES','node_modules/@types/node'],
}
/** @param {keyof typeof specifications} name */
export function resolveRuntime(name,{root=projectRoot,env=process.env}={}){
  const spec=specifications[name]
  if(!spec)throw Error('unknown_runtime_dependency')
  const [variable,local]=spec
  /** @type {Record<string, unknown>} */
  let installed={}
  const config=path.join(root,'runtime.json')
  if(fs.existsSync(config)){
    try{installed=JSON.parse(fs.readFileSync(config,'utf8'))}catch{throw Error('runtime_configuration_invalid')}
    if(!installed||typeof installed!=='object'||Array.isArray(installed))throw Error('runtime_configuration_invalid')
  }
  const configured=env[variable]??installed[name]
  if(configured!==undefined&&(typeof configured!=='string'||!configured.trim()))throw Error('runtime_configuration_invalid')
  if(env[variable]!==undefined&&!path.isAbsolute(env[variable]))throw Error(`${variable}_must_be_absolute`)
  const result=path.resolve(root,typeof configured==='string'?configured:local)
  if(!env[variable]&&configured!==undefined){
    const relative=path.relative(root,result)
    if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('runtime_configuration_escape')
  }
  let stat;try{stat=fs.statSync(result)}catch{throw Error(`dependency_missing:${name}; install local dependencies or set ${variable}`)}
  if(name==='nodeTypes'?!stat.isDirectory():!stat.isFile())throw Error(`dependency_invalid:${name}`)
  return result
}
