/** Parse plugin source as data. Import never installs dependencies or runs code. */
import {createHash} from 'node:crypto'
import path from 'node:path'
import {parseDocument} from 'yaml'

export const capError=code=>Object.assign(new Error(code),{code})
export const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)
export const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex')
const need=(v,code='capability_invalid_package')=>{if(!v)throw capError(code)}
const text=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max
const cleanPath=v=>{need(text(v,180)&&!v.includes('\\')&&!v.includes(':')&&!v.startsWith('/')&&!v.split('/').some(p=>!p||p==='.'||p==='..'||/[\x00-\x1f]/.test(p)));return v}
const publicSource=v=>{if(!v)return '';try{const u=new URL(v);need(u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash);return u.href}catch{throw capError('capability_source_invalid')}}
const json=s=>{try{const v=JSON.parse(s);need(plain(v));return v}catch{throw capError('capability_manifest_invalid')}}
const ref=/^\$\{(MORROW_PLUGIN_[A-Z0-9_]{1,80})\}$/

export function normalizeConnection(raw){
  const issues=[]
  if(!plain(raw))return {issues:['invalid_connection'],connection:{}}
  const type=raw.type??(raw.command?'stdio':'http')
  const connection={type:type==='streamable-http'||type==='streamable_http'?'http':type}
  if(!['stdio','http'].includes(connection.type))issues.push('transport_not_supported')
  for(const key of Object.keys(raw))if(!['type','url','command','args','env','headers','bearer_token_env_var'].includes(key))issues.push('connection_field_not_supported:'+key)
  if(connection.type==='http'){
    try{const u=new URL(raw.url);need((u.protocol==='https:'||u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname))&&!u.username&&!u.password&&!u.search&&!u.hash);connection.url=u.href}catch{issues.push('endpoint_not_supported')}
    connection.headers={}
    if(raw.headers!==undefined&&!plain(raw.headers))issues.push('invalid_headers')
    for(const [name,value] of Object.entries(raw.headers??{})){
      if(!/^[A-Za-z-]{1,60}$/.test(name)||!text(value,180)||!(ref.test(value)||/^Bearer \$\{MORROW_PLUGIN_[A-Z0-9_]{1,80}\}$/.test(value)))issues.push('credential_reference_required')
      else connection.headers[name]=value
    }
    if(raw.bearer_token_env_var){
      if(!/^MORROW_PLUGIN_[A-Z0-9_]{1,80}$/.test(raw.bearer_token_env_var))issues.push('credential_reference_required')
      else connection.headers.Authorization='Bearer ${'+raw.bearer_token_env_var+'}'
    }
  }else if(connection.type==='stdio'){
    if(!text(raw.command,300)||!['node','python'].includes(raw.command)&&!path.isAbsolute(raw.command))issues.push('executable_needs_configuration')
    else connection.command=raw.command
    if(raw.args!==undefined&&(!Array.isArray(raw.args)||raw.args.length>32||raw.args.some(a=>typeof a!=='string'||a.length>2048||a.includes('\0')||a.includes('${'))))issues.push('arguments_not_supported')
    else connection.args=raw.args??[]
    connection.env={}
    if(raw.env!==undefined&&!plain(raw.env))issues.push('invalid_environment')
    for(const [key,value] of Object.entries(raw.env??{})){
      if(!/^[A-Za-z_][A-Za-z0-9_]{0,80}$/.test(key)||!text(value,120)||!ref.test(value))issues.push('credential_reference_required')
      else connection.env[key]=value
    }
  }
  return {connection,issues:[...new Set(issues)]}
}

export function importCapability(input){
  need(plain(input)&&Object.keys(input).every(k=>['name','source','files'].includes(k))&&Array.isArray(input.files)&&input.files.length>0&&input.files.length<=100)
  const files=new Map();let bytes=0
  for(const file of input.files){
    need(plain(file)&&Object.keys(file).sort().join('|')==='content|path'&&typeof file.content==='string')
    const name=cleanPath(file.path);need(![...files.keys()].some(p=>p.toLowerCase()===name.toLowerCase()),'capability_duplicate_path')
    bytes+=Buffer.byteLength(file.content);need(Buffer.byteLength(file.content)<=64*1024&&bytes<=192*1024,'capability_input_too_large')
    files.set(name,file.content)
  }
  let manifest={},format='agent-skills'
  for(const [name,type] of [['plugin.json','agent-plugins'],['.codex-plugin/plugin.json','codex'],['.claude-plugin/plugin.json','claude']])if(files.has(name)){manifest=json(files.get(name));format=type;break}
  const overlay=manifest.extensions?.['com.openai']??(format==='agent-plugins'&&files.has('.codex-plugin/plugin.json')?json(files.get('.codex-plugin/plugin.json')):manifest)
  need(plain(overlay))
  let name=manifest.name??input.name??'我的能力';need(text(name,160))
  const source=publicSource(input.source??manifest.repository?.url??(typeof manifest.repository==='string'?manifest.repository:''))
  const issues=[]
  for(const feature of ['hooks','agents','commands','monitors','workflows','lspServers','apps','settings','dependencies']){
    if(overlay[feature]||manifest[feature]||[...files.keys()].some(p=>p.startsWith(feature+'/'))||(feature==='apps'&&files.has('.app.json')))issues.push('requires_host_component:'+feature)
  }
  const roots=overlay.skills===undefined?['skills/']:(Array.isArray(overlay.skills)?overlay.skills:[overlay.skills]).map(r=>{need(typeof r==='string');return r.replace(/^\.\//,'').replace(/\/$/,'')+'/'})
  if(format==='agent-skills'||format==='agent-plugins')roots.push('skills/')
  const skillPaths=[...files.keys()].filter(p=>p==='SKILL.md'||p.endsWith('/SKILL.md')&&roots.some(root=>p.startsWith(root)))
  const components=[]
  for(const file of skillPaths){
    const sourceText=files.get(file),match=/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(sourceText)
    need(match,'capability_skill_invalid')
    const doc=parseDocument(match[1],{uniqueKeys:true,prettyErrors:false,schema:'failsafe',customTags:[],logLevel:'silent'})
    need(!doc.errors.length&&!doc.warnings.length,'capability_skill_invalid')
    let meta;try{meta=doc.toJS({maxAliasCount:0})}catch{throw capError('capability_skill_invalid')}
    need(plain(meta)&&text(meta.name,64)&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(meta.name)&&text(meta.description,1024)&&Buffer.byteLength(match[2])<=16*1024,'capability_skill_invalid')
    const root=file.slice(0,-'SKILL.md'.length),partIssues=[]
    if(meta['allowed-tools'])partIssues.push('requires_tool_mapping')
    if(meta.compatibility)partIssues.push('requires_environment_review')
    if([...files.keys()].some(p=>p.startsWith(root+'scripts/')))partIssues.push('requires_script_runtime')
    if(files.has(root+'agents/openai.yaml'))partIssues.push('requires_dependency_mapping')
    const resources={};let size=0
    for(const [key,content] of files)if(key.startsWith(root+'references/')){
      size+=Buffer.byteLength(content);need(size<=24*1024,'capability_input_too_large');resources[key.slice(root.length)]=content
    }
    components.push({id:'skill.'+hash(file).slice(0,20),kind:'skill',name:meta.name,description:meta.description,
      instructions:match[2],resources,issues:partIssues})
  }
  const configs=[]
  for(const file of ['mcp.json','.mcp.json'])if(files.has(file))configs.push(json(files.get(file)))
  const addConfig=value=>{if(typeof value==='string'){const file=cleanPath(value.replace(/^\.\//,''));need(files.has(file),'capability_missing_file');configs.push(json(files.get(file)))}else if(plain(value))configs.push(value.mcpServers?value:{mcpServers:value});else need(false)}
  if(overlay.mcpServers)for(const value of Array.isArray(overlay.mcpServers)?overlay.mcpServers:[overlay.mcpServers])addConfig(value)
  if(format==='agent-skills'&&configs.length)format='mcp'
  const servers=new Map()
  for(const config of configs){need(plain(config.mcpServers));for(const [key,value] of Object.entries(config.mcpServers)){
    need(/^[a-zA-Z0-9_.-]{1,80}$/.test(key));const old=servers.get(key);need(!old||JSON.stringify(old)===JSON.stringify(value),'capability_server_conflict');servers.set(key,value)
  }}
  for(const [key,raw] of servers){const parsed=normalizeConnection(raw);components.push({id:'mcp.'+key,kind:'mcp',name:key,description:'连接 '+key+' 提供的工具',...parsed})}
  need(components.length>0&&components.length<=32,'capability_components_missing')
  if(!manifest.name&&!input.name&&components.length===1)name=components[0].name
  const sourceHash=hash([...files].sort(([a],[b])=>a<b?-1:a>b?1:0))
  const identity=hash([format,name,source]).slice(0,32)
  const definition={id:identity,name,description:typeof manifest.description==='string'?manifest.description.slice(0,1000):components[0].description,
    source,license:typeof manifest.license==='string'?manifest.license.slice(0,160):null,format,issues:[...new Set(issues)],components}
  // Pin both source bytes and effective adapter semantics. A parser upgrade can
  // stage a new version without inheriting old permissions or hash conflicts.
  return {...definition,hash:hash({importer:1,sourceHash,definition})}
}
