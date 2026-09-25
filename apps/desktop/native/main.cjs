'use strict'
const {app,BrowserWindow,ipcMain,Menu,Tray,nativeImage,Notification,dialog,powerMonitor}=require('electron')
const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process')
const {DEFAULT_WINDOW,windowPatch,localOrigin,navigationAllowed,requestAllowed}=require('./policy.cjs')
const root=path.resolve(__dirname,'../../..'),home=path.resolve(process.env.PERSONAL_AI_HOME||path.join(process.env.LOCALAPPDATA,'Morrow/data'))
const pause=ms=>new Promise(r=>setTimeout(r,ms))
let state,child,window,tray,closing=false,settings={...DEFAULT_WINDOW},notices,owned=false,recreating=false,configuring=false
app.setName('Morrow');app.setAppUserModelId('org.morrow.personalai')
app.setPath('userData',path.join(home,'desktop'))
if(!app.requestSingleInstanceLock()){app.quit()}else{
app.on('second-instance',()=>show())
app.on('window-all-closed',()=>{})
app.on('before-quit',e=>{if(!closing){e.preventDefault();void quit()}})
app.whenReady().then(start).catch(async()=>{await dialog.showMessageBox({type:'error',title:'Morrow 启动未完成',message:'本地服务暂时无法启动。',detail:'你的数据已保留。可以重新打开，或查看数据目录中的 server.stderr.txt。'});await quit()})
}
async function native(action,args={}){
  if(!localOrigin(state?.url))throw Error('invalid_service_address')
  const r=await fetch(state.url+'/api/native',{method:'POST',headers:{'Content-Type':'application/json','X-Morrow-Native':state.nativeToken},body:JSON.stringify({action,args}),signal:AbortSignal.timeout(4000)})
  if(!r.ok)throw Error('service_unavailable');return r.json()
}
async function start(){
  const {guardPath}=await import('../product/storage.mjs');await guardPath(home,{create:true})
  const settingFile=path.join(home,'desktop-window.json');await guardPath(settingFile)
  try{settings={...settings,...windowPatch(JSON.parse(await fs.readFile(settingFile,'utf8')))}}catch{}
  try{state=JSON.parse(await fs.readFile(path.join(home,'personal-space-server.json'),'utf8'));if(!(await native('status')).ok)state=null}catch{state=null}
  if(!state){
    let installed={};try{installed=JSON.parse(await fs.readFile(path.join(root,'runtime.json'),'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
    const donorNode=path.resolve(root,'../companion-agent/.local-tools/node-v24.21.0-win-x64/node.exe')
    let node=process.env.PERSONAL_AI_NODE||(installed.node?path.join(root,installed.node):null)
    if(!node){try{await fs.access(donorNode);node=donorNode}catch{node='node.exe'}}
    const credential=process.env.PERSONAL_AI_CREDENTIAL_FILE||path.join(process.env.LOCALAPPDATA,'CompanionAgent/credentials/deepseek.dpapi')
    let live=false;try{live=process.env.MORROW_OFFLINE!=='1'&&(await fs.stat(credential)).isFile()}catch{}
    const log=await fs.open(path.join(home,'server.stderr.txt'),'a')
    let bootError=false
    child=spawn(node,[path.join(root,'tools/personal_space.mjs'),...(live?['--deepseek']:[])],{cwd:root,windowsHide:true,env:{...process.env,PERSONAL_AI_HOME:home,PERSONAL_AI_PORT:'0'},stdio:['ignore','ignore',log.fd]});child.on('error',()=>{bootError=true});await log.close()
    owned=true
    for(let i=0;i<150;i++){
      if(bootError||child.exitCode!==null)throw Error('service_failed')
      try{const candidate=JSON.parse(await fs.readFile(path.join(home,'personal-space-server.json'),'utf8'));if(candidate.pid===child.pid){state=candidate;if((await native('status')).ok)break;state=null}}catch{state=null}
      await pause(100)
    }
    if(!state)throw Error('startup_timeout')
  }
  createWindow()
  // Small original icon; no third-party assets.
  const pixels=Buffer.alloc(32*32*4);for(let y=0;y<32;y++)for(let x=0;x<32;x++){const i=(y*32+x)*4,inside=(x-16)**2+(y-16)**2<190;pixels[i]=inside?123:0;pixels[i+1]=inside?168:0;pixels[i+2]=inside?204:0;pixels[i+3]=inside?255:0}
  tray=new Tray(nativeImage.createFromBitmap(pixels,{width:32,height:32}));tray.setToolTip('Morrow · 我的 AI');tray.on('double-click',()=>show())
  tray.setContextMenu(Menu.buildFromTemplate([
    {label:'打开我的 AI',click:()=>show()},
    {label:'恢复默认窗口与界面管理',click:()=>void recover()},
    {label:'暂停 / 恢复后台消息',click:async()=>{try{const s=await native('status');await native('background.configure',{paused:!s.result.background.paused})}catch{}}},
    {label:'配置 DeepSeek（保存后重启）',click:()=>{spawn('pwsh.exe',['-NoProfile','-STA','-File',path.join(root,'tools/configure_deepseek.ps1')],{windowsHide:true,stdio:'ignore'}).on('error',()=>void dialog.showMessageBox({message:'需要安装 PowerShell 7 才能打开凭据配置。',type:'info'}))}},
    {type:'separator'},{label:owned?'退出 Morrow':'关闭桌面（保留现有服务）',click:()=>void quit()},
  ]))
  let sequence=0;try{sequence=JSON.parse(await fs.readFile(path.join(home,'notification.json'),'utf8')).sequence}catch{}
  notices=setInterval(async()=>{try{const n=JSON.parse(await fs.readFile(path.join(home,'notification.json'),'utf8'));if(Number.isSafeInteger(n.sequence)&&n.sequence>sequence){sequence=n.sequence;if(n.count>0&&Notification.isSupported()){const notice=new Notification({title:'Morrow',body:'你的 AI 有新消息。点击查看。'});notice.on('click',()=>show());notice.show()}}}catch{}},3000)
  powerMonitor.on('resume',()=>{if(window&&!window.isDestroyed())window.webContents.reload()})
  // Smoke mode is available only with an explicit isolated data root and offline service.
  if(process.env.MORROW_NATIVE_SMOKE==='1'&&process.env.MORROW_OFFLINE==='1'&&process.env.PERSONAL_AI_HOME&&owned&&state.live===false)void smoke()
}
function protect(contents){
  contents.setWindowOpenHandler(()=>({action:'deny'}))
  contents.on('will-attach-webview',e=>e.preventDefault())
  contents.on('will-navigate',(e,url)=>{if(!navigationAllowed(url,state.url))e.preventDefault()})
  contents.on('will-frame-navigate',(e)=>{if(!navigationAllowed(e.url,state.url,{main:e.isMainFrame}))e.preventDefault()})
  contents.on('will-redirect',(e,url)=>{if(!navigationAllowed(url,state.url))e.preventDefault()})
  contents.on('before-input-event',(_e,input)=>{if(input.control&&input.shift&&input.key==='Backspace')void recover()})
  contents.on('render-process-gone',()=>{if(!closing&&!recreating)setTimeout(()=>void recover(),200)})
  contents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false))
  contents.session.setPermissionCheckHandler(()=>false)
  contents.session.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!requestAllowed(details.url,state.url)}))
  if(!contents.session.morrowDownloads){contents.session.morrowDownloads=true;contents.session.on('will-download',(_e,item)=>{item.setSaveDialogOptions({title:'保存 AI 成果',defaultPath:path.join(app.getPath('downloads'),path.basename(item.getFilename()))})})}
}
function createWindow(route='/'){
  const previous=window
  window=new BrowserWindow({width:settings.width,height:settings.height,minWidth:240,minHeight:240,frame:settings.frame,transparent:settings.transparent,alwaysOnTop:settings.alwaysOnTop,
    backgroundColor:settings.transparent?'#00000000':'#f5f1eb',show:false,title:'Morrow · 我的 AI',autoHideMenuBar:true,
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true,webviewTag:false,partition:'persist:morrow'}})
  const own=window;own.setOpacity(settings.opacity);own.setMenu(null);protect(own.webContents)
  own.on('close',e=>{if(!closing&&!recreating){e.preventDefault();own.hide()}})
  own.once('ready-to-show',()=>{if(!own.isDestroyed()){own.show();own.setAlwaysOnTop(settings.alwaysOnTop,'pop-up-menu')}});void own.loadURL(state.url+route)
  if(previous&&!previous.isDestroyed()){recreating=true;previous.destroy();recreating=false}
}
function show(){if(!window||window.isDestroyed())createWindow();else{window.show();window.restore();window.focus()}}
async function configure(patch,{deferRebuild=false}={}){
  if(configuring)return {ok:false,error:'window_busy'};configuring=true
  try{
    const next={...settings,...windowPatch(patch)}
    if(next.transparent)next.frame=false
    const rebuild=next.frame!==settings.frame||next.transparent!==settings.transparent
    const {writeJSON}=await import('../product/storage.mjs');await writeJSON(path.join(home,'desktop-window.json'),next);settings=next
    if(rebuild){if(deferRebuild)setTimeout(()=>{if(!closing)createWindow()},80);else createWindow()}
    else{window.setSize(settings.width,settings.height);window.setAlwaysOnTop(settings.alwaysOnTop,'pop-up-menu');window.setOpacity(settings.opacity)}
    return {ok:true,result:settings}
  }finally{configuring=false}
}
async function recover(){try{await configure(DEFAULT_WINDOW);await window.loadURL(state.url+'/recover')}catch{show()}}
ipcMain.handle('morrow:window',async(event,value)=>{
  try{
    if(event.sender!==window?.webContents||event.senderFrame!==event.sender.mainFrame||!navigationAllowed(event.senderFrame.url,state.url))return {ok:false,error:'scope_denied'}
    if(!value||typeof value.mountId!=='string'||!/^[a-f0-9]{48}$/.test(value.mountId))return {ok:false,error:'invalid_request'}
    const patch=windowPatch(value.settings),authorized=await native('window.authorize',{mountId:value.mountId,settings:patch})
    if(!authorized.ok)return authorized
    // No await after the fresh authorization: stale windows cannot perform a later write.
    if(event.sender!==window?.webContents)return {ok:false,error:'interface_revoked'}
    return await configure(patch,{deferRebuild:true})
  }catch{return {ok:false,error:'window_configuration_failed'}}
})
async function quit(){
  if(closing)return;closing=true;clearInterval(notices);tray?.destroy()
  if(owned){try{await native('quit')}catch{};if(child&&child.exitCode===null){for(let i=0;i<60&&child.exitCode===null;i++)await pause(100);if(child.exitCode===null)child.kill()}}
  app.quit()
}
async function smoke(){
  const result={version:app.getVersion(),checks:[],error:null}
  try{
    for(let i=0;i<100;i++){if(!window.webContents.isLoading())break;await pause(100)}
    result.checks.push({name:'local_service',passed:(await native('status')).ok})
    const prefs=window.webContents.getLastWebPreferences();result.checks.push({name:'renderer_isolation',passed:prefs.sandbox&&prefs.contextIsolation&&!prefs.nodeIntegration})
    let mountId
    for(let i=0;i<80&&!mountId;i++){mountId=await window.webContents.executeJavaScript(`document.querySelector('iframe')?.src.split('/').at(-1)`);if(!mountId)await pause(100)}
    const denied=await window.webContents.executeJavaScript(`morrowDesktop.configureWindow('${'0'.repeat(48)}',{width:420})`)
    result.checks.push({name:'unknown_mount_denied',passed:denied.ok===false})
    const permitted=await window.webContents.executeJavaScript(`morrowDesktop.configureWindow(${JSON.stringify(mountId)},{width:444})`)
    result.checks.push({name:'actual_preload_native_scoped_window',passed:permitted.ok===true&&Math.abs(window.getSize()[0]-444)<=2})
    let author
    for(let i=0;i<60&&!author;i++){author=window.webContents.mainFrame.frames.find(f=>f.url.includes('/interface-frame/'));if(!author)await pause(100)}
    const authorGlobals=author?await author.executeJavaScript(`({native:typeof morrowDesktop,node:typeof require,process:typeof process})`):null
    result.checks.push({name:'author_frame_has_no_native_bridge',globals:authorGlobals,passed:authorGlobals?.native==='undefined'&&authorGlobals?.node==='undefined'&&authorGlobals?.process==='undefined'})
    const before=state.pid;window.close();result.checks.push({name:'close_hides_service_survives',passed:!window.isVisible()&&(await native('status')).ok&&state.pid===before})
    show();await configure({width:420,height:520,frame:false,transparent:true,alwaysOnTop:true});await pause(1200)
    const size=window.getSize();result.checks.push({name:'shape_change_shared_service',size,alwaysOnTop:window.isAlwaysOnTop(),passed:Math.abs(size[0]-420)<=2&&window.isAlwaysOnTop()&&(await native('status')).ok&&state.pid===before})
    await recover();await pause(1500);result.checks.push({name:'trusted_recovery',passed:window.webContents.getURL()===state.url+'/recover'&&settings.frame})
    const proof=await window.webContents.executeJavaScript(`Promise.all([fetch('https://example.com').then(()=>false,()=>true),Promise.resolve(typeof process==='undefined'&&typeof require==='undefined')])`)
    result.checks.push({name:'external_network_denied',passed:proof[0]});result.checks.push({name:'no_node_in_renderer',passed:proof[1]})
  }catch(e){result.error=String(e.message)}
  await fs.writeFile(path.join(home,'native-smoke.json'),JSON.stringify(result,null,2));if(process.env.MORROW_NATIVE_KEEP_OPEN!=='1')await quit()
}
