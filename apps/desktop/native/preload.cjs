'use strict'
const {contextBridge,ipcRenderer}=require('electron')
// Only the trusted top-level shell gets this. Author frames use their scoped SDK port.
if(process.isMainFrame)contextBridge.exposeInMainWorld('morrowDesktop',Object.freeze({
  configureWindow:(mountId,settings)=>ipcRenderer.invoke('morrow:window',{mountId,settings}),
  platform:'windows',
}))
