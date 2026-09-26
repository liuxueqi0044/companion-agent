import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import platform from '../../../apps/desktop/product/platform.cjs'

const exec=promisify(execFile)
test('built-in Windows PowerShell reads synthetic DPAPI written by PS 7 and itself', {skip:process.platform!=='win32'}, async()=>{
  await fs.mkdir('.test-data',{recursive:true})
  const root=await fs.mkdtemp(path.resolve('.test-data/core018-credential-fixture-'))
  const value='morrow-offline-synthetic-value-not-a-real-key'
  for(const writer of ['pwsh',platform.systemPowerShell()]){
    const file=path.join(root,writer==='pwsh'?'ps7.dpapi':'ps5.dpapi')
    await exec(writer,['-NoProfile','-NonInteractive','-Command',
      "$ErrorActionPreference='Stop'; $s=ConvertTo-SecureString -String $env:MORROW_TEST_VALUE -AsPlainText -Force; [IO.File]::WriteAllText($env:MORROW_TEST_FILE,(ConvertFrom-SecureString -SecureString $s)); $s.Dispose()"],
      {windowsHide:true,env:{...(writer==='pwsh'?process.env:platform.powerShellEnvironment()),MORROW_TEST_VALUE:value,MORROW_TEST_FILE:file}})
    const result=await exec(platform.systemPowerShell(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.resolve('tools/load_product_credential.ps1'),'-CredentialPath',file],{windowsHide:true,env:platform.powerShellEnvironment()})
    assert.equal(result.stdout,value)
    assert.equal(result.stderr,'')
  }
  const corrupted=path.join(root,'invalid.dpapi');await fs.writeFile(corrupted,'not-encrypted')
  await assert.rejects(exec(platform.systemPowerShell(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.resolve('tools/load_product_credential.ps1'),'-CredentialPath',corrupted],{windowsHide:true,env:platform.powerShellEnvironment()}),e=>e.code===1&&e.stderr==='credential_decode_failed')
})
