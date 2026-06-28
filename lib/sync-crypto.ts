// End-to-end encryption for cross-device sync (clipboard / inter-device memory).
//
// The central command server aggregates data from the owner's several machines so
// any device can see/restore what was copied on another. To keep tonight's privacy
// posture intact, the central box must NEVER see plaintext clipboard. So the
// payload is encrypted on the source device with a key that ONLY the owner's
// devices hold (VERIDIAN_SYNC_KEY, the same value set on each machine). The central
// server stores opaque ciphertext it cannot read; only a device with the key can
// decrypt on pull.
//
// AES-256-GCM (authenticated): tampering or a wrong key fails closed (decrypt
// returns null). Key is derived from the shared passphrase via scrypt with a fixed
// app salt. If VERIDIAN_SYNC_KEY is unset, the whole cross-device feature is OFF
// (encrypt/decrypt no-op to null), so the default stays "everything local".

import crypto from "node:crypto";

const BLOB_PREFIX = "e2e:v1:";
const SALT = "veridian-clip-sync:v1"; // fixed app salt; the secret is the passphrase

let cachedKey: Buffer | null = null;
let cachedFrom = "";

function passphrase(): string {
  return process.env.VERIDIAN_SYNC_KEY || "";
}

/** True when a shared sync key is configured (cross-device sync is enabled). */
export function syncCryptoReady(): boolean {
  return passphrase().length > 0;
}

function key(): Buffer | null {
  const pass = passphrase();
  if (!pass) return null;
  if (cachedKey && cachedFrom === pass) return cachedKey;
  // scryptSync is deterministic for a given (pass, salt) so every device with the
  // same VERIDIAN_SYNC_KEY derives the identical key and can decrypt each other.
  cachedKey = crypto.scryptSync(pass, SALT, 32);
  cachedFrom = pass;
  return cachedKey;
}

/** Encrypt a plaintext string to an opaque transport blob, or null if no key. */
export function encryptToBlob(plain: string): string | null {
  const k = key();
  if (k == null) return null;
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", k, iv);
    const ct = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return BLOB_PREFIX + Buffer.concat([iv, tag, ct]).toString("base64");
  } catch {
    return null;
  }
}

/** Decrypt a transport blob back to plaintext, or null on any failure/wrong key. */
export function decryptBlob(blob: string): string | null {
  const k = key();
  if (k == null || typeof blob !== "string" || !blob.startsWith(BLOB_PREFIX)) return null;
  try {
    const buf = Buffer.from(blob.slice(BLOB_PREFIX.length), "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", k, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
