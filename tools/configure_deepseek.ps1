param([string]$CredentialPath=$env:PERSONAL_AI_CREDENTIAL_FILE)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form=[System.Windows.Forms.Form]::new();$form.Text='Morrow · 连接 DeepSeek';$form.ClientSize=[Drawing.Size]::new(460,200);$form.StartPosition='CenterScreen';$form.FormBorderStyle='FixedDialog';$form.MaximizeBox=$false
$label=[Windows.Forms.Label]::new();$label.Text='输入 DeepSeek API Key。仅加密保存在当前 Windows 用户下。';$label.SetBounds(20,20,420,38);$form.Controls.Add($label)
$box=[Windows.Forms.TextBox]::new();$box.UseSystemPasswordChar=$true;$box.SetBounds(20,65,420,28);$form.Controls.Add($box)
$button=[Windows.Forms.Button]::new();$button.Text='保存';$button.SetBounds(340,115,100,32);$form.Controls.Add($button)
$button.add_Click({
  if($box.Text.Trim().Length -lt 16){[Windows.Forms.MessageBox]::Show('请输入完整的 API Key。')|Out-Null;return}
  $file=$CredentialPath
  if(-not $file){$file=Join-Path $env:LOCALAPPDATA 'CompanionAgent/credentials/deepseek.dpapi'}
  $file=[IO.Path]::GetFullPath($file);$dir=[IO.Path]::GetDirectoryName($file)
  . (Join-Path $PSScriptRoot 'release_paths.ps1')
  Assert-PlainPath $file
  [IO.Directory]::CreateDirectory($dir)|Out-Null
  $secure=ConvertTo-SecureString -String $box.Text.Trim() -AsPlainText -Force
  $cipher=ConvertFrom-SecureString -SecureString $secure
  $temp=$file+'.'+[Guid]::NewGuid().ToString()+'.tmp'
  [IO.File]::WriteAllText($temp,$cipher,[Text.UTF8Encoding]::new($false));Move-Item -LiteralPath $temp -Destination $file -Force
  $box.Clear();$secure.Dispose();$cipher=$null
  [Windows.Forms.MessageBox]::Show('已保存。请从托盘退出 Morrow，再重新打开。','Morrow')|Out-Null;$form.Close()
})
try{$null=$form.ShowDialog()}finally{$box.Clear();$form.Dispose()}
