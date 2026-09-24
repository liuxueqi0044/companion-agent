param([string]$Destination = '', [switch]$NoShortcut)
$ErrorActionPreference='Stop'
$source=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if(-not $Destination){$Destination=Join-Path $env:LOCALAPPDATA ('Programs/Morrow/releases/'+(Get-Date -Format 'yyyyMMdd-HHmmss'))}
$Destination=[IO.Path]::GetFullPath($Destination)
if(Test-Path -LiteralPath $Destination){throw 'Install destination must be new. Existing releases are preserved.'}
$manifest=Get-Content -LiteralPath (Join-Path $source 'release-manifest.json') -Raw|ConvertFrom-Json
# Verify every listed file before installation; do not copy unlisted files or local runtime data.
foreach($item in $manifest.files){
  $file=[IO.Path]::GetFullPath((Join-Path $source $item.path))
  if(-not $file.StartsWith($source+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid release path'}
  if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $item.sha256){throw ('Release integrity error: '+$item.path)}
}
[IO.Directory]::CreateDirectory($Destination)|Out-Null
foreach($item in $manifest.files){
  $target=[IO.Path]::GetFullPath((Join-Path $Destination $item.path))
  if(-not $target.StartsWith($Destination+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid target path'}
  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))|Out-Null
  Copy-Item -LiteralPath (Join-Path $source $item.path) -Destination $target
}
Copy-Item -LiteralPath (Join-Path $source 'release-manifest.json') -Destination (Join-Path $Destination 'release-manifest.json')
if (-not $NoShortcut) {
$shell=New-Object -ComObject WScript.Shell
$shortcut=$shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Programs')) 'Morrow.lnk'))
$shortcut.TargetPath=(Get-Command pwsh.exe).Source
$shortcut.Arguments='-NoProfile -STA -WindowStyle Hidden -File "'+(Join-Path $Destination 'tools/morrow_tray.ps1')+'"'
$shortcut.WorkingDirectory=$Destination;$shortcut.Description='Morrow · 我的 AI';$shortcut.Save()
}
if($NoShortcut){[Console]::WriteLine('Installed without a shortcut. No startup task was created.')}
else{[Console]::WriteLine('Installed. Open Morrow from the Start menu. No startup task was created.')}
