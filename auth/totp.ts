// auth/totp.ts — Veridian's login: master passphrase (something you know) +
// TOTP 2FA (something you have), over the DPAPI-sealed vault (auth/vault.ts).
//
// This module is the orchestration layer:
//   - reads the TOTP/session secrets from the unsealed vault,
//   - verifies the two factors,
//   - issues/validates signed session cookies,
//   - rate-limits/locks out brute-force attempts.
// All secret material lives in the vault (sealed at rest); nothing here persists
// plaintext. Exported functions never throw.

import crypto from "node:crypto";
import * as QRCode from "qrcode";
import { authenticator } from "otplib";
import * as vault from "./vault";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// ---------- gating ----------

// Auth is required once a vault exists (the owner set up a strong login), or when
// explicitly forced via env, or (handled in server middleware) on a network bind.
export function authRequired(): boolean {
  return vault.isInitialized() || process.env.VERIDIAN_AUTH === "totp";
}

export function isConfigured(): boolean {
  return vault.isInitialized();
}

// ---------- setup ----------

/** First-run: create the vault with a master passphrase (+ optional shared sync
 *  key), then return the TOTP QR and one-time recovery codes. */
export async function setupVault(
  passphrase: string,
  syncKey?: string
): Promise<{ otpauthUri: string; qrDataUrl: string; recoveryCodes?: string[]; secret: string }> {
  await vault.initialize(passphrase, { syncKey });
  return getSetupInfo();
}

export async function getSetupInfo(): Promise<{
  otpauthUri: string;
  qrDataUrl: string;
  recoveryCodes?: string[];
  secret: string;
}> {
  const secret = vault.getTotpSecret();
  let otpauthUri = "";
  let qrDataUrl = "";
  try {
    otpauthUri = authenticator.keyuri("admin", "Veridian", secret);
    qrDataUrl = await QRCode.toDataURL(otpauthUri);
  } catch {
    /* leave blanks on failure */
  }
  const recoveryCodes = vault.takeRecoveryCodesOnce() || undefined;
  if (recoveryCodes) vault.markRecoveryRevealed();
  return { otpauthUri, qrDataUrl, recoveryCodes, secret };
}

// ---------- factors ----------

export function verifyPassphrase(passphrase: string): boolean {
  return vault.verifyPassphrase(passphrase);
}

export function verifyCode(code: string): boolean {
  try {
    const secret = vault.getTotpSecret();
    if (!secret || !code) return false;
    return authenticator.verify({ token: String(code).trim(), secret });
  } catch {
    return false;
  }
}

export async function verifyRecovery(code: string): Promise<boolean> {
  try {
    return await vault.consumeRecovery(code);
  } catch {
    return false;
  }
}

// ---------- brute-force lockout ----------

let fails = 0;
let lockedUntil = 0;
const MAX_FAILS = 5;
const LOCK_MS = 5 * 60 * 1000;

export function lockState(): { locked: boolean; retryInMs: number; failsLeft: number } {
  const now = Date.now();
  const locked = now < lockedUntil;
  return { locked, retryInMs: locked ? lockedUntil - now : 0, failsLeft: Math.max(0, MAX_FAILS - fails) };
}
function recordFail(): void {
  fails++;
  if (fails >= MAX_FAILS) {
    lockedUntil = Date.now() + LOCK_MS;
    fails = 0;
  }
}
function recordSuccess(): void {
  fails = 0;
  lockedUntil = 0;
}

// ---------- combined 2FA login ----------

/** Verify passphrase AND second factor (TOTP code or recovery code). On success
 *  returns a session token; on failure increments the lockout counter. */
export async function login(
  passphrase: string,
  code: string,
  recovery?: string
): Promise<{ ok: boolean; token?: string; error?: string; lockedMs?: number }> {
  const ls = lockState();
  if (ls.locked) return { ok: false, error: "locked", lockedMs: ls.retryInMs };

  const passOk = verifyPassphrase(passphrase);
  const secondOk = recovery ? await verifyRecovery(recovery) : verifyCode(code);
  if (!passOk || !secondOk) {
    recordFail();
    const after = lockState();
    return { ok: false, error: "invalid", lockedMs: after.locked ? after.retryInMs : undefined };
  }
  recordSuccess();
  return { ok: true, token: createSessionToken() };
}

// ---------- stateless signed session tokens (HMAC with vault session secret) ----------

function hmacHex(data: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

export function createSessionToken(): string {
  try {
    const secret = vault.getSessionSecret();
    if (!secret) return "";
    const payload = { exp: Date.now() + SEVEN_DAYS_MS };
    const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
    return `${payloadB64}.${hmacHex(payloadB64, secret)}`;
  } catch {
    return "";
  }
}

export function verifySessionToken(token?: string): boolean {
  try {
    if (!token || typeof token !== "string") return false;
    const dot = token.indexOf(".");
    if (dot === -1) return false;
    const payloadB64 = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const secret = vault.getSessionSecret();
    if (!secret) return false;
    const expected = hmacHex(payloadB64, secret);
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
    const payload = JSON.parse(Buffer.from(payloadB64, "base64").toString("utf8"));
    return typeof payload.exp === "number" && payload.exp > Date.now();
  } catch {
    return false;
  }
}
