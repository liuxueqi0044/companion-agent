param([string]$HomePath = '', [switch]$Offline, [switch]$Headless, [int]$ExitAfterSeconds = 0)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $HomePath) { $HomePath = Join-Path $env:LOCALAPPDATA 'Morrow/data' }
$HomePath = [IO.Path]::GetFullPath($HomePath)
[IO.Directory]::CreateDirectory($HomePath) | Out-Null
$env:PERSONAL_AI_HOME = $HomePath
$runtimeFile = Join-Path $workspace 'runtime.json'
if (Test-Path -LiteralPath $runtimeFile) {
  $config = Get-Content -LiteralPath $runtimeFile -Raw | ConvertFrom-Json
  $node = [IO.Path]::GetFullPath((Join-Path $workspace $config.node))
} else { $node = [IO.Path]::GetFullPath((Join-Path $workspace '../companion-agent/.local-tools/node-v24.21.0-win-x64/node.exe')) }
$stateFile = Join-Path $HomePath 'personal-space-server.json'
$credential = Join-Path $env:LOCALAPPDATA 'CompanionAgent/credentials/deepseek.dpapi'
$deepSeek = -not $Offline -and (Test-Path -LiteralPath $credential)
$script:serverState = $null
function Native-Call([string]$Action, [hashtable]$Arguments = @{}) {
  if (-not $script:serverState -or $script:serverState.url -notmatch '^http://127\.0\.0\.1:\d+$') { throw 'Invalid local service address' }
  Invoke-RestMethod -Uri ($script:serverState.url + '/api/native') -Method Post -ContentType 'application/json' -Headers @{'X-Morrow-Native'=$script:serverState.nativeToken} -Body (@{action=$Action;args=$Arguments}|ConvertTo-Json -Compress) -TimeoutSec 3
}
if (Test-Path -LiteralPath $stateFile) {
  $script:serverState = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
  try { $probe = Native-Call 'status'; if (-not $probe.ok) { $script:serverState=$null } } catch { $script:serverState=$null }
}
if (-not $script:serverState) {
  $argList = '"' + (Join-Path $workspace 'tools/personal_space.mjs') + '"'
  if ($deepSeek) { $argList += ' --deepseek' }
  $child = Start-Process -FilePath $node -ArgumentList $argList -WorkingDirectory $workspace -WindowStyle Hidden -RedirectStandardOutput (Join-Path $HomePath 'server.stdout.txt') -RedirectStandardError (Join-Path $HomePath 'server.stderr.txt') -PassThru
  for ($i=0; $i -lt 80; $i++) {
    if ($child.HasExited) { throw 'Morrow could not start. See server.stderr.txt in the data folder.' }
    if (Test-Path -LiteralPath $stateFile) {
      $candidate = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
      if ($candidate.pid -eq $child.Id) { $script:serverState=$candidate; break }
    }
    Start-Sleep -Milliseconds 250
  }
  if (-not $script:serverState) { throw 'Startup is pending. Do not start a second service.' }
}
if ($Headless) { [Console]::WriteLine($script:serverState.url); exit 0 }
$nameBytes=[Text.Encoding]::UTF8.GetBytes($HomePath.ToLowerInvariant())
$mutexName='Local\Morrow-'+[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($nameBytes)).Substring(0,24)
$mutex=[Threading.Mutex]::new($false,$mutexName)
try { $owned=$mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $owned=$true }
if(-not $owned){Start-Process $script:serverState.url;$mutex.Dispose();exit 0}
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$script:context = [System.Windows.Forms.ApplicationContext]::new()
$script:icon = [System.Windows.Forms.NotifyIcon]::new()
$script:icon.Icon = [System.Drawing.SystemIcons]::Application
$script:icon.Text = 'Morrow · 我的 AI'
$script:icon.Visible = $true
$menu = [System.Windows.Forms.ContextMenuStrip]::new()
function Open-Space([string]$Suffix = '') { Start-Process ($script:serverState.url + $Suffix) }
$open = $menu.Items.Add('打开我的 AI'); $open.add_Click({ Open-Space })
$recover = $menu.Items.Add('恢复或更换界面'); $recover.add_Click({ Open-Space '/recover' })
$script:pauseItem = $menu.Items.Add('暂停后台消息'); $script:pauseItem.CheckOnClick=$false
$script:pauseItem.add_Click({
  try { $s=Native-Call 'status'; $r=Native-Call 'background.configure' @{paused=(-not $s.result.background.paused)}
    if ($r.ok) { $script:pauseItem.Checked=$r.result.paused } } catch { $script:icon.Text='Morrow · 本地连接中断' }
})
$script:notifyItem = $menu.Items.Add('系统消息提示'); $script:notifyItem.Checked=$true
$script:notifyItem.add_Click({
  try { $s=Native-Call 'status'; $r=Native-Call 'background.configure' @{notifications=(-not $s.result.background.notifications)}
    if ($r.ok) { $script:notifyItem.Checked=$r.result.notifications } } catch { $script:icon.Text='Morrow · 本地连接中断' }
})
try {
  $initialStatus=Native-Call 'status'
  if($initialStatus.ok){
    $script:pauseItem.Checked=$initialStatus.result.background.paused
    $script:notifyItem.Checked=$initialStatus.result.background.notifications
  }
} catch { $script:icon.Text='Morrow · 本地连接中断' }
$setup = $menu.Items.Add('配置 DeepSeek'); $setup.add_Click({
  Start-Process -FilePath 'pwsh' -ArgumentList ('-NoProfile -STA -File "' + (Join-Path $PSScriptRoot 'configure_deepseek.ps1') + '"') -WindowStyle Hidden
})
$folder = $menu.Items.Add('打开本地数据目录'); $folder.add_Click({ Start-Process -FilePath 'explorer.exe' -ArgumentList ('"'+$HomePath+'"') })
$null = $menu.Items.Add([System.Windows.Forms.ToolStripSeparator]::new())
$quit = $menu.Items.Add('退出 Morrow'); $quit.add_Click({
  try { $null=Native-Call 'quit' } catch { }
  $script:icon.Visible=$false; $script:context.ExitThread()
})
$script:icon.ContextMenuStrip=$menu
$script:icon.add_DoubleClick({ Open-Space })
$script:icon.add_BalloonTipClicked({ Open-Space })
$script:sequence=0
$noticeFile=Join-Path $HomePath 'notification.json'
if (Test-Path -LiteralPath $noticeFile) { try { $script:sequence=(Get-Content -LiteralPath $noticeFile -Raw|ConvertFrom-Json).sequence } catch { } }
$timer=[System.Windows.Forms.Timer]::new();$timer.Interval=3000
$timer.add_Tick({
  try {
    if (Test-Path -LiteralPath $noticeFile) {
      $notice=Get-Content -LiteralPath $noticeFile -Raw|ConvertFrom-Json
      if ($notice.sequence -gt $script:sequence) {
        $script:sequence=$notice.sequence
        if ($notice.count -gt 0) { $script:icon.ShowBalloonTip(6000,'Morrow','你的 AI 有新消息。点击查看。',[System.Windows.Forms.ToolTipIcon]::Info) }
      }
    }
  } catch { }
})
$timer.Start()
$stopTimer=$null
if ($ExitAfterSeconds -gt 0) {
  $stopTimer=[System.Windows.Forms.Timer]::new();$stopTimer.Interval=$ExitAfterSeconds*1000
  $stopTimer.add_Tick({ $script:context.ExitThread() });$stopTimer.Start()
}
try { Open-Space; [System.Windows.Forms.Application]::Run($script:context) }
finally { $timer.Stop();$timer.Dispose();if($stopTimer){$stopTimer.Dispose()};$script:icon.Visible=$false;$script:icon.Dispose();$menu.Dispose();$script:context.Dispose();$mutex.ReleaseMutex();$mutex.Dispose() }
