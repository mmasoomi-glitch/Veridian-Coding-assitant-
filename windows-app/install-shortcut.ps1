# ============================================================
#  Veridian shortcut installer
#  Creates "Veridian" shortcuts on the Desktop and Start Menu
#  that launch the Edge app-mode window via launch-veridian.cmd
# ============================================================

$ErrorActionPreference = 'Stop'

$appDir      = Split-Path -Parent $MyInvocation.MyCommand.Definition
$veridianDir = Split-Path -Parent $appDir
$launcher    = Join-Path $appDir 'launch-veridian.cmd'
$iconPath    = Join-Path $appDir 'veridian.ico'

if (-not (Test-Path $launcher)) { throw "Launcher not found: $launcher" }
if (-not (Test-Path $iconPath)) { throw "Icon not found: $iconPath" }

$desktop   = [Environment]::GetFolderPath('Desktop')
$startMenu = [Environment]::GetFolderPath('Programs')   # ...\Start Menu\Programs

$targets = @(
    (Join-Path $desktop   'Veridian.lnk'),
    (Join-Path $startMenu 'Veridian.lnk')
)

$shell = New-Object -ComObject WScript.Shell
foreach ($lnkPath in $targets) {
    $sc = $shell.CreateShortcut($lnkPath)
    $sc.TargetPath       = $launcher
    $sc.WorkingDirectory = $veridianDir
    $sc.IconLocation     = "$iconPath,0"
    $sc.WindowStyle      = 7          # minimized (the cmd console flashes minimized)
    $sc.Description      = 'Veridian (Edge app-mode)'
    $sc.Save()
    if (Test-Path $lnkPath) {
        Write-Host "Created: $lnkPath"
    } else {
        Write-Warning "Failed to create: $lnkPath"
    }
}

# Release the COM object
[void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($shell)
Write-Host ""
Write-Host "Done. Shortcuts point to: $launcher"
Write-Host "Icon: $iconPath"
