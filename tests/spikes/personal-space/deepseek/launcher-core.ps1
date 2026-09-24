# Functions only; the production wrapper supplies fixed paths. Tests inject only synthetic paths.
. (Join-Path $PSScriptRoot 'credential-reader.ps1')

function Invoke-CompanionWorker(
  [string]$NodePath, [string]$WorkerPath, [int]$Phase, [string]$Mode,
  [string]$AttemptToken, [string]$ApiKey = '', [string]$PresendCategory = '') {
  $start = [Diagnostics.ProcessStartInfo]::new($NodePath)
  $start.ArgumentList.Add($WorkerPath)
  $start.ArgumentList.Add($Mode)
  $start.ArgumentList.Add([string]$Phase)
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $start.Environment.Clear()
  $start.Environment['SystemRoot'] = $env:SystemRoot
  $start.Environment['TEMP'] = $env:TEMP
  $start.Environment['TMP'] = $env:TMP
  $start.Environment['PERSONAL_SPACE_ATTEMPT_TOKEN'] = $AttemptToken
  if ($Mode -eq '--execute') { $start.Environment['PERSONAL_SPACE_DEEPSEEK_KEY'] = $ApiKey }
  if ($Mode -eq '--mark-presend-failed') {
    $start.Environment['PERSONAL_SPACE_PRESEND_ERROR_CATEGORY'] = $PresendCategory
  }
  $process = [Diagnostics.Process]::Start($start)
  if (-not $process.WaitForExit(100000)) {
    $process.Kill($true)
    throw [Exception]::new('worker_timeout_unknown_request_state')
  }
  $output = $process.StandardOutput.ReadToEnd().Trim()
  [void]$process.StandardError.ReadToEnd()
  try { $parsed = $output | ConvertFrom-Json -ErrorAction Stop }
  catch { throw [Exception]::new('worker_output_invalid') }
  if ($process.ExitCode -ne 0 -or $parsed.ok -ne $true) {
    $code = if ($parsed.code -and [string]$parsed.code -match '^[a-z_]{1,64}$') {
      [string]$parsed.code
    } else { 'worker_failed' }
    throw [Exception]::new($code)
  }
  return $parsed
}

function Invoke-CompanionLiveAttempt(
  [int]$Phase, [string]$EvidenceDir, [string]$CredentialPath,
  [string]$NodePath, [string]$WorkerPath) {
  if ($Phase -notin @(1,2)) { return @{ ok=$false; code='invalid_phase'; stage='preflight' } }
  $lockPath = [IO.Path]::Combine($EvidenceDir, 'live.lock')
  $token = [Guid]::NewGuid().ToString('N')
  $stage = 'lock'
  $reserved = $false
  $lock = $null
  $secure = $null
  $ptr = [IntPtr]::Zero
  $plain = $null
  try {
    try {
      $lock = [IO.File]::Open($lockPath, [IO.FileMode]::CreateNew,
        [IO.FileAccess]::ReadWrite, [IO.FileShare]::Read)
    } catch [IO.IOException] { throw [Exception]::new('lock_exists') }
    $bytes = [Text.Encoding]::UTF8.GetBytes($token)
    $lock.Write($bytes, 0, $bytes.Length)
    $lock.Flush($true)
    $stage = 'reserve'
    [void](Invoke-CompanionWorker $NodePath $WorkerPath $Phase '--reserve' $token)
    $reserved = $true
    $stage = 'credential'
    $secure = Read-CompanionSecureCredential $CredentialPath
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
      $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
      if ([string]::IsNullOrWhiteSpace($plain)) { throw [Exception]::new('credential_empty') }
      $stage = 'execute'
      $result = Invoke-CompanionWorker $NodePath $WorkerPath $Phase '--execute' $token $plain
    } finally {
      $plain = $null
      if ($ptr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
        $ptr = [IntPtr]::Zero
      }
    }
    if ($result.state -eq 'candidate_valid') {
      $lock.Dispose(); $lock = $null
      Remove-Item -LiteralPath $lockPath
    }
    return @{ ok=($result.state -eq 'candidate_valid'); phase=$Phase;
      state=$result.state; attempt_reserved=$reserved }
  } catch {
    $code = [string]$_.Exception.Message
    if ($code -notmatch '^[a-z_]{1,64}$') { $code = $stage + '_failed' }
    if ($reserved -and $stage -eq 'credential') {
      try {
        [void](Invoke-CompanionWorker $NodePath $WorkerPath $Phase '--mark-presend-failed' `
          $token '' $code)
      } catch { $code = 'presend_mark_failed' }
    }
    return @{ ok=$false; phase=$Phase; code=$code; stage=$stage; attempt_reserved=$reserved }
  } finally {
    $plain = $null
    $secure = $null
    if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    if ($null -ne $lock) { $lock.Dispose() }
  }
}
