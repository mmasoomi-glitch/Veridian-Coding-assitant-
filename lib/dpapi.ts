// Windows DPAPI sealing — the "proper Windows way" to store a secret on a device,
// the same primitive Chrome uses for its tokens. Secrets are protected with
// CryptProtectData (via .NET ProtectedData) under the CurrentUser scope, so the
// ciphertext is bound to the logged-in Windows account: copy veridian.cred to
// another machine or another user and it CANNOT be decrypted.
//
// No native modules — we drive .NET ProtectedData through PowerShell (we already
// use PowerShell across the app). Plaintext is passed over stdin, never on the
// command line. App-specific entropy namespaces our blobs.
//
// On non-Windows (dev/Linux), DPAPI is unavailable; callers fall back to a
// machine-key cipher (see auth/vault.ts) and surface a clear warning.

import { spawn } from "node:child_process";

const ENTROPY = "veridian-vault-v1";

export function dpapiAvailable(): boolean {
  return process.platform === "win32";
}

function runPowerShell(script: string, stdin: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const ps = spawn(
        "powershell",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
        { windowsHide: true }
      );
      let out = "";
      let err = "";
      ps.stdout.on("data", (d) => (out += d.toString()));
      ps.stderr.on("data", (d) => (err += d.toString()));
      ps.on("error", () => resolve(null));
      ps.on("close", (code) => {
        if (code === 0) resolve(out);
        else {
          if (err.trim()) console.error("dpapi powershell error:", err.trim().slice(0, 200));
          resolve(null);
        }
      });
      ps.stdin.on("error", () => resolve(null));
      ps.stdin.write(stdin);
      ps.stdin.end();
    } catch {
      resolve(null);
    }
  });
}

const PROTECT_SCRIPT = `
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$in = [Console]::In.ReadToEnd()
$bytes = [Text.Encoding]::UTF8.GetBytes($in)
$ent = [Text.Encoding]::UTF8.GetBytes('${ENTROPY}')
$prot = [Security.Cryptography.ProtectedData]::Protect($bytes, $ent, 'CurrentUser')
[Console]::Out.Write([Convert]::ToBase64String($prot))
`.trim();

const UNPROTECT_SCRIPT = `
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$in = [Console]::In.ReadToEnd()
$prot = [Convert]::FromBase64String($in.Trim())
$ent = [Text.Encoding]::UTF8.GetBytes('${ENTROPY}')
$bytes = [Security.Cryptography.ProtectedData]::Unprotect($prot, $ent, 'CurrentUser')
[Console]::Out.Write([Text.Encoding]::UTF8.GetString($bytes))
`.trim();

/** Seal a UTF-8 string with DPAPI(CurrentUser). Returns base64 ciphertext, or null. */
export async function dpapiProtect(plaintext: string): Promise<string | null> {
  if (!dpapiAvailable()) return null;
  const out = await runPowerShell(PROTECT_SCRIPT, String(plaintext));
  return out && out.trim() ? out.trim() : null;
}

/** Unseal a DPAPI(CurrentUser) base64 blob. Returns plaintext, or null if it
 *  wasn't sealed by this Windows user/machine (or any failure). */
export async function dpapiUnprotect(b64: string): Promise<string | null> {
  if (!dpapiAvailable()) return null;
  if (!b64) return null;
  return await runPowerShell(UNPROTECT_SCRIPT, String(b64));
}
