# Veridian TRANSPARENT, local-only keystroke recorder.
#
# PURPOSE: the machine OWNER's keyboard randomly wipes typed text; this lets them
# recover their own typing. It is intentionally NOT stealthy:
#   - prints a visible "KEYLOG RECORDING" banner to the console it runs in
#   - fires a Windows balloon/toast notification on start ("recording is ON")
#   - writes ONLY to a LOCAL file in the project dir; nothing is ever uploaded
#   - honors a pause flag file so the owner can stop capture before passwords
#
# Capture method: GetAsyncKeyState polling (~30ms). A low-level WH_KEYBOARD_LL
# hook needs a pumped message loop, which is fragile inside powershell.exe; polling
# the async key state is far more robust here. We track the previous pressed state
# per VK so we only emit on the DOWN transition (no auto-repeat spam).
#
# LOCAL ONLY: the captured text is appended to keystroke-log.txt in the project
# directory. There is deliberately NO network / sync / upload code anywhere here.

$ErrorActionPreference = "SilentlyContinue"

# --- Resolve LOCAL paths (project root = parent of this telemetry/ folder) ---
$scriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$logPath     = Join-Path $projectRoot "keystroke-log.txt"
$pausePath   = Join-Path $projectRoot "keylog.paused"

$MaxBytes = 200KB   # keep only the last ~200KB of the log

try {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public class VeridianKeys {
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
  [DllImport("user32.dll")] public static extern short GetKeyState(int nVirtKey);
}
"@
} catch { }

# --- VK code -> base character maps (unshifted / shifted) ---
# Letters (A-Z = 0x41-0x5A) are handled separately for CapsLock interaction.
$unshifted = @{
  0x30=')'.Replace(')','0'); # placeholder, real digits set below
}
# Build digit + punctuation maps explicitly (US layout).
$digits        = @{ 0x30='0';0x31='1';0x32='2';0x33='3';0x34='4';0x35='5';0x36='6';0x37='7';0x38='8';0x39='9' }
$digitsShift   = @{ 0x30=')';0x31='!';0x32='@';0x33='#';0x34='$';0x35='%';0x36='^';0x37='&';0x38='*';0x39='(' }
# OEM punctuation keys (US layout).
$punct = @{
  0xBA=@(';',':');   # OEM_1
  0xBB=@('=','+');   # OEM_PLUS
  0xBC=@(',','<');   # OEM_COMMA
  0xBD=@('-','_');   # OEM_MINUS
  0xBE=@('.','>');   # OEM_PERIOD
  0xBF=@('/','?');   # OEM_2
  0xC0=@('`','~');   # OEM_3
  0xDB=@('[','{');   # OEM_4
  0xDC=@('\','|');   # OEM_5
  0xDD=@(']','}');   # OEM_6
  0xDE=@("'",'"');   # OEM_7
}
# Numpad digits 0-9 (VK_NUMPAD0..9).
$numpad = @{ 0x60='0';0x61='1';0x62='2';0x63='3';0x64='4';0x65='5';0x66='6';0x67='7';0x68='8';0x69='9' }

# VK constants
$VK_SHIFT=0x10; $VK_CAPITAL=0x14; $VK_SPACE=0x20; $VK_RETURN=0x0D; $VK_TAB=0x09; $VK_BACK=0x08

# --- Visible start notification (balloon via NotifyIcon; transparency requirement) ---
$global:notifyIcon = $null
function Show-StartNotice {
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
  } catch { }
  # Fallback toast via Windows.UI.Notifications (best-effort; balloon above is primary).
  try {
    $null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime]
    $tmpl = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
    $texts = $tmpl.GetElementsByTagName("text")
    $texts.Item(0).AppendChild($tmpl.CreateTextNode("Veridian")) | Out-Null
    $texts.Item(1).AppendChild($tmpl.CreateTextNode("keystroke recording is ON (local only)")) | Out-Null
    $toast = [Windows.UI.Notifications.ToastNotification]::new($tmpl)
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Veridian").Show($toast)
  } catch { }
}

function Translate-Vk {
  param([int]$vk, [bool]$shift, [bool]$caps)
  # Letters
  if ($vk -ge 0x41 -and $vk -le 0x5A) {
    $ch = [char]$vk                       # 'A'..'Z'
    $upper = ($shift -xor $caps)          # CapsLock XOR Shift => uppercase
    if ($upper) { return $ch.ToString() } else { return ([char]($vk + 32)).ToString() }
  }
  if ($digits.ContainsKey($vk))  { return $(if ($shift) { $digitsShift[$vk] } else { $digits[$vk] }) }
  if ($numpad.ContainsKey($vk))  { return $numpad[$vk] }
  if ($punct.ContainsKey($vk))   { $pair = $punct[$vk]; return $(if ($shift) { $pair[1] } else { $pair[0] }) }
  switch ($vk) {
    $VK_SPACE  { return " " }
    $VK_RETURN { return "`n" }
    $VK_TAB    { return "`t" }
    $VK_BACK   { return [string][char]0x232B }   # U+232B ERASE LEFT = "⌫"
  }
  return ""
}

function Trim-Log {
  param([string]$path, [int]$maxBytes)
  try {
    if (-not (Test-Path $path)) { return }
    $fi = Get-Item $path
    if ($fi.Length -le $maxBytes) { return }
    $bytes = [System.IO.File]::ReadAllBytes($path)
    $start = $bytes.Length - $maxBytes
    $tail  = New-Object byte[] $maxBytes
    [Array]::Copy($bytes, $start, $tail, 0, $maxBytes)
    [System.IO.File]::WriteAllBytes($path, $tail)
  } catch { }
}

# Candidate VK codes to poll: letters, digits, numpad, punctuation, space/enter/tab/back.
$watchVks = @()
$watchVks += 0x41..0x5A
$watchVks += $digits.Keys
$watchVks += $numpad.Keys
$watchVks += $punct.Keys
$watchVks += @($VK_SPACE, $VK_RETURN, $VK_TAB, $VK_BACK)

# Previous down-state per VK (to detect DOWN transitions only).
$prev = @{}
foreach ($vk in $watchVks) { $prev[$vk] = $false }

# --- Visible banner + notification ---
Write-Host "KEYLOG RECORDING (local only) - keystroke-log.txt"
Write-Host "  log:   $logPath"
Write-Host "  pause: create $pausePath to pause capture"
Show-StartNotice

$buffer = New-Object System.Text.StringBuilder
$lastFlush = [DateTime]::Now

try {
  while ($true) {
    try {
      # PAUSE: if the flag file exists, capture nothing this tick (just idle).
      if (Test-Path $pausePath) {
        Start-Sleep -Milliseconds 200
        # Drop any tracked down-states so a key held across pause won't double-fire.
        foreach ($vk in $watchVks) { $prev[$vk] = $false }
        continue
      }

      $shift = ([VeridianKeys]::GetAsyncKeyState($VK_SHIFT) -band 0x8000) -ne 0
      $caps  = ([VeridianKeys]::GetKeyState($VK_CAPITAL) -band 0x0001) -ne 0

      foreach ($vk in $watchVks) {
        $down = ([VeridianKeys]::GetAsyncKeyState($vk) -band 0x8000) -ne 0
        if ($down -and -not $prev[$vk]) {
          $ch = Translate-Vk -vk $vk -shift $shift -caps $caps
          if ($ch -ne "") { [void]$buffer.Append($ch) }
        }
        $prev[$vk] = $down
      }

      # Flush periodically (or when buffer grows) to the LOCAL log file.
      $now = [DateTime]::Now
      if ($buffer.Length -gt 0 -and (($now - $lastFlush).TotalMilliseconds -ge 1000 -or $buffer.Length -ge 256)) {
        try {
          [System.IO.File]::AppendAllText($logPath, $buffer.ToString(), [System.Text.Encoding]::UTF8)
        } catch { }
        [void]$buffer.Clear()
        $lastFlush = $now
        Trim-Log -path $logPath -maxBytes $MaxBytes
      }
    } catch { }

    Start-Sleep -Milliseconds 30
  }
} finally {
  # Best-effort final flush + cleanup of the tray icon.
  try { if ($buffer.Length -gt 0) { [System.IO.File]::AppendAllText($logPath, $buffer.ToString(), [System.Text.Encoding]::UTF8) } } catch { }
  try { if ($global:notifyIcon) { $global:notifyIcon.Visible = $false; $global:notifyIcon.Dispose() } } catch { }
}

