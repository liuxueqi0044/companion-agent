# Functions only. Importing this file never reads a credential or starts a worker.
function Read-CompanionSecureCredential([string]$LiteralPath) {
  $cipherText = $null
  try { $cipherText = [IO.File]::ReadAllText($LiteralPath, [Text.Encoding]::UTF8) }
  catch { throw [Exception]::new('credential_read_failed') }
  if ([string]::IsNullOrWhiteSpace($cipherText)) { throw [Exception]::new('credential_empty') }
  try {
    $secure = ConvertTo-SecureString -String $cipherText.Trim() -ErrorAction Stop
    if ($null -eq $secure -or $secure.Length -eq 0) { throw [Exception]::new('credential_empty') }
    return $secure
  } catch {
    if ($_.Exception.Message -eq 'credential_empty') { throw [Exception]::new('credential_empty') }
    throw [Exception]::new('credential_decode_failed')
  } finally { $cipherText = $null }
}
