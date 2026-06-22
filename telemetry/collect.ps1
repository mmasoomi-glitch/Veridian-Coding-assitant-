# Veridian real-telemetry collector.
# Emits a single compact JSON object describing the live machine state.
# Invoked on demand by the Express server (/api/telemetry/current).

$ErrorActionPreference = "SilentlyContinue"

# --- Active foreground window (title + owning process) ---
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class VeridianWin32 {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
}
"@

$hwnd = [VeridianWin32]::GetForegroundWindow()
$len = [VeridianWin32]::GetWindowTextLength($hwnd)
$sb = New-Object System.Text.StringBuilder ($len + 1)
[VeridianWin32]::GetWindowText($hwnd, $sb, $sb.Capacity) | Out-Null
$windowTitle = $sb.ToString()
$procId = 0
[VeridianWin32]::GetWindowThreadProcessId($hwnd, [ref]$procId) | Out-Null
$proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
$activeApp = if ($proc) { $proc.ProcessName } else { "unknown" }

# --- Clipboard (text only) ---
$clip = Get-Clipboard -Raw -ErrorAction SilentlyContinue
if ($null -eq $clip) { $clip = "" }
if ($clip.Length -gt 500) { $clip = $clip.Substring(0, 500) + "..." }

# --- Recent PowerShell command history ---
$historyPath = Join-Path $env:APPDATA "Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt"
$recentCommands = @()
if (Test-Path $historyPath) {
  # Cast each line to a plain string; Get-Content otherwise attaches provider
  # note-properties that ConvertTo-Json expands into megabytes of noise.
  $recentCommands = @(Get-Content $historyPath -Tail 8 -ErrorAction SilentlyContinue | ForEach-Object { [string]$_ })
}

# --- Git state for the watched repository ---
$watchDir = $env:VERIDIAN_WATCH_DIR
$gitRepo = ""
$gitBranch = ""
$latestCommit = ""
$modifiedFiles = @()
$workspacePath = ""

if ($watchDir -and (Test-Path $watchDir)) {
  $workspacePath = $watchDir
  $gitRepo = Split-Path $watchDir -Leaf
  Push-Location $watchDir
  $isRepo = (& git rev-parse --is-inside-work-tree 2>$null)
  if ($isRepo -eq "true") {
    $gitBranch = (& git rev-parse --abbrev-ref HEAD 2>$null)
    $latestCommit = (& git log -1 --pretty=format:"%s" 2>$null)
    $status = & git status --porcelain 2>$null
    if ($status) {
      $modifiedFiles = @($status | ForEach-Object { ($_.Substring(3)).Trim() } | Where-Object { $_ })
    }
  }
  Pop-Location
}

# --- Virtual desktop detection (via registry GUID ordering) ---
# Reads the current desktop GUID and the ordered list of all desktop GUIDs,
# then computes the 1-based index. Everything is coerced to plain [string]/[int]
# so ConvertTo-Json doesn't expand registry ETS note-properties.
$virtualDesktop = "unknown"
try {
  $vdSub = "SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\VirtualDesktops"

  # Use the .NET registry API directly: Get-ItemProperty has been observed on
  # this OS to return zero-length arrays for these REG_BINARY values.
  $vdKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($vdSub)

  $curGuid = $null
  if ($vdKey) {
    $curRaw = $vdKey.GetValue("CurrentVirtualDesktop")
    if ($curRaw -and $curRaw.Length -eq 16) {
      $curGuid = [string]([guid]::new([byte[]]$curRaw)).ToString()
    }
  }

  # Ordered list of all desktop GUIDs. Prefer the root VirtualDesktopIDs,
  # then fall back to SessionInfo\<n>\VirtualDesktops.
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

  # Per-desktop friendly name, if the user named it.
  $deskName = ""
  if ($curGuid) {
    $nameKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("$vdSub\Desktops\{$curGuid}")
    if ($nameKey) {
      $nameVal = $nameKey.GetValue("Name")
      if ($nameVal) { $deskName = [string]$nameVal }
    }
  }

  if ($curGuid -and $guidList.Count -gt 0) {
    $idx = -1
    for ($i = 0; $i -lt $guidList.Count; $i++) {
      if ($guidList[$i] -ieq $curGuid) { $idx = $i; break }
    }
    if ($idx -ge 0) {
      $num = [int]($idx + 1)
      if ($deskName) {
        $virtualDesktop = [string]("Desktop $num ($deskName)")
      } else {
        $virtualDesktop = [string]("Desktop $num")
      }
    }
  }
} catch {
  $virtualDesktop = "unknown"
}

# --- Browser title + active-tab URL (via UI Automation) ---
$browserTitle = "unknown"
$browserUrl = "unknown"
$browserProcs = @("chrome", "msedge", "firefox", "brave")
if ($browserProcs -contains $activeApp.ToLower()) {
  # The foreground window title already carries the active tab title.
  if ($windowTitle) { $browserTitle = [string]$windowTitle }

  try {
    Add-Type -AssemblyName UIAutomationClient -ErrorAction SilentlyContinue | Out-Null
    Add-Type -AssemblyName UIAutomationTypes -ErrorAction SilentlyContinue | Out-Null

    $root = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
    if ($root) {
      $editCond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
        [System.Windows.Automation.ControlType]::Edit)
      $edits = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $editCond)

      foreach ($e in $edits) {
        $name = [string]$e.Current.Name
        # The address bar is typically named "Address and search bar" (Chromium)
        # or "Search or enter address" (Firefox). Match loosely, else take the
        # first edit that exposes a URL-looking value.
        $isAddr = ($name -match "(?i)address|search or enter|location")
        $vpObj = $null
        if ($e.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$vpObj)) {
          $val = [string]$vpObj.Current.Value
          if ($val) {
            if ($isAddr) { $browserUrl = $val; break }
            if (($browserUrl -eq "unknown") -and ($val -match "(?i)^([a-z]+://|www\.|\S+\.\S+)")) {
              $browserUrl = $val
            }
          }
        }
      }
      if ($browserUrl -ne "unknown") { $browserUrl = [string]$browserUrl }
    }
  } catch {
    $browserUrl = "unknown"
  }
}

# --- Assemble payload ---
$payload = [ordered]@{
  collectedAt    = (Get-Date).ToUniversalTime().ToString("o")
  activeApp      = $activeApp
  windowTitle    = $windowTitle
  workspacePath  = $workspacePath
  gitRepo        = $gitRepo
  gitBranch      = $gitBranch
  latestCommit   = $latestCommit
  modifiedFiles  = $modifiedFiles
  clipboard      = $clip
  recentCommands = $recentCommands
  virtualDesktop = $virtualDesktop
  browserTitle   = $browserTitle
  browserUrl     = $browserUrl
}

$payload | ConvertTo-Json -Compress -Depth 5
