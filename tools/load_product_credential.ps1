param([Parameter(Mandatory=$true)][string]$CredentialPath)
$ErrorActionPreference = 'Stop'
$plainPointer = [IntPtr]::Zero
try {
  $cipher = [IO.File]::ReadAllText($CredentialPath, [Text.Encoding]::UTF8)
  $secure = ConvertTo-SecureString -String $cipher.Trim() -ErrorAction Stop
  if ($null -eq $secure -or $secure.Length -eq 0) { throw 'empty' }
  $plainPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  # Only the private Node child pipe receives this value. Never run this script interactively.
  [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($plainPointer))
} catch { [Console]::Error.Write('credential_decode_failed'); exit 1 }
finally {
  if ($plainPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($plainPointer) }
  $secure = $null; $cipher = $null
}
