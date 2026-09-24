param([switch]$DeepSeek)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$node = [IO.Path]::GetFullPath((Join-Path $workspace '../companion-agent/.local-tools/node-v24.21.0-win-x64/node.exe'))
$stateFile = Join-Path $workspace '.product-data/personal-space-server.json'
if (Test-Path -LiteralPath $stateFile) {
  $state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
  $existing = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$state.pid)"
  if ($existing -and $existing.ExecutablePath -eq $node -and $existing.CommandLine -match 'personal_space\.mjs') {
    if ($DeepSeek -and -not $state.live) { throw 'The existing instance is offline. Close it before changing model mode.' }
    $state.url
    exit 0
  }
}
$privateDir = Join-Path $workspace '.product-data'
[IO.Directory]::CreateDirectory($privateDir) | Out-Null
$arguments = @((Join-Path $workspace 'tools/personal_space.mjs'))
if ($DeepSeek) { $arguments += '--deepseek' }
$child = Start-Process -FilePath $node -ArgumentList $arguments -WorkingDirectory $workspace -WindowStyle Hidden -RedirectStandardOutput (Join-Path $privateDir 'server.stdout.txt') -RedirectStandardError (Join-Path $privateDir 'server.stderr.txt') -PassThru
for ($i=0; $i -lt 40; $i++) {
  if ($child.HasExited) { throw 'Startup stopped. See .product-data/server.stderr.txt; do not clear a lock while work may still be running.' }
  if (Test-Path -LiteralPath $stateFile) {
    $state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    if ($state.pid -eq $child.Id) { $state.url; exit 0 }
  }
  Start-Sleep -Milliseconds 250
}
throw 'Startup is still pending. Do not launch another instance.'
