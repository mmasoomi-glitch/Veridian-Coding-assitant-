// A03 — Encrypted local storage + offline-cache policy (interface + policy).
// Implemented on-device with the platform secure store (Android Keystore via Capacitor
// Secure Storage). NEVER cache secrets, vault contents, OTPs, or PII — only non-sensitive
// view data (repo/branch/risk summaries, last-seen timestamps, user prefs).

export interface SecureStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

// What may be cached offline (allowlist — mirrors the F-004 philosophy on the client).
export const OFFLINE_CACHEABLE = [
  "device.descriptor",      // non-secret device id + label
  "view.repos",             // repo/branch/risk summaries (no paths)
  "view.health",            // health snapshot
  "prefs.voice",            // mute/verbosity prefs
  "prefs.dnd"
] as const;

// Hard deny — never persisted on the client, even encrypted.
export const NEVER_CACHE = ["session.cookie.raw", "any secret value", "vault payload", "otp", "pii", "payment"];

export interface CachePolicy {
  ttlMs: number;            // how long view cache is considered fresh offline
  showStaleWithBadge: boolean; // show stale data with an "offline / stale" badge (truthful)
}
export const DEFAULT_CACHE_POLICY: CachePolicy = { ttlMs: 5 * 60 * 1000, showStaleWithBadge: true };
