if ($args.Count -ne 0) {
  @{ ok=$false; code='invalid_arguments' } | ConvertTo-Json -Compress
  exit 1
}
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'launcher-core.ps1')

# Fixed BATCH-012 paths; no resume mode, alternate credential, worker, endpoint or phase.
$result = Invoke-CompanionLiveAttempt 1 `
  'C:\Users\xiayu\Documents\Codex\companion-agent\reports\evidence\BATCH-012' `
  'C:\Users\xiayu\AppData\Local\CompanionAgent\credentials\deepseek.dpapi' `
  'C:\Users\xiayu\Documents\Codex\companion-agent\.local-tools\node-v24.21.0-win-x64\node.exe' `
  'C:\Users\xiayu\Documents\Codex\companion-agent\tests\spikes\personal-space\deepseek\batch012-worker.mjs'
$result | ConvertTo-Json -Depth 8 -Compress
if (-not $result.ok) { exit 1 }
