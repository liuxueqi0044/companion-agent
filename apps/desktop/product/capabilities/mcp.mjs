/** Official MCP transport. Only explicitly trusted servers are launched/contacted. */
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client'
import {StdioClientTransport,DEFAULT_INHERITED_ENV_VARS} from '@modelcontextprotocol/client/stdio'
import Ajv from 'ajv'
import fs from 'node:fs/promises'
import path from 'node:path'
import {capError,plain,hash} from './importer.mjs'
import {guardPath} from '../storage.mjs'

const need=(v,code)=>{if(!v)throw capError(code)}
const stable=v=>JSON.stringify(v,(_,item)=>plain(item)?Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])):item)
const schemaValidator=schema=>{
  need(plain(schema)&&Buffer.byteLength(JSON.stringify(schema))<=16*1024,'capability_schema_invalid')
  try{return new Ajv({strict:false,validateFormats:false,allErrors:false}).compile(schema)}catch{throw capError('capability_schema_invalid')}
}
export function normalizeTools(raw){
  need(Array.isArray(raw)&&raw.length<=64,'capability_tools_invalid')
  const seen=new Set()
  const tools=raw.map(t=>{
    need(plain(t)&&typeof t.name==='string'&&t.name.length>0&&t.name.length<=128&&!/[\x00-\x1f]/.test(t.name)&&!seen.has(t.name),'capability_tools_invalid');seen.add(t.name)
    schemaValidator(t.inputSchema)
    if(t.outputSchema)schemaValidator(t.outputSchema)
    return {name:t.name,description:typeof t.description==='string'?t.description.slice(0,1024):'',inputSchema:t.inputSchema,
      ...(t.outputSchema?{outputSchema:t.outputSchema}:{}),annotations:{readOnlyHint:t.annotations?.readOnlyHint===true}}
  })
  need(Buffer.byteLength(JSON.stringify(tools))<=64*1024,'capability_tools_too_large')
  return tools.sort((a,b)=>a.name.localeCompare(b.name))
}
const substitute=(value,env)=>value.replace(/\$\{(MORROW_PLUGIN_[A-Z0-9_]{1,80})\}/g,(_,key)=>{
  need(typeof env[key]==='string'&&env[key].length>0&&env[key].length<=4096,'capability_credential_missing');return env[key]
})
const limitedFetch=(signal)=>async(url,init)=>{
  const response=await fetch(url,{...init,redirect:'error',signal:AbortSignal.any([signal,...(init?.signal?[init.signal]:[])])})
  if(!response.body)return response
  let bytes=0
  const body=response.body.pipeThrough(new TransformStream({transform(chunk,controller){
    bytes+=chunk.byteLength
    if(bytes>256*1024)throw capError('capability_response_too_large')
    controller.enqueue(chunk)
  }}))
  return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers})
}

export function createMcpAdapter({root,python,env=process.env,timeoutMs=20000}={}){
  if(!path.isAbsolute(root)||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw capError('capability_configuration_invalid')
  async function invoke(connection,{signal,tool,arguments:args}={}){
    const controller=new AbortController(),aborted=()=>controller.abort()
    signal?.addEventListener('abort',aborted,{once:true})
    if(signal?.aborted)controller.abort()
    const timer=setTimeout(aborted,timeoutMs)
    let transport,client,started=false,closed=false,sent=false,closeResolve
    const closedPromise=new Promise(resolve=>{closeResolve=resolve})
    try{
      if(controller.signal.aborted)throw capError('capability_aborted')
      if(connection.type==='stdio'){
        const home=path.join(root,hash(connection).slice(0,32))
        await guardPath(home,{create:true});await guardPath(path.join(home,'tmp'),{create:true})
        // The SDK merges a default environment: explicitly replace its home/config paths.
        // This avoids inherited account configuration; it is NOT an OS sandbox.
        const childEnv=Object.fromEntries(DEFAULT_INHERITED_ENV_VARS.map(k=>[k,'']))
        for(const key of ['SYSTEMROOT','WINDIR','COMSPEC','PATH','PATHEXT']){
          const value=Object.entries(env).find(([name])=>name.toUpperCase()===key)?.[1]
          if(value)childEnv[key]=value
        }
        Object.assign(childEnv,{HOME:home,USERPROFILE:home,APPDATA:home,LOCALAPPDATA:home,TEMP:path.join(home,'tmp'),TMP:path.join(home,'tmp'),PYTHONNOUSERSITE:'1'})
        for(const [key,value] of Object.entries(connection.env??{}))childEnv[key]=substitute(value,env)
        const command=connection.command==='node'?process.execPath:connection.command==='python'?python:connection.command
        need(typeof command==='string'&&path.isAbsolute(command),'capability_executable_missing')
        need((await fs.stat(command)).isFile(),'capability_executable_missing')
        transport=new StdioClientTransport({command,args:connection.args??[],env:childEnv,cwd:home,stderr:'pipe',maxBufferSize:256*1024})
        transport.stderr?.on('data',()=>{}) // Never publish third-party logs, which can contain credentials.
      }else if(connection.type==='http'){
        const headers=Object.fromEntries(Object.entries(connection.headers??{}).map(([key,value])=>[key,substitute(value,env)]))
        transport=new StreamableHTTPClientTransport(new URL(connection.url),{requestInit:{headers},fetch:limitedFetch(controller.signal),
          reconnectionOptions:{maxRetries:0},reconnectionScheduler:()=>()=>{},onInsufficientScope:'throw',maxStepUpRetries:0})
      }else throw capError('capability_transport_not_supported')
      transport.onclose=()=>{closed=true;closeResolve()}
      const originalStart=transport.start.bind(transport)
      transport.start=async()=>{await originalStart();started=true}
      client=new Client({name:'morrow',version:'0.1.0'},{capabilities:{},versionNegotiation:{mode:'legacy'},inputRequired:{autoFulfill:false}})
      const options={signal:controller.signal,timeout:timeoutMs,resetTimeoutOnProgress:false}
      await client.connect(transport,options)
      const rows=[],cursors=new Set();let cursor
      do{
        const page=await client.listTools(cursor?{cursor}:{},options)
        rows.push(...page.tools);need(rows.length<=64,'capability_tools_too_large')
        cursor=page.nextCursor
        need(!cursor||!cursors.has(cursor),'capability_tools_invalid');cursors.add(cursor)
      }while(cursor)
      const tools=normalizeTools(rows)
      if(!tool)return {tools}
      const current=tools.find(t=>t.name===tool.name)
      need(current&&stable(current)===stable(tool)&&current.annotations.readOnlyHint,'capability_tools_changed')
      need(schemaValidator(current.inputSchema)(args),'capability_arguments_invalid')
      if(controller.signal.aborted)throw capError('capability_aborted')
      // After this point a lost response is uncertain, never automatically retried.
      sent=true
      const result=await client.callTool({name:current.name,arguments:args},options)
      const content=(result.content??[]).filter(p=>p.type==='text').map(p=>({type:'text',text:p.text}))
      const receipt={content,...(result.structuredContent===undefined?{}:{structuredContent:result.structuredContent}),
        omittedNonText:(result.content??[]).length!==content.length,isError:result.isError===true}
      need(Buffer.byteLength(JSON.stringify(receipt))<=24*1024,'capability_response_too_large')
      return {status:result.isError?'failed':'succeeded',result:receipt,error:result.isError?'capability_tool_failed':null}
    }catch(error){
      const code=/^capability_[a-z_]{1,50}$/.test(error?.code??'')?error.code:controller.signal.aborted?'capability_aborted':'capability_connection_failed'
      throw Object.assign(capError(code),{outcome:sent?'unknown':'failed'})
    }finally{
      clearTimeout(timer);signal?.removeEventListener('abort',aborted)
      if(transport){
        await (client?.close()??transport.close()).catch(()=>{})
        if(connection.type==='stdio'&&started&&!closed){
          let closeTimer
          await Promise.race([closedPromise,new Promise(resolve=>{closeTimer=setTimeout(resolve,2500)})]);clearTimeout(closeTimer)
          if(!closed)throw Object.assign(capError('capability_cleanup_unknown'),{outcome:'unknown'})
        }
      }
      controller.abort()
    }
  }
  return {list:(connection,options)=>invoke(connection,options),call:(connection,options)=>invoke(connection,options)}
}
