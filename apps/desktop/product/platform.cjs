'use strict'
const path=require('node:path')

// Windows ships this host. DPAPI SecureString blobs are compatible with PS 7;
// installing the desktop app must not require another shell on a fresh machine.
function systemPowerShell(){
  if(process.platform!=='win32')return 'pwsh'
  const root=process.env.SystemRoot
  if(!root||!path.win32.isAbsolute(root))throw Error('windows_system_root_missing')
  return path.win32.join(root,'System32','WindowsPowerShell','v1.0','powershell.exe')
}
function powerShellEnvironment(){
  if(process.platform!=='win32')return {...process.env}
  // A Node/Python child of PS 7 inherits its incompatible module directory.
  // Load only Windows' own modules in this PS 5 process; no global changes.
  return {...process.env,PSModulePath:path.win32.join(path.win32.dirname(systemPowerShell()),'Modules')}
}
module.exports={systemPowerShell,powerShellEnvironment}
