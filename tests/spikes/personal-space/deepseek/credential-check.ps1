param([switch]$CheckConfigured)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'credential-reader.ps1')

$configuredPath = 'C:\Users\xiayu\AppData\Local\CompanionAgent\credentials\deepseek.dpapi'
$syntheticPath = $null
try {
  if ($CheckConfigured) {
    # Exactly one read, only in this explicit mode. No ledger, lock, worker or network access.
    $secure = Read-CompanionSecureCredential $configuredPath
  } else {
    $temporaryRoot = 'C:\Users\xiayu\Documents\Codex\companion-agent\reports\evidence\BATCH-011-R1\tmp'
    [IO.Directory]::CreateDirectory($temporaryRoot) | Out-Null
    $syntheticPath = [IO.Path]::Combine($temporaryRoot, 'credential-check-' + [Guid]::NewGuid().ToString('N') + '.dpapi')
    $synthetic = ConvertTo-SecureString 'SYNTHETIC_CHECK_NOT_A_KEY' -AsPlainText -Force
    $serialized = ConvertFrom-SecureString $synthetic
    [IO.File]::WriteAllText($syntheticPath, $serialized, [Text.Encoding]::UTF8)
    $secure = Read-CompanionSecureCredential $syntheticPath
  }
  $nonempty = $null -ne $secure -and $secure.Length -gt 0
  @{ decoded_nonempty = $nonempty; error_category = $null } | ConvertTo-Json -Compress
  if (-not $nonempty) { exit 1 }
} catch {
  $code = [string]$_.Exception.Message
  if ($code -notin @('credential_read_failed','credential_empty','credential_decode_failed')) {
    $code = 'credential_check_failed'
  }
  @{ decoded_nonempty = $false; error_category = $code } | ConvertTo-Json -Compress
  exit 1
} finally {
  $secure = $null
  $synthetic = $null
  $serialized = $null
  if ($null -ne $syntheticPath -and [IO.File]::Exists($syntheticPath)) {
    [IO.File]::Delete($syntheticPath)
  }
}
