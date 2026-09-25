# Optional developer setup. Download one pinned official runtime into a NEW local directory.
$ErrorActionPreference='Stop'
$workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$destination=Join-Path $workspace '.local-tools/electron-44.4.4'
if(Test-Path -LiteralPath $destination){throw 'Runtime directory already exists; verify it instead of overwriting it.'}
[IO.Directory]::CreateDirectory($destination)|Out-Null
$archive=Join-Path $destination 'electron.zip'
Invoke-WebRequest -Uri 'https://github.com/electron/electron/releases/download/v44.4.4/electron-v44.4.4-win32-x64.zip' -OutFile $archive
if((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne '47a3097f1e14030c99937a5ff9534446f44cf0c0032b88f2466360bab4ca9cdc'){throw 'Electron distribution hash mismatch; archive retained for inspection.'}
Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $destination 'dist')
'Verified Electron 44.4.4. Start with tools/start_morrow.ps1.'
