param([int]$Target)

# Veridian virtual-desktop switcher.
# Switches the active Windows 11 virtual desktop to a 1-based $Target index
# using ONLY native Windows facilities: the registry (to learn where we are
# and how many desktops exist) and the built-in Win+Ctrl+Left/Right keyboard
# shortcuts (sent via the Win32 keybd_event API) to get there.
#
# No third-party executables are downloaded or run.
#
# Always emits exactly one line of compact JSON on stdout:
#   {"switched":<bool>,"from":<int>,"to":<int>,"total":<int>,"error":"<opt>"}

$ErrorActionPreference = "SilentlyContinue"

# ---- Win32 P/Invoke for synthetic keystrokes ----
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class VeridianKbd {
  [DllImport("user32.dll")]
  public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@

$VK_LWIN     = [byte]0x5B
$VK_CONTROL  = [byte]0x11
$VK_RIGHT    = [byte]0x27
$VK_LEFT     = [byte]0x25
$KEYUP       = [uint32]0x0002

function Send-DesktopStep([byte]$arrow) {
  # Press modifiers, tap the arrow, then release in reverse order.
  [VeridianKbd]::keybd_event($VK_LWIN,    0, 0,      [UIntPtr]::Zero)
  [VeridianKbd]::keybd_event($VK_CONTROL, 0, 0,      [UIntPtr]::Zero)
  [VeridianKbd]::keybd_event($arrow,      0, 0,      [UIntPtr]::Zero)
  [VeridianKbd]::keybd_event($arrow,      0, $KEYUP, [UIntPtr]::Zero)
  [VeridianKbd]::keybd_event($VK_CONTROL, 0, $KEYUP, [UIntPtr]::Zero)
  [VeridianKbd]::keybd_event($VK_LWIN,    0, $KEYUP, [UIntPtr]::Zero)
}

$current = 0
$total   = 0
$switched = $false
$err = ""

try {
  $vdSub = "SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\VirtualDesktops"

  # Use the .NET registry API directly (same technique as collect.ps1):
  # Get-ItemProperty has been observed to return zero-length arrays for these
  # REG_BINARY values on this OS.
  $vdKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($vdSub)

  $curGuid = $null
  if ($vdKey) {
    $curRaw = $vdKey.GetValue("CurrentVirtualDesktop")
    if ($curRaw -and $curRaw.Length -eq 16) {
      $curGuid = [string]([guid]::new([byte[]]$curRaw)).ToString()
    }
  }

  # Ordered list of all desktop GUIDs. Prefer root VirtualDesktopIDs, then fall
  # back to SessionInfo\<n>\VirtualDesktops.
  $listRaw = $null
  if ($vdKey) { $listRaw = $vdKey.GetValue("VirtualDesktopIDs") }
  if (-not $listRaw -or $listRaw.Length -eq 0) {
    $siKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\SessionInfo")
    if ($siKey) {
      foreach ($sName in $siKey.GetSubKeyNames()) {
        $sVd = $siKey.OpenSubKey("$sName\VirtualDesktops")
        if ($sVd) {
          $cand = $sVd.GetValue("VirtualDesktopIDs")
          if ($cand -and $cand.Length -gt 0) { $listRaw = $cand; break }
        }
      }
    }
  }

  $guidList = @()
  if ($listRaw -and ($listRaw.Length % 16 -eq 0) -and ($listRaw.Length -gt 0)) {
    $listBytes = [byte[]]$listRaw
    for ($i = 0; $i -lt $listBytes.Length; $i += 16) {
      $chunk = New-Object byte[] 16
      [Array]::Copy($listBytes, $i, $chunk, 0, 16)
      $guidList += [string]([guid]::new($chunk)).ToString()
    }
  }

  $total = [int]$guidList.Count

  if ($curGuid -and $guidList.Count -gt 0) {
    $idx = -1
    for ($i = 0; $i -lt $guidList.Count; $i++) {
      if ($guidList[$i] -ieq $curGuid) { $idx = $i; break }
    }
    if ($idx -ge 0) { $current = [int]($idx + 1) }
  }

  if ($current -lt 1 -or $total -lt 1) {
    $err = "could not determine current desktop"
  } elseif ($Target -lt 1 -or $Target -gt $total) {
    $err = "target out of range"
  } else {
    $delta = [int]($Target - $current)
    if ($delta -ne 0) {
      $arrow = if ($delta -gt 0) { $VK_RIGHT } else { $VK_LEFT }
      $steps = [Math]::Abs($delta)
      for ($s = 0; $s -lt $steps; $s++) {
        Send-DesktopStep $arrow
        Start-Sleep -Milliseconds 120
      }
      $switched = $true
    }
  }
} catch {
  $err = [string]$_.Exception.Message
}

$result = [ordered]@{
  switched = [bool]$switched
  from     = [int]$current
  to       = [int]$Target
  total    = [int]$total
}
if ($err) { $result.error = [string]$err }

$result | ConvertTo-Json -Compress
