// Sealed credential vault — the single source of truth for Veridian's auth/secret
// material, stored on the device the "proper Windows way."
//
// At rest, the whole vault is sealed with Windows DPAPI(CurrentUser) (lib/dpapi.ts)
// — bound to the logged-in Windows account, like Chrome's token store. On
// non-Windows it falls back to an AES-256-GCM cipher keyed from machine identity
// (clearly weaker — logged once). Decrypted contents live only in memory after
// unseal().
//
// Holds: master passphrase hash (scrypt) + salt, the TOTP secret, the signed-
// session secret, the cross-device sync key, and one-time-use recovery code hashes.
// Nothing here is stored in plaintext on disk.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { authenticator } from "otplib";
import { dpapiAvailable, dpapiProtect, dpapiUnprotect } from "../lib/dpapi";
import { writeJsonAtomic } from "../lib/atomic";
import { dataPath } from "../lib/paths";

const CRED_PATH = dataPath("veridian.cred");
const LEGACY_TOTP_PATH = dataPath("totp-config.json");

interface VaultData {
  v: 1;
  passSalt: string;        // hex
  passHash: string;        // scrypt(passphrase, salt) hex
  totpSecret: string;      // otplib base32 secret
  sessionSecret: string;   // hex, signs session cookies
  syncKey: string;         // shared cross-device clipboard key ("" = off)
  recoveryHashes: string[];// sha256 of single-use recovery codes
  recoveryRevealed: boolean;
  createdAt: string;
}

// ---------- at-rest sealing (DPAPI on Windows, AES fallback elsewhere) ----------

function machineFallbackKey(): Buffer {
  const seed = [require("node:os").hostname(), require("node:os").userInfo().username, process.platform, "veridian-vault-fallback"].join("|");
  return crypto.createHash("sha256").update(seed).digest();
}

async function sealString(plain: string): Promise<string> {
  if (dpapiAvailable()) {
    const blob = await dpapiProtect(plain);
    if (blob) return JSON.stringify({ method: "dpapi", data: blob });
    // fall through to fallback if DPAPI unexpectedly failed
  }
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", machineFallbackKey(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return JSON.stringify({ method: "machine", data: Buffer.concat([iv, tag, ct]).toString("base64") });
}

async function unsealString(wrapped: string): Promise<string | null> {
  try {
    const obj = JSON.parse(wrapped);
    if (obj.method === "dpapi") return await dpapiUnprotect(obj.data);
    if (obj.method === "machine") {
      const buf = Buffer.from(obj.data, "base64");
      const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), ct = buf.subarray(28);
      const d = crypto.createDecipheriv("aes-256-gcm", machineFallbackKey(), iv);
      d.setAuthTag(tag);
      return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
    }
  } catch { /* ignore */ }
  return null;
}

// ---------- in-memory state ----------

let cache: VaultData | null = null;
let plainRecoveryOnce: string[] | null = null; // surfaced exactly once after init

export function isInitialized(): boolean {
  return fs.existsSync(CRED_PATH);
}

export function isUnsealed(): boolean {
  return cache != null;
}

export function sealingMethod(): "dpapi" | "machine" | "none" {
  return dpapiAvailable() ? "dpapi" : (isInitialized() ? "machine" : "none");
}

/** Load + decrypt the vault into memory. Call once at startup. */
export async function unseal(): Promise<boolean> {
  try {
    if (!fs.existsSync(CRED_PATH)) return false;
    const wrapped = fs.readFileSync(CRED_PATH, "utf8");
    const json = await unsealString(wrapped);
    if (!json) return false;
    const data = JSON.parse(json) as VaultData;
    if (!data || data.v !== 1) return false;
    cache = data;
    return true;
  } catch {
    return false;
  }
}

async function persist(): Promise<void> {
  if (!cache) return;
  const wrapped = await sealString(JSON.stringify(cache));
  // wrapped is a small JSON string; write atomically.
  writeJsonAtomic(CRED_PATH, JSON.parse(wrapped));
}

// ---------- passphrase hashing ----------

function hashPass(passphrase: string, saltHex: string): string {
  return crypto.scryptSync(passphrase, Buffer.from(saltHex, "hex"), 64).toString("hex");
}

export function verifyPassphrase(passphrase: string): boolean {
  try {
    if (!cache || !passphrase) return false;
    const computed = Buffer.from(hashPass(passphrase, cache.passSalt), "hex");
    const stored = Buffer.from(cache.passHash, "hex");
    return computed.length === stored.length && crypto.timingSafeEqual(computed, stored);
  } catch {
    return false;
  }
}

// ---------- initialization ----------

function genRecoveryCodes(n = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < n; i++) {
    const raw = crypto.randomBytes(5).toString("hex");
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return codes;
}
function sha256(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

/** Create the vault with a master passphrase. Generates TOTP secret, session
 *  secret, recovery codes, and (optionally) the shared cross-device sync key.
 *  Returns the data to show ONCE (recovery codes); the TOTP secret is read via
 *  getTotpSecret() for the QR. */
export async function initialize(passphrase: string, opts?: { syncKey?: string }): Promise<{ recoveryCodes: string[] }> {
  if (!passphrase || passphrase.length < 8) throw new Error("passphrase must be at least 8 characters");
  const salt = crypto.randomBytes(16).toString("hex");
  const recovery = genRecoveryCodes();
  cache = {
    v: 1,
    passSalt: salt,
    passHash: hashPass(passphrase, salt),
    totpSecret: authenticator.generateSecret(),
    sessionSecret: crypto.randomBytes(32).toString("hex"),
    syncKey: String(opts?.syncKey || ""),
    recoveryHashes: recovery.map(sha256),
    recoveryRevealed: false,
    createdAt: new Date().toISOString()
  };
  plainRecoveryOnce = recovery;
  await persist();
  // Best-effort: retire the legacy plaintext TOTP config now that the vault owns auth.
  try { if (fs.existsSync(LEGACY_TOTP_PATH)) fs.renameSync(LEGACY_TOTP_PATH, LEGACY_TOTP_PATH + ".superseded"); } catch { /* ignore */ }
  return { recoveryCodes: recovery };
}

/** Change the master passphrase (requires the current one). */
export async function changePassphrase(current: string, next: string): Promise<boolean> {
  if (!cache || !verifyPassphrase(current)) return false;
  if (!next || next.length < 8) throw new Error("passphrase must be at least 8 characters");
  const salt = crypto.randomBytes(16).toString("hex");
  cache.passSalt = salt;
  cache.passHash = hashPass(next, salt);
  await persist();
  return true;
}

// ---------- accessors (in-memory; require unseal) ----------

export function getTotpSecret(): string { return cache?.totpSecret || ""; }
export function getSessionSecret(): string { return cache?.sessionSecret || ""; }
export function getSyncKey(): string { return cache?.syncKey || ""; }

export async function setSyncKey(key: string): Promise<void> {
  if (!cache) return;
  cache.syncKey = String(key || "");
  await persist();
}

export async function rotateSessionSecret(): Promise<void> {
  if (!cache) return;
  cache.sessionSecret = crypto.randomBytes(32).toString("hex");
  await persist();
}

/** One-time reveal of freshly-generated recovery codes after initialize(). */
export function takeRecoveryCodesOnce(): string[] | null {
  const r = plainRecoveryOnce;
  plainRecoveryOnce = null;
  return r;
}

export function markRecoveryRevealed(): void {
  if (cache) { cache.recoveryRevealed = true; void persist(); }
}

/** Consume a single-use recovery code (removes it on success). */
export async function consumeRecovery(code: string): Promise<boolean> {
  if (!cache || !code) return false;
  const h = sha256(String(code).trim());
  const idx = cache.recoveryHashes.indexOf(h);
  if (idx === -1) return false;
  cache.recoveryHashes.splice(idx, 1);
  await persist();
  return true;
}
