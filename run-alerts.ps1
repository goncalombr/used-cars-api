$ErrorActionPreference = "Continue"
$Log = "C:\Users\Gonçalo\used-cars\api\run-alerts.log"
$WorkDir = "C:\Users\Gonçalo\used-cars\api"

"[{0}] Starting alerts run (WorkDir={1})" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $WorkDir | Out-File -FilePath $Log -Encoding UTF8 -Append

# Prepare process to run npm in the correct folder
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "cmd.exe"
$psi.Arguments = '/c npm run alerts:once'
$psi.WorkingDirectory = $WorkDir
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError  = $true
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true

$p = New-Object System.Diagnostics.Process
$p.StartInfo = $psi
[void]$p.Start()
$p.WaitForExit()

$p.StandardOutput.ReadToEnd() | Out-File -FilePath $Log -Encoding UTF8 -Append
$p.StandardError.ReadToEnd()  | Out-File -FilePath $Log -Encoding UTF8 -Append
"[{0}] ExitCode={1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $p.ExitCode | Out-File -FilePath $Log -Encoding UTF8 -Append

exit $p.ExitCode
