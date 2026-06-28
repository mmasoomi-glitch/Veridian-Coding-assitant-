$ErrorActionPreference = "SilentlyContinue"
$projectRoot = "C:\Users\HI\veridian"
$logPath = Join-Path $projectRoot "keystroke-log.txt"
$pausePath = Join-Path $projectRoot "keylog.paused"
$debugFile = Join-Path $projectRoot "keylog_spawn_debug.log"

"[1] Script started" | Add-Content $debugFile

try {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public class VeridianKeys {
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
  [DllImport("user32.dll")] public static extern short GetKeyState(int nVirtKey);
}
"@
  "[2] Add-Type succeeded" | Add-Content $debugFile
} catch {
  "[2] Add-Type FAILED: $_" | Add-Content $debugFile
}

Write-Host "Starting notification..."
$global:notifyIcon = $null
try {
  "[3] Attempting Windows.Forms" | Add-Content $debugFile
  Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
  "[3b] Added System.Windows.Forms" | Add-Content $debugFile
  Add-Type -AssemblyName System.Drawing -ErrorAction SilentlyContinue
  "[3c] Added System.Drawing" | Add-Content $debugFile
  $global:notifyIcon = New-Object System.Windows.Forms.NotifyIcon
  "[3d] Created NotifyIcon" | Add-Content $debugFile
  $global:notifyIcon.Icon = [System.Drawing.SystemIcons]::Information
  "[3e] Set Icon" | Add-Content $debugFile
  $global:notifyIcon.Visible = $true
  "[3f] Set Visible" | Add-Content $debugFile
  $global:notifyIcon.BalloonTipTitle = "Veridian"
  $global:notifyIcon.BalloonTipText = "Recording is ON"
  "[3g] Set tooltip text" | Add-Content $debugFile
  $global:notifyIcon.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
  "[3h] Set tooltip icon" | Add-Content $debugFile
  $global:notifyIcon.ShowBalloonTip(5000)
  "[3i] ShowBalloonTip called" | Add-Content $debugFile
} catch {
  "[3] Windows.Forms FAILED: $_" | Add-Content $debugFile
}

"[4] Notification complete" | Add-Content $debugFile

$buffer = New-Object System.Text.StringBuilder
$lastFlush = [DateTime]::Now

"[5] About to enter main loop" | Add-Content $debugFile

try {
  "[6] In main try block" | Add-Content $debugFile
  while ($true) {
    "[7] In while loop" | Add-Content $debugFile
    
    if (Test-Path $pausePath) {
      Start-Sleep -Milliseconds 200
      continue
    }
    
    $VK_SHIFT = 0x10
    $shift = ([VeridianKeys]::GetAsyncKeyState($VK_SHIFT) -band 0x8000) -ne 0
    
    [void]$buffer.Append("x")
    $now = [DateTime]::Now
    if ($buffer.Length -gt 0 -and (($now - $lastFlush).TotalMilliseconds -ge 1000 -or $buffer.Length -ge 256)) {
      [System.IO.File]::AppendAllText($logPath, $buffer.ToString(), [System.Text.Encoding]::UTF8)
      [void]$buffer.Clear()
      $lastFlush = $now
    }
    
    Start-Sleep -Milliseconds 30
  }
} catch {
  "[6] Main loop FAILED: $_" | Add-Content $debugFile
}

"[END] Script completed" | Add-Content $debugFile
