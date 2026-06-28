# D30 — Device -> status collector contract (Tailscale).
# Runs `tailscale status --json` and emits ONE compact JSON line describing the
# fleet's devices. STRICT ALLOWLIST (F-004): ONLY these four fields leave this
# script -> name / os / online / lastSeen. Every other field from the tailscale
# payload (IP addresses, magic-DNS names, raw socket addrs, public keys, the
# Peer map keys, and any local file paths) is dropped and NEVER emitted.
# On tailscale-not-found: emit {ok:false,...} and exit 0 (never throw).
# Style matches telemetry/collect.ps1 (SilentlyContinue + ConvertTo-Json -Compress).

$ErrorActionPreference = "SilentlyContinue"

function Emit-NotFound {
  $payload = [ordered]@{
    ok          = $false
    reason      = "tailscale-not-found"
    collectedAt = (Get-Date).ToUniversalTime().ToString("o")
    devices     = @()
  }
  $payload | ConvertTo-Json -Compress -Depth 4
  exit 0
}

# --- Resolve the tailscale executable: PATH first, then the default install path. ---
$exe = $null
$cmd = Get-Command tailscale -ErrorAction SilentlyContinue
if ($cmd -and $cmd.Source) {
  $exe = $cmd.Source
} else {
  $default = "C:\Program Files\Tailscale\tailscale.exe"
  if (Test-Path $default) { $exe = $default }
}
if (-not $exe) { Emit-NotFound }

# --- Run `tailscale status --json` and parse. ---
$raw = & $exe status --json 2>$null
if (-not $raw) { Emit-NotFound }

$status = $null
try {
  $status = $raw | ConvertFrom-Json
} catch {
  Emit-NotFound
}
if (-not $status) { Emit-NotFound }

# --- Build the ALLOWLISTED device list. Self + Peer entries. ---
$devices = @()

function Add-Device([object]$node) {
  if (-not $node) { return $null }
  # name: prefer HostName, fall back to the leaf of DNSName (never emit the FQDN/DNSName itself).
  $name = ""
  if ($node.HostName) { $name = [string]$node.HostName }
  elseif ($node.DNSName) { $name = ([string]$node.DNSName).Split('.')[0] }

  $deviceOs = if ($node.OS) { [string]$node.OS } else { "unknown" }
  $online   = [bool]$node.Online
  $lastSeen = if ($node.LastSeen) { [string]$node.LastSeen } else { "" }

  return [ordered]@{
    name     = $name
    os       = $deviceOs
    online   = $online
    lastSeen = $lastSeen
  }
}

$selfDev = Add-Device $status.Self
if ($selfDev) { $devices += $selfDev }

if ($status.Peer) {
  # Peer is a map keyed by public key; iterate values only (keys are NEVER emitted).
  foreach ($prop in $status.Peer.PSObject.Properties) {
    $peerDev = Add-Device $prop.Value
    if ($peerDev) { $devices += $peerDev }
  }
}

$payload = [ordered]@{
  ok          = $true
  collectedAt = (Get-Date).ToUniversalTime().ToString("o")
  devices     = @($devices)
}

$payload | ConvertTo-Json -Compress -Depth 4
