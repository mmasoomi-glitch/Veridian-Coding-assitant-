$ErrorActionPreference = "SilentlyContinue"

# Paths
$projectRoot = "C:\Users\HI\veridian"
$logPath = Join-Path $projectRoot "keystroke-log.txt"
$pausePath = Join-Path $projectRoot "keylog.paused"

Write-Host "KEYLOG RECORDING (local only)"
Write-Host "  log: $logPath"

# Skip the notification code entirely and go straight to the main loop
$buffer = New-Object System.Text.StringBuilder
$lastFlush = [DateTime]::Now

# Minimal test: just write to log once
try {
  [void]$buffer.Append("TEST KEY")
  [System.IO.File]::AppendAllText($logPath, $buffer.ToString(), [System.Text.Encoding]::UTF8)
  Write-Host "SUCCESS: Wrote to log file"
} catch {
  Write-Host "FAILED: $_"
}
