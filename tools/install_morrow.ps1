param([string]$Destination = '', [switch]$NoShortcut, [switch]$NoRegistration)
$ErrorActionPreference='Stop'

. (Join-Path $PSScriptRoot 'release_paths.ps1')

$source=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if(-not $Destination){$Destination=Join-Path $env:LOCALAPPDATA ('Programs/Morrow/releases/'+(Get-Date -Format 'yyyyMMdd-HHmmss-fff'))}
$Destination=[IO.Path]::GetFullPath($Destination).TrimEnd([IO.Path]::DirectorySeparatorChar)
Assert-PlainPath $source; Assert-PlainPath $Destination
if(Test-Path -LiteralPath $Destination){throw 'Install destination must be new. Existing releases are preserved.'}
if($Destination.StartsWith($source+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Install destination must be outside the release source.'}
$manifestPath=Join-Path $source 'release-manifest.json';Assert-PlainPath $manifestPath
$manifest=Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8|ConvertFrom-Json
if($manifest.format -ne 'morrow-release/1' -or $manifest.files -isnot [array] -or $manifest.files.Count -eq 0 -or $manifest.files.Count -gt 20000){throw 'Invalid release manifest'}
$seen=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)

# Validate the complete input before creating any destination. Hashes detect
# corruption; this is not a signature or proof of a package publisher's identity.
foreach($item in $manifest.files){
  $file=Resolve-ReleasePath $source $item.path
  $null=Resolve-ReleasePath $Destination $item.path
  if($item.path -in @('release-manifest.json','install-receipt.json') -or -not $seen.Add($item.path)){throw 'Duplicate or reserved release path'}
  if(($item.bytes -isnot [int] -and $item.bytes -isnot [long]) -or $item.bytes -lt 0 -or $item.sha256 -isnot [string] -or $item.sha256 -cnotmatch '^[0-9a-f]{64}$'){throw 'Invalid release file metadata'}
  Assert-PlainPath $file
  if(-not (Test-Path -LiteralPath $file -PathType Leaf)){throw ('Release missing file: '+$item.path)}
  $entry=Get-Item -LiteralPath $file -Force
  if($entry.PSIsContainer -or $entry.Length -ne $item.bytes -or (Get-ReleaseHash $file) -ne $item.sha256){throw ('Release integrity error: '+$item.path)}
}
foreach($required in @('Morrow.cmd','runtime.json','runtime/node.exe','runtime/python/python.exe','runtime/electron/electron.exe','apps/desktop/native/main.cjs','tools/personal_space.mjs','tools/install_morrow.ps1','tools/uninstall_morrow.ps1','tools/release_paths.ps1')){
  if(-not $seen.Contains($required)){throw ('Incomplete release: '+$required)}
}
[IO.Directory]::CreateDirectory($Destination)|Out-Null
foreach($item in $manifest.files){
  $file=Resolve-ReleasePath $source $item.path
  $target=Resolve-ReleasePath $Destination $item.path
  Assert-PlainPath $file;Assert-PlainPath $target
  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))|Out-Null
  # Copy bytes through .NET instead of the Windows PowerShell file provider.
  # File.Copy also refuses an unexpectedly existing destination.
  [IO.File]::Copy($file,$target,$false)
  if((Get-ReleaseHash $target) -ne $item.sha256){throw ('Installed file failed verification: '+$item.path)}
}
[IO.File]::Copy($manifestPath,(Join-Path $Destination 'release-manifest.json'),$false)
if (-not $NoShortcut) {
  $shell=New-Object -ComObject WScript.Shell
  $shortcut=$shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Programs')) 'Morrow.lnk'))
  $shortcut.TargetPath=Join-Path $Destination 'runtime/electron/electron.exe'
  $shortcut.Arguments='"'+(Join-Path $Destination 'apps/desktop/native/main.cjs')+'"'
  $shortcut.WorkingDirectory=$Destination;$shortcut.Description='Morrow - Personal AI';$shortcut.Save()
}
if($NoShortcut){[Console]::WriteLine('Installed without a shortcut. No startup task was created.')}
else{[Console]::WriteLine('Installed. Open Morrow from the Start menu. No startup task was created.')}

$manifestHash=Get-ReleaseHash (Join-Path $Destination 'release-manifest.json')
$destinationBytes=[Text.Encoding]::UTF8.GetBytes($Destination.ToLowerInvariant())
$algorithm=[Security.Cryptography.SHA256]::Create()
try{$installId=[BitConverter]::ToString($algorithm.ComputeHash($destinationBytes)).Replace('-','').Substring(0,24).ToLowerInvariant()}finally{$algorithm.Dispose()}
$registryPath='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Morrow-'+$installId
$version=[string]$manifest.release.version
if($version -notmatch '^[0-9a-zA-Z.+-]{1,64}$'){$version='0.0.0'}
$receipt=@{format='morrow-install/1';root=$Destination;manifest_sha256=$manifestHash;registry_id=$installId;registered=(-not $NoRegistration);shortcut=(-not $NoShortcut);version=$version}
[IO.File]::WriteAllText((Join-Path $Destination 'install-receipt.json'),($receipt|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
if(-not $NoRegistration){
  $null=New-Item -Path $registryPath -Force
  $ps=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
  $uninstall='"'+$ps+'" -NoProfile -ExecutionPolicy Bypass -STA -File "'+(Join-Path $Destination 'tools/uninstall_morrow.ps1')+'"'
  $properties=@{DisplayName=('Morrow '+$version);DisplayVersion=$version;Publisher='Morrow';InstallLocation=$Destination;UninstallString=$uninstall;NoModify=1;NoRepair=1}
  foreach($name in $properties.Keys){$null=New-ItemProperty -LiteralPath $registryPath -Name $name -Value $properties[$name] -PropertyType $(if($properties[$name] -is [int]){'DWord'}else{'String'}) -Force}
}
