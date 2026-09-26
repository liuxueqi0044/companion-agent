function Get-ReleaseHash([string]$Path) {
  $stream=[IO.File]::OpenRead($Path);$algorithm=[Security.Cryptography.SHA256]::Create()
  try{return [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}
  finally{$stream.Dispose();$algorithm.Dispose()}
}
function Assert-PlainPath([string]$Path) {
  $cursor=[IO.Path]::GetFullPath($Path)
  while($cursor){
    if(Test-Path -LiteralPath $cursor){
      $entry=Get-Item -LiteralPath $cursor -Force
      if(($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Reparse points are not supported for installation.'}
    }
    $parent=[IO.Path]::GetDirectoryName($cursor)
    if($parent -eq $cursor){break};$cursor=$parent
  }
}
function Resolve-ReleasePath([string]$Root,[object]$Relative) {
  if($Relative -isnot [string] -or -not $Relative -or $Relative.Contains('\')){throw 'Invalid release path'}
  foreach($part in $Relative.Split('/')){
    if(-not $part -or $part -in @('.','..') -or $part -match '[<>:"|?*\x00-\x1f]' -or $part -match '[. ]$' -or $part -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])([.]|$)'){throw 'Invalid release path'}
  }
  $result=[IO.Path]::GetFullPath((Join-Path $Root $Relative))
  if(-not $result.StartsWith($Root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid release path'}
  return $result
}
