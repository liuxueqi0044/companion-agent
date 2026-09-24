param([Parameter(Mandatory=$true)][ValidateSet(1,2)][int]$Phase)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'launcher-core.ps1')

# Production entry has fixed paths. Only launcher-core tests inject synthetic paths.
$result = Invoke-CompanionLiveAttempt $Phase `
  'C:\Users\xiayu\Documents\Codex\companion-agent\reports\evidence\BATCH-011' `
  'C:\Users\xiayu\AppData\Local\CompanionAgent\credentials\deepseek.dpapi' `
  'C:\Users\xiayu\Documents\Codex\companion-agent\.local-tools\node-v24.21.0-win-x64\node.exe' `
  'C:\Users\xiayu\Documents\Codex\companion-agent\tests\spikes\personal-space\deepseek\worker.mjs'
$result | ConvertTo-Json -Depth 8 -Compress
if (-not $result.ok) { exit 1 }
