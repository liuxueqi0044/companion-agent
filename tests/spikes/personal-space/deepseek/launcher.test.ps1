$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'launcher-core.ps1')

$repo = [IO.Path]::GetFullPath([IO.Path]::Combine($PSScriptRoot, '..', '..', '..', '..'))
$node = [IO.Path]::Combine($repo, '.local-tools', 'node-v24.21.0-win-x64', 'node.exe')
$policy = [Uri]::new([IO.Path]::Combine($PSScriptRoot, 'policy.mjs')).AbsoluteUri
$tmpRoot = [IO.Path]::Combine($repo, 'reports', 'evidence', 'BATCH-011-R1', 'tmp')
[IO.Directory]::CreateDirectory($tmpRoot) | Out-Null
$runRoot = [IO.Path]::Combine($tmpRoot, 'launcher-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($runRoot) | Out-Null

function Assert([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw [Exception]::new('assertion_failed_' + $Message) }
}

$fakeWorker = @'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { authorizeAttempt } from '__POLICY_URI__'
const dir = path.dirname(fileURLToPath(import.meta.url))
const [mode, phaseText] = process.argv.slice(2)
const phase = Number(phaseText)
const ledgerPath = path.join(dir, 'ledger.json')
const eventsPath = path.join(dir, 'events.jsonl')
const lockPath = path.join(dir, 'live.lock')
const ledger = await fs.readFile(ledgerPath, 'utf8').then(JSON.parse, () => ({ attempts:[] }))
const token = process.env.PERSONAL_SPACE_ATTEMPT_TOKEN
const allowed = new Set(['SystemRoot','TEMP','TMP','PERSONAL_SPACE_ATTEMPT_TOKEN',
  'PERSONAL_SPACE_DEEPSEEK_KEY','PERSONAL_SPACE_PRESEND_ERROR_CATEGORY'])
const envMinimal = Object.keys(process.env).every(key => allowed.has(key))
const event = { mode, phase, env_minimal:envMinimal,
  key_present:!!process.env.PERSONAL_SPACE_DEEPSEEK_KEY }
const output = async value => {
  await fs.appendFile(eventsPath, JSON.stringify(event) + '\n')
  process.stdout.write(JSON.stringify(value) + '\n')
}
try {
  if (!envMinimal || !token || await fs.readFile(lockPath, 'utf8') !== token) throw Error('lock_mismatch')
  if (mode === '--reserve') {
    if (process.env.PERSONAL_SPACE_DEEPSEEK_KEY) throw Error('key_on_reserve')
    authorizeAttempt(ledger.attempts, phase, 0.01)
    await new Promise(resolve => setTimeout(resolve, 180))
    ledger.attempts.push({ attempt:phase, state:'reserved', sent_at_utc:null,
      estimated_max_usd:0.01 })
    await fs.writeFile(ledgerPath, JSON.stringify(ledger))
    await output({ ok:true, state:'reserved' })
  } else if (mode === '--mark-presend-failed') {
    if (process.env.PERSONAL_SPACE_DEEPSEEK_KEY) throw Error('key_on_mark')
    const entry = ledger.attempts.at(-1)
    if (!entry || entry.attempt !== phase || entry.state !== 'reserved') throw Error('presend_state_required')
    entry.state = 'failed_pre_send'
    entry.error_category = process.env.PERSONAL_SPACE_PRESEND_ERROR_CATEGORY
    await fs.writeFile(ledgerPath, JSON.stringify(ledger))
    await output({ ok:true, state:entry.state })
  } else if (mode === '--execute') {
    const entry = ledger.attempts.at(-1)
    if (!entry || entry.attempt !== phase || entry.state !== 'reserved') throw Error('reservation_required')
    const expected = (await fs.readFile(path.join(dir, 'expected.sha256'), 'utf8')).trim()
    const actual = createHash('sha256').update(process.env.PERSONAL_SPACE_DEEPSEEK_KEY ?? '').digest('hex')
    if (actual !== expected) throw Error('key_mismatch')
    entry.state = 'candidate_valid'
    await fs.writeFile(ledgerPath, JSON.stringify(ledger))
    await output({ ok:true, state:entry.state, key_matches:true })
  } else throw Error('invalid_mode')
} catch (error) {
  await output({ ok:false, code:/^[a-z_]+$/.test(error.message) ? error.message : 'fake_failure' })
  process.exitCode = 1
}
'@.Replace('__POLICY_URI__', $policy)

function New-Case([string]$Name, [string]$CipherMode) {
  $dir = [IO.Path]::Combine($runRoot, $Name)
  [IO.Directory]::CreateDirectory($dir) | Out-Null
  $worker = [IO.Path]::Combine($dir, 'fake-worker.mjs')
  [IO.File]::WriteAllText($worker, $fakeWorker, [Text.Encoding]::UTF8)
  $credential = [IO.Path]::Combine($dir, 'synthetic.dpapi')
  $syntheticKey = 'SYNTHETIC_' + [Guid]::NewGuid().ToString('N')
  $hash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData(
    [Text.Encoding]::UTF8.GetBytes($syntheticKey))).ToLowerInvariant()
  [IO.File]::WriteAllText([IO.Path]::Combine($dir, 'expected.sha256'), $hash)
  $cipher = ConvertFrom-SecureString (ConvertTo-SecureString $syntheticKey -AsPlainText -Force)
  switch ($CipherMode) {
    'valid' { [IO.File]::WriteAllText($credential, $cipher, [Text.Encoding]::UTF8) }
    'empty' { [IO.File]::WriteAllText($credential, '', [Text.Encoding]::UTF8) }
    'bad_format' { [IO.File]::WriteAllText($credential, 'not-a-dpapi-serialization', [Text.Encoding]::UTF8) }
    'tampered' {
      $replacement = if ($cipher[-1] -eq '0') { '1' } else { '0' }
      [IO.File]::WriteAllText($credential, $cipher.Substring(0, $cipher.Length - 1) + $replacement,
        [Text.Encoding]::UTF8)
    }
    'missing' { }
    default { throw [Exception]::new('invalid_test_mode') }
  }
  $case = @{ dir=$dir; worker=$worker; credential=$credential; synthetic_key=$syntheticKey }
  $syntheticKey = $null
  return $case
}

function Read-Ledger([string]$Dir) {
  return [IO.File]::ReadAllText([IO.Path]::Combine($Dir, 'ledger.json')) | ConvertFrom-Json
}
function Read-Events([string]$Dir) {
  $path = [IO.Path]::Combine($Dir, 'events.jsonl')
  if (-not [IO.File]::Exists($path)) { return @() }
  return @([IO.File]::ReadAllLines($path) | ForEach-Object { $_ | ConvertFrom-Json })
}

Assert ([IO.File]::Exists($node)) 'frozen_node_exists'
$launcherText = [IO.File]::ReadAllText([IO.Path]::Combine($PSScriptRoot, 'live-launcher.ps1'))
Assert ($launcherText.Contains('node-v24.21.0-win-x64\node.exe')) 'frozen_node_path'
Assert (-not $launcherText.Contains('ResumeReserved')) 'resume_removed'

$good = New-Case 'good' 'valid'
$first = Invoke-CompanionLiveAttempt 1 $good.dir $good.credential $node $good.worker
Assert ($first.ok -and $first.state -eq 'candidate_valid') 'synthetic_first'
Assert (-not [IO.File]::Exists([IO.Path]::Combine($good.dir, 'live.lock'))) 'success_unlock'
$second = Invoke-CompanionLiveAttempt 2 $good.dir $good.credential $node $good.worker
Assert ($second.ok -and $second.state -eq 'candidate_valid') 'synthetic_second'
$third = Invoke-CompanionLiveAttempt 2 $good.dir $good.credential $node $good.worker
Assert (-not $third.ok -and $third.code -eq 'attempts_exhausted') 'maximum_two'
Assert ((Read-Ledger $good.dir).attempts.Count -eq 2) 'two_records_only'
$goodEvents = Read-Events $good.dir
Assert (-not (($first | ConvertTo-Json -Compress).Contains($good.synthetic_key))) 'no_key_in_launcher_result'
Assert (-not ([IO.File]::ReadAllText([IO.Path]::Combine($good.dir, 'events.jsonl')).Contains($good.synthetic_key))) 'no_key_in_worker_events'
Assert (($goodEvents | Where-Object { -not $_.env_minimal }).Count -eq 0) 'minimal_environment'
Assert (($goodEvents | Where-Object { $_.mode -eq '--execute' -and $_.key_present }).Count -eq 2) 'key_only_execute'
Assert (($goodEvents | Where-Object { $_.mode -eq '--reserve' -and $_.key_present }).Count -eq 0) 'no_key_reserve'

foreach ($mode in @('bad_format','empty','tampered','missing')) {
  $case = New-Case $mode $mode
  $result = Invoke-CompanionLiveAttempt 1 $case.dir $case.credential $node $case.worker
  $expectedCode = switch ($mode) {
    'empty' { 'credential_empty' }
    'missing' { 'credential_read_failed' }
    default { 'credential_decode_failed' }
  }
  Assert (-not $result.ok -and $result.code -eq $expectedCode) ('presend_' + $mode)
  Assert ((Read-Ledger $case.dir).attempts[0].state -eq 'failed_pre_send') ('ledger_' + $mode)
  Assert ((Read-Ledger $case.dir).attempts[0].error_category -eq $expectedCode) ('category_' + $mode)
  Assert ([IO.File]::Exists([IO.Path]::Combine($case.dir, 'live.lock'))) ('retained_lock_' + $mode)
  $events = Read-Events $case.dir
  Assert (($events | Where-Object { $_.mode -eq '--execute' }).Count -eq 0) ('no_execute_' + $mode)
  Assert (($events | Where-Object { $_.mode -eq '--mark-presend-failed' }).Count -eq 1) ('marked_' + $mode)
  $before = $events.Count
  $blocked = Invoke-CompanionLiveAttempt 1 $case.dir 'C:\nonexistent\do-not-read' $node $case.worker
  Assert (-not $blocked.ok -and $blocked.code -eq 'lock_exists') ('lock_before_credential_' + $mode)
  Assert ((Read-Events $case.dir).Count -eq $before) ('lock_before_worker_' + $mode)
}

$racing = New-Case 'racing' 'valid'
$runner = [IO.Path]::Combine($racing.dir, 'runner.ps1')
$runnerText = @'
param([string]$Core, [string]$Evidence, [string]$Credential, [string]$Node, [string]$Worker)
$ErrorActionPreference = 'Stop'
. $Core
Invoke-CompanionLiveAttempt 1 $Evidence $Credential $Node $Worker | ConvertTo-Json -Compress
'@
[IO.File]::WriteAllText($runner, $runnerText, [Text.Encoding]::UTF8)
$shell = (Get-Process -Id $PID).Path
function Start-Competitor {
  $start = [Diagnostics.ProcessStartInfo]::new($shell)
  foreach ($arg in @('-NoProfile','-File',$runner,([IO.Path]::Combine($PSScriptRoot, 'launcher-core.ps1')),
      $racing.dir,$racing.credential,$node,$racing.worker)) { $start.ArgumentList.Add($arg) }
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  return [Diagnostics.Process]::Start($start)
}
$competitorA = Start-Competitor
$competitorB = Start-Competitor
Assert ($competitorA.WaitForExit(30000) -and $competitorB.WaitForExit(30000)) 'competitors_bounded'
$raceA = $competitorA.StandardOutput.ReadToEnd() | ConvertFrom-Json
$raceB = $competitorB.StandardOutput.ReadToEnd() | ConvertFrom-Json
Assert ($competitorA.ExitCode -eq 0 -and $competitorB.ExitCode -eq 0) 'competitors_exited'
Assert ((@(@($raceA,$raceB) | Where-Object { $_.ok }).Count) -eq 1) 'one_competitor_wins'
Assert ((@(@($raceA,$raceB) | Where-Object { $_.code -eq 'lock_exists' }).Count) -eq 1) 'one_competitor_rejected'
Assert ((Read-Ledger $racing.dir).attempts.Count -eq 1) 'one_competitor_reserved'

@{ ok=$true; cases=7; assertions='serialization, worker handoff, minimal environment, bad/empty/tampered/missing, lock, two attempts, two competing launchers'; network_requests=0; real_credential_reads=0 } |
  ConvertTo-Json -Compress
