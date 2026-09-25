param([string]$HomePath='', [switch]$Offline)
$ErrorActionPreference='Stop'
$workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if($HomePath){$env:PERSONAL_AI_HOME=[IO.Path]::GetFullPath($HomePath)}
if($Offline){$env:MORROW_OFFLINE='1'}
$configPath=Join-Path $workspace 'runtime.json'
if(Test-Path -LiteralPath $configPath){$config=Get-Content -LiteralPath $configPath -Raw|ConvertFrom-Json;$electron=Join-Path $workspace $config.electron}
else{$electron=Join-Path $workspace '.local-tools/electron-44.4.4/dist/electron.exe'}
Start-Process -FilePath $electron -ArgumentList ('"'+(Join-Path $workspace 'apps/desktop/native/main.cjs')+'"') -WorkingDirectory $workspace -WindowStyle Hidden
