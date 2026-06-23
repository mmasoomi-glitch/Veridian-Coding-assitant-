# Veridian keystroke METRICS monitor — PRIVACY-SAFE BY DESIGN.
#
# This records ONLY aggregate timing/counting metrics about typing activity.
# It NEVER records, stores, logs, or transmits which keys were pressed or any
# typed content. It cannot reconstruct text: it tracks only how many keys went
# down, how many of those were corrections (Backspace/Delete), and the timing
# gaps between keystrokes. That is the entire data surface.
#
# Mechanism: poll GetAsyncKeyState (~40ms) across the virtual-key range and
# detect DOWN transitions (edge). For each new key-down we increment a counter
# and, separately, if the key is Backspace (0x08) or Delete (0x2E) we increment
# a "corrections" counter. We intentionally do NOT branch on, accumulate, or
# emit the identity of any other key.
#
# Every ~15s a metrics SAMPLE is appended to keystroke-metrics.json (cwd) as:
#   { ts, keys, corrections, avgGapMs, maxGapMs, longPauses }
# Cap: 200 samples (oldest dropped).
#
# Runs until killed.

$ErrorActionPreference = "SilentlyContinue"

try {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public class VeridianKeyState {
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
}
"@
} catch { }

$OUT_FILE   = Join-Path (Get-Location).Path "keystroke-metrics.json"
$VK_BACK    = 0x08   # Backspace
$VK_DELETE  = 0x2E   # Delete
$POLL_MS    = 40
$SAMPLE_MS  = 15000
$MAX_SAMPLES = 200
$LONG_PAUSE_MS = 3000

# We scan a conservative VK range that covers letters, digits, punctuation,
# space, enter, tab, backspace, delete, and the numpad — i.e. typing-relevant
# keys. We deliberately ignore pure modifiers' identity (we only EDGE-count).
$VK_MIN = 0x08
$VK_MAX = 0xDF

Write-Output "METRICS RECORDING (timing only, no key content)"

# Per-key previous-down state for edge detection (down only counted on
# transition up->down, so a held key is one keypress, not many).
$prevDown = New-Object 'bool[]' ($VK_MAX + 1)

# Sample accumulators.
$keys        = 0
$corrections = 0
$longPauses  = 0
$gapSum      = 0.0
$gapCount    = 0
$maxGap      = 0.0
$lastKeyTime = $null

$windowStart = [DateTime]::UtcNow

function Read-Samples {
  param([string]$path)
  $arr = @()
  try {
    if (Test-Path $path) {
      $raw = Get-Content $path -Raw -ErrorAction SilentlyContinue
      if ($raw) {
        $parsed = $raw | ConvertFrom-Json -ErrorAction SilentlyContinue
        if ($parsed) { $arr = @($parsed) }
      }
    }
  } catch { $arr = @() }
  return $arr
}

function Write-Sample {
  param([string]$path, $samples)
  try {
    $tmp = "$path.tmp"
    ($samples | ConvertTo-Json -Depth 4) | Set-Content -Path $tmp -Encoding UTF8 -ErrorAction SilentlyContinue
    Move-Item -Path $tmp -Destination $path -Force -ErrorAction SilentlyContinue
  } catch {
    try { ($samples | ConvertTo-Json -Depth 4) | Set-Content -Path $path -Encoding UTF8 -ErrorAction SilentlyContinue } catch { }
  }
}

while ($true) {
  try {
    # --- Poll the key range for fresh DOWN transitions ---
    for ($vk = $VK_MIN; $vk -le $VK_MAX; $vk++) {
      $state = [VeridianKeyState]::GetAsyncKeyState($vk)
      # High-order bit set => key currently down.
      $isDown = (($state -band 0x8000) -ne 0)

      if ($isDown -and -not $prevDown[$vk]) {
        # NEW keypress edge. Count it — but NEVER record which key it is,
        # except to bucket the two correction keys as a correction count.
        $keys++

        $now = [DateTime]::UtcNow
        if ($null -ne $lastKeyTime) {
          $gap = ($now - $lastKeyTime).TotalMilliseconds
          if ($gap -ge 0) {
            $gapSum += $gap
            $gapCount++
            if ($gap -gt $maxGap) { $maxGap = $gap }
            if ($gap -gt $LONG_PAUSE_MS) { $longPauses++ }
          }
        }
        $lastKeyTime = $now

        if ($vk -eq $VK_BACK -or $vk -eq $VK_DELETE) {
          # Counted as a "correction" metric — NOT as content.
          $corrections++
        }
      }

      $prevDown[$vk] = $isDown
    }

    # --- Emit a sample every ~15s ---
    if (([DateTime]::UtcNow - $windowStart).TotalMilliseconds -ge $SAMPLE_MS) {
      $avgGap = if ($gapCount -gt 0) { [math]::Round($gapSum / $gapCount, 1) } else { 0 }
      $sample = [ordered]@{
        ts          = ([DateTime]::UtcNow).ToString("o")
        keys        = $keys
        corrections = $corrections
        avgGapMs    = $avgGap
        maxGapMs    = [math]::Round($maxGap, 1)
        longPauses  = $longPauses
      }

      $samples = @(Read-Samples -path $OUT_FILE)
      $samples += $sample
      if ($samples.Count -gt $MAX_SAMPLES) {
        $samples = $samples[($samples.Count - $MAX_SAMPLES)..($samples.Count - 1)]
      }
      Write-Sample -path $OUT_FILE -samples $samples

      # Reset window accumulators.
      $keys = 0; $corrections = 0; $longPauses = 0
      $gapSum = 0.0; $gapCount = 0; $maxGap = 0.0
      $windowStart = [DateTime]::UtcNow
    }
  } catch { }

  Start-Sleep -Milliseconds $POLL_MS
}
