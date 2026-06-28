$ErrorActionPreference = "SilentlyContinue"

Write-Host "BEFORE notification"

# The problematic code from keylog.ps1
$global:notifyIcon = $null
try {
  Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
  Add-Type -AssemblyName System.Drawing -ErrorAction SilentlyContinue
  $global:notifyIcon = New-Object System.Windows.Forms.NotifyIcon
  $global:notifyIcon.Icon = [System.Drawing.SystemIcons]::Information
  $global:notifyIcon.Visible = $true
  $global:notifyIcon.BalloonTipTitle = "Veridian"
  $global:notifyIcon.BalloonTipText  = "Veridian: keystroke recording is ON (local only)"
  $global:notifyIcon.BalloonTipIcon  = [System.Windows.Forms.ToolTipIcon]::Info
  $global:notifyIcon.ShowBalloonTip(5000)
  Write-Host "Balloon tip shown"
} catch {
  Write-Host "Balloon failed"
}

Write-Host "AFTER notification"
Start-Sleep -Milliseconds 100
Write-Host "DONE"
