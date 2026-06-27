// auth/totp.ts — Admin TOTP (2FA) for Veridian.
//
// When env VERIDIAN_AUTH=totp is set (the cloud), the app requires a TOTP code
// from an authenticator app to enter. Unset (local) = no auth, frictionless.
//
// Config is persisted to `totp-config.json` at process.cwd():
//   { secret, recoveryHashes[], sessionSecret, recoveryRevealed? }
// secret / sessionSecret can be seeded from env TOTP_SECRET / AUTH_SESSION_SECRET.
//
// All file IO is wrapped in try/catch; exported functions never throw
// (verify* functions just return false on any error).

import { authenticator } from "otplib";
import * as QRCode from "qrcode";
import crypto from "node:crypto";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { writeJsonAtomic } from "../lib/atomic";

const CONFIG_PATH = path.join(process.cwd(), "totp-config.json");

// ---------- at-rest encryption of the TOTP secret (F-003/F-029) ----------
// The TOTP secret is the one piece of auth material that must stay reversible
// (otplib needs the plaintext to verify codes), so it cannot just be hashed.
// We encrypt it at rest with a key bound to this machine+user, so a stolen
// totp-config.json is useless off the box. Decryption happens only in memory.
// Recovery codes remain one-way hashed (see below) — never encrypted/stored raw.
const ENC_PREFIX = "enc:v1:";

function machineKey(): Buffer {
  // A stable per-machine/user seed. AUTH_SESSION_SECRET (if set) further pins it.
  const seed = [
    os.hostname(),
    os.userInfo().username,
    process.platform,
    process.arch,
    process.env.AUTH_SESSION_SECRET || "veridian-totp-pepper"
  ].join("|");
  return crypto.createHash("sha256").update(seed, "utf8").digest(); // 32 bytes
}

function encryptSecret(plain: string): string {
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", machineKey(), iv);
    const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ENC_PREFIX + Buffer.concat([iv, tag, enc]).toString("base64");
  } catch {
    return plain; // best-effort: never block auth setup
  }
}

function decryptSecret(stored: string): string {
  try {
    if (!stored.startsWith(ENC_PREFIX)) return stored; // legacy plaintext
    const buf = Buffer.from(stored.slice(ENC_PREFIX.length), "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", machineKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    return ""; // tampered / wrong machine -> treat as not configured
  }
}

interface TotpConfig {
  secret: string;
  recoveryHashes: string[];
  sessionSecret: string;
  recoveryRevealed?: boolean;
  // Kept only transiently in memory between ensureConfig() and getSetupInfo()
  // so the plaintext recovery codes can be shown exactly once. Never persisted.
  _plainRecovery?: string[];
}

// ---------- low-level persistence ----------

function readConfig(): TotpConfig | null {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return null;
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.secret === "string") {
      // Decrypt the at-rest secret into the in-memory config (no-op for legacy plaintext).
      parsed.secret = decryptSecret(parsed.secret);
      // Transparently re-encrypt a legacy plaintext config on next write.
      if (parsed.secret) needsReencrypt = !String(JSON.parse(raw).secret).startsWith(ENC_PREFIX);
      return parsed as TotpConfig;
    }
    return null;
  } catch {
    return null;
  }
}

// Set when we load a legacy plaintext secret, so the next writeConfig upgrades it.
let needsReencrypt = false;

function writeConfig(cfg: TotpConfig): void {
  try {
    // Never persist the in-memory plaintext recovery cache; encrypt the secret at rest.
    const { _plainRecovery, ...rest } = cfg;
    const persistable = { ...rest, secret: rest.secret ? encryptSecret(rest.secret) : rest.secret };
    writeJsonAtomic(CONFIG_PATH, persistable);
    needsReencrypt = false;
  } catch {
    /* best-effort; do not throw */
  }
}

// In-memory copy so a freshly-generated config can surface plaintext recovery
// codes once even before any read-back, and to avoid repeated disk reads.
let cache: TotpConfig | null = null;

function loadConfig(): TotpConfig | null {
  if (cache) return cache;
  cache = readConfig();
  return cache;
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

// ---------- public API ----------

export function authRequired(): boolean {
  return process.env.VERIDIAN_AUTH === "totp";
}

export function isConfigured(): boolean {
  const cfg = loadConfig();
  return !!(cfg && cfg.secret);
}

export function ensureConfig(): void {
  try {
    let cfg = loadConfig();
    if (cfg && cfg.secret) {
      // Already configured. Backfill a sessionSecret if somehow missing, and
      // upgrade a legacy plaintext secret to encrypted-at-rest on first load.
      if (!cfg.sessionSecret) {
        cfg.sessionSecret =
          process.env.AUTH_SESSION_SECRET || crypto.randomBytes(32).toString("hex");
        writeConfig(cfg);
      } else if (needsReencrypt) {
        writeConfig(cfg); // re-persists with encryptSecret()
      }
      return;
    }

    const secret = process.env.TOTP_SECRET || authenticator.generateSecret();
    const sessionSecret =
      process.env.AUTH_SESSION_SECRET || crypto.randomBytes(32).toString("hex");

    // 8 single-use recovery codes; store only their sha256 hashes.
    const plainRecovery: string[] = [];
    for (let i = 0; i < 8; i++) {
      // 10 hex chars, grouped for readability: e.g. "3f9a2-c71b8"
      const raw = crypto.randomBytes(5).toString("hex");
      plainRecovery.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
    }
    const recoveryHashes = plainRecovery.map((c) => sha256(c));

    cfg = {
      secret,
      sessionSecret,
      recoveryHashes,
      recoveryRevealed: false,
      _plainRecovery: plainRecovery,
    };
    cache = cfg;
    writeConfig(cfg);
  } catch {
    /* never throw */
  }
}

export async function getSetupInfo(): Promise<{
  otpauthUri: string;
  qrDataUrl: string;
  recoveryCodes?: string[];
  secret: string;
}> {
  ensureConfig();
  const cfg = loadConfig();
  const secret = cfg?.secret || "";

  let otpauthUri = "";
  let qrDataUrl = "";
  try {
    otpauthUri = authenticator.keyuri("admin", "Veridian", secret);
    qrDataUrl = await QRCode.toDataURL(otpauthUri);
  } catch {
    /* leave blanks on failure */
  }

  // Reveal plaintext recovery codes exactly once.
  let recoveryCodes: string[] | undefined;
  if (cfg && !cfg.recoveryRevealed && cfg._plainRecovery && cfg._plainRecovery.length) {
    recoveryCodes = cfg._plainRecovery;
    cfg.recoveryRevealed = true;
    delete cfg._plainRecovery;
    writeConfig(cfg);
  }

  return { otpauthUri, qrDataUrl, recoveryCodes, secret };
}

export function verifyCode(code: string): boolean {
  try {
    const cfg = loadConfig();
    if (!cfg || !cfg.secret || !code) return false;
    return authenticator.verify({ token: String(code).trim(), secret: cfg.secret });
  } catch {
    return false;
  }
}

export function verifyRecovery(code: string): boolean {
  try {
    const cfg = loadConfig();
    if (!cfg || !code) return false;
    const h = sha256(String(code).trim());
    const idx = cfg.recoveryHashes.indexOf(h);
    if (idx === -1) return false;
    // One-time use: remove the matched hash and persist.
    cfg.recoveryHashes.splice(idx, 1);
    writeConfig(cfg);
    return true;
  } catch {
    return false;
  }
}

// ---------- stateless signed session tokens ----------

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function getSessionSecret(): string {
  ensureConfig();
  const cfg = loadConfig();
  return cfg?.sessionSecret || "";
}

function hmacHex(data: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

export function createSessionToken(): string {
  try {
    const secret = getSessionSecret();
    const payload = { exp: Date.now() + SEVEN_DAYS_MS };
    const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
    const sig = hmacHex(payloadB64, secret);
    return `${payloadB64}.${sig}`;
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
    const secret = getSessionSecret();
    const expected = hmacHex(payloadB64, secret);
    // Constant-time compare; lengths must match for timingSafeEqual.
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
    const payload = JSON.parse(Buffer.from(payloadB64, "base64").toString("utf8"));
    return typeof payload.exp === "number" && payload.exp > Date.now();
  } catch {
    return false;
  }
}
