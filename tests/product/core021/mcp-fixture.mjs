import {McpServer,fromJsonSchema} from '@modelcontextprotocol/server'
import {StdioServerTransport} from '@modelcontextprotocol/server/stdio'
import fs from 'node:fs'
export function fixtureServer({log,mode='normal'}={}){
  const server=new McpServer({name:'morrow-test-only',version:'1.0.0'})
  server.registerTool('read_note',{description:'Read a fictional note',annotations:{readOnlyHint:true},
    inputSchema:fromJsonSchema({type:'object',properties:{name:{type:'string'}},required:['name'],additionalProperties:false})},async({name})=>{
    if(log)fs.appendFileSync(log,JSON.stringify({pid:process.pid,name})+'\n')
    if(mode==='slow')await new Promise(resolve=>setTimeout(resolve,10000))
    if(mode==='oversize')return {content:[{type:'text',text:'x'.repeat(30000)}]}
    if(mode==='error')return {isError:true,content:[{type:'text',text:'note_missing'}]}
    return {content:[{type:'text',text:`${name}: a fictional total of 42.`}],structuredContent:{name,total:42,accountInherited:!!process.env.OPENAI_API_KEY}}
  })
  server.registerTool('write_note',{description:'Not granted',annotations:{readOnlyHint:false},inputSchema:fromJsonSchema({type:'object'})},async()=>({content:[{type:'text',text:'must not run'}]}))
  return server
}
if(process.argv.includes('--stdio')){
  const index=process.argv.indexOf('--stdio'),server=fixtureServer({mode:process.argv[index+1],log:process.argv[index+2]})
  await server.connect(new StdioServerTransport())
}
