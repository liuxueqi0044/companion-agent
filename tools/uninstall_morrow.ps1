param([switch]$ConfirmRemoval)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'release_paths.ps1')
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd([IO.Path]::DirectorySeparatorChar)
Assert-PlainPath $root
$receiptPath=Join-Path $root 'install-receipt.json'
$manifestPath=Join-Path $root 'release-manifest.json'
Assert-PlainPath $receiptPath; Assert-PlainPath $manifestPath
if(-not (Test-Path -LiteralPath $receiptPath -PathType Leaf)){throw 'Not an installed release. Portable copies may be removed manually after exit.'}
$receipt=Get-Content -LiteralPath $receiptPath -Raw -Encoding UTF8|ConvertFrom-Json
if($receipt.format -ne 'morrow-install/1' -or $receipt.root -cne $root -or $receipt.registry_id -cnotmatch '^[a-f0-9]{24}$' -or $receipt.registered -isnot [bool] -or $receipt.shortcut -isnot [bool] -or $receipt.manifest_sha256 -ne (Get-ReleaseHash $manifestPath)){throw 'Installation receipt mismatch. No files removed.'}
$algorithm=[Security.Cryptography.SHA256]::Create()
try{$id=[BitConverter]::ToString($algorithm.ComputeHash([Text.Encoding]::UTF8.GetBytes($root.ToLowerInvariant()))).Replace('-','').Substring(0,24).ToLowerInvariant()}finally{$algorithm.Dispose()}
if($id -cne $receipt.registry_id){throw 'Installation identity mismatch'}
$manifest=Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8|ConvertFrom-Json
if($manifest.format -ne 'morrow-release/1' -or $manifest.files -isnot [array] -or $manifest.files.Count -eq 0 -or $manifest.files.Count -gt 20000){throw 'Invalid release manifest'}
$seen=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
$targets=New-Object 'System.Collections.Generic.List[string]'
$directories=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
# Validate every target and every ancestor before deleting the first file.
foreach($item in $manifest.files){
  $file=Resolve-ReleasePath $root $item.path
  if($item.path -in @('release-manifest.json','install-receipt.json') -or -not $seen.Add($item.path)){throw 'Duplicate or reserved path'}
  if(($item.bytes -isnot [int] -and $item.bytes -isnot [long]) -or $item.bytes -lt 0 -or $item.sha256 -cnotmatch '^[0-9a-f]{64}$'){throw 'Invalid file metadata'}
  Assert-PlainPath $file
  if(Test-Path -LiteralPath $file){
    $entry=Get-Item -LiteralPath $file -Force
    if($entry.PSIsContainer -or $entry.Length -ne $item.bytes -or (Get-ReleaseHash $file) -ne $item.sha256){throw ('Modified release file; preserved: '+$item.path)}
    $targets.Add($file)
  }
  $parent=[IO.Path]::GetDirectoryName($file)
  while($parent -and $parent.StartsWith($root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){$null=$directories.Add($parent);$parent=[IO.Path]::GetDirectoryName($parent)}
}
$running=@(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -and $_.ExecutablePath.StartsWith($root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)})
if($running.Count -gt 0){throw 'Exit this Morrow release from its tray before uninstalling. No processes were stopped.'}
if(-not $ConfirmRemoval){
  Add-Type -AssemblyName System.Windows.Forms
  $answer=[Windows.Forms.MessageBox]::Show('Remove this Morrow version? Your conversations, memory, tools and API key will be kept.','Uninstall Morrow',[Windows.Forms.MessageBoxButtons]::YesNo,[Windows.Forms.MessageBoxIcon]::Question)
  if($answer -ne [Windows.Forms.DialogResult]::Yes){return}
}
foreach($file in $targets){Assert-PlainPath $file;[IO.File]::Delete($file)}
if($receipt.shortcut){
  $shortcut=Join-Path ([Environment]::GetFolderPath('Programs')) 'Morrow.lnk'
  if(Test-Path -LiteralPath $shortcut){
    Assert-PlainPath $shortcut
    $shell=New-Object -ComObject WScript.Shell;$link=$shell.CreateShortcut($shortcut)
    # An older version must not remove the shortcut of a newer one.
    if($link.TargetPath -eq (Join-Path $root 'runtime/electron/electron.exe')){[IO.File]::Delete($shortcut)}
  }
}
if($receipt.registered){
  $registryPath='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Morrow-'+$id
  if(Test-Path -LiteralPath $registryPath){
    if((Get-ItemProperty -LiteralPath $registryPath).InstallLocation -eq $root){Remove-Item -LiteralPath $registryPath}
  }
}
[IO.File]::Delete($manifestPath);[IO.File]::Delete($receiptPath)
foreach($dir in @($directories | Sort-Object Length -Descending)){
  Assert-PlainPath $dir
  if([IO.Directory]::Exists($dir) -and [IO.Directory]::GetFileSystemEntries($dir).Length -eq 0){[IO.Directory]::Delete($dir,$false)}
}
if([IO.Directory]::GetFileSystemEntries($root).Length -eq 0){[IO.Directory]::Delete($root,$false)}
[Console]::WriteLine('Morrow release removed. Personal data and unknown files were preserved.')
