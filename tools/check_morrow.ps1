$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$run=Join-Path $env:LOCALAPPDATA ('Morrow/checks/'+[Guid]::NewGuid().ToString())
. (Join-Path $PSScriptRoot 'release_paths.ps1')
Assert-PlainPath $run
[IO.Directory]::CreateDirectory($run)|Out-Null
$report=Join-Path $run 'report.json'
& (Join-Path $root 'runtime/node.exe') (Join-Path $PSScriptRoot 'verify_windows_release.mjs') --release $root --home (Join-Path $run 'test-data') --report $report *> (Join-Path $run 'check.log')
$result=$LASTEXITCODE
if($result -ne 0 -and -not (Test-Path -LiteralPath $report)){
  [IO.File]::WriteAllText($report,(@{passed=$false;error='offline_check_failed';log='check.log';modelRequests=0;realCredentialsRead=0}|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
}
[Console]::WriteLine($(if($result -eq 0){'Offline checks passed.'}else{'Offline checks failed. Keep the report and log.'}))
[Console]::WriteLine('Check report directory: '+$run)
exit $result
