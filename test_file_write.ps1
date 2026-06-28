$ErrorActionPreference = "SilentlyContinue"
$logPath = "C:\Users\HI\veridian\keystroke-log.txt"
$debugFile = "C:\Users\HI\veridian\test_write_debug.log"

"[1] Script started" | Add-Content $debugFile

# Try different write methods
try {
  "[2] Trying method 1: AppendAllText" | Add-Content $debugFile
  [System.IO.File]::AppendAllText($logPath, "TEST1`n", [System.Text.Encoding]::UTF8)
  "[2] SUCCESS" | Add-Content $debugFile
} catch {
  "[2] FAILED: $_" | Add-Content $debugFile
}

try {
  "[3] Trying method 2: WriteAllText" | Add-Content $debugFile
  if (-not (Test-Path $logPath)) {
    [System.IO.File]::WriteAllText($logPath, "TEST2`n", [System.Text.Encoding]::UTF8)
  }
  "[3] SUCCESS" | Add-Content $debugFile
} catch {
  "[3] FAILED: $_" | Add-Content $debugFile
}

try {
  "[4] Trying method 3: Out-File" | Add-Content $debugFile
  "TEST3" | Out-File -Path $logPath -Append -Encoding UTF8
  "[4] SUCCESS" | Add-Content $debugFile
} catch {
  "[4] FAILED: $_" | Add-Content $debugFile
}

"[5] Checking file existence" | Add-Content $debugFile
if (Test-Path $logPath) {
  "[5] File exists" | Add-Content $debugFile
} else {
  "[5] File does NOT exist" | Add-Content $debugFile
}
