param([string]$OutDir = "C:\Users\HI\veridian\screenshots\")

# Veridian screen capture.
# Captures the PRIMARY screen to a PNG using only native .NET (System.Drawing /
# System.Windows.Forms BitBlt via Graphics.CopyFromScreen). Downscales to a max
# width of 1280px (bicubic) to keep files small, since these images are kept as
# rolling AI context. Saves to $OutDir as shot-yyyyMMdd-HHmmss.png and prints
# exactly one line: the saved absolute path (empty on failure).
#
# No third-party executables are downloaded or run.

$ErrorActionPreference = "SilentlyContinue"

try {
  Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue | Out-Null
  Add-Type -AssemblyName System.Drawing -ErrorAction SilentlyContinue | Out-Null

  if (-not (Test-Path $OutDir)) {
    New-Item -ItemType Directory -Path $OutDir -Force -ErrorAction SilentlyContinue | Out-Null
  }

  # Primary screen bounds (DPI-virtualized pixels are fine for context shots).
  $screen = [System.Windows.Forms.Screen]::PrimaryScreen
  $b = $screen.Bounds
  $w = [int]$b.Width
  $h = [int]$b.Height
  if ($w -lt 1 -or $h -lt 1) { Write-Output ""; return }

  # Grab the full primary screen.
  $full = New-Object System.Drawing.Bitmap($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($full)
  $g.CopyFromScreen($b.X, $b.Y, 0, 0, $full.Size)
  $g.Dispose()

  # Decide whether to downscale to max width 1280 (preserve aspect ratio).
  $maxW = 1280
  if ($w -gt $maxW) {
    $scale = $maxW / [double]$w
    $nw = [int][Math]::Round($w * $scale)
    $nh = [int][Math]::Round($h * $scale)
    $out = New-Object System.Drawing.Bitmap($nw, $nh)
    $gg = [System.Drawing.Graphics]::FromImage($out)
    $gg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $gg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $gg.DrawImage($full, 0, 0, $nw, $nh)
    $gg.Dispose()
    $full.Dispose()
  } else {
    $out = $full
  }

  $name = "shot-" + (Get-Date).ToString("yyyyMMdd-HHmmss") + ".png"
  $path = Join-Path $OutDir $name
  $out.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $out.Dispose()

  Write-Output $path
} catch {
  Write-Output ""
}
