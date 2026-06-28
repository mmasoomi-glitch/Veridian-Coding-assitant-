// Google Sign-In verification for the CLOUD dashboard (pr.afaq24.store).
//
// The browser/native client obtains a Google ID token (JWT); we verify it
// server-side: RS256 signature against Google's published JWKS, then the claims
// (issuer, audience, expiry, email_verified) and an email allowlist. No client
// secret needed (public-client / ID-token flow), no heavy dependency — Node's
// crypto verifies the JWT directly.
//
// MULTI-PLATFORM: `allowedAudiences()` is a LIST. The Web client ID lives in
// GOOGLE_AUTH_CLIENT; future Android / iOS / Linux clients each get their own
// client ID — just append them (comma-separated) to GOOGLE_AUTH_CLIENTS and the
// same endpoint accepts their tokens. No code change.

import crypto from "node:crypto";
import { isAllowed, roleFor, type Role } from "./users";

const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const JWKS_TTL_MS = 60 * 60 * 1000;

let jwksCache: { keys: any[] } | null = null;
let jwksFetchedAt = 0;
let testJwks: { keys: any[] } | null = null; // injectable for tests (no network)

/** Test hook: inject a JWKS so verifyIdToken can be exercised without network. */
export function __setTestJwks(j: { keys: any[] } | null): void {
  testJwks = j;
}

export function allowedAudiences(): string[] {
  const raw = [process.env.GOOGLE_AUTH_CLIENT, process.env.GOOGLE_AUTH_CLIENTS]
    .filter(Boolean)
    .join(",");
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return Array.from(new Set(list));
}

export function googleConfigured(): boolean {
  return allowedAudiences().length > 0;
}

export function googleClientId(): string {
  return allowedAudiences()[0] || "";
}

export function allowedEmails(): string[] {
  return (process.env.VERIDIAN_GOOGLE_ALLOWED_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function b64urlToBuf(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
function b64urlToJson(s: string): any {
  return JSON.parse(b64urlToBuf(s).toString("utf8"));
}

async function getJwks(): Promise<{ keys: any[] }> {
  if (testJwks) return testJwks;
  const now = Date.now();
  if (jwksCache && now - jwksFetchedAt < JWKS_TTL_MS) return jwksCache;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`jwks http ${res.status}`);
  jwksCache = (await res.json()) as { keys: any[] };
  jwksFetchedAt = now;
  return jwksCache;
}

export interface GoogleResult {
  ok: boolean;
  email?: string;
  role?: Role;
  error?: string;
}

/** Verify a Google ID token end-to-end. Returns the verified email on success. */
export async function verifyIdToken(idToken: string): Promise<GoogleResult> {
  try {
    if (!googleConfigured()) return { ok: false, error: "google not configured" };
    if (!idToken || typeof idToken !== "string") return { ok: false, error: "missing token" };
    const parts = idToken.split(".");
    if (parts.length !== 3) return { ok: false, error: "malformed token" };

    const header = b64urlToJson(parts[0]);
    if (header.alg !== "RS256") return { ok: false, error: "unexpected alg" };

    const jwks = await getJwks();
    const jwk = (jwks.keys || []).find((k) => k.kid === header.kid);
    if (!jwk) return { ok: false, error: "unknown key id" };

    const pub = crypto.createPublicKey({ key: jwk, format: "jwk" });
    const signed = Buffer.from(parts[0] + "." + parts[1]);
    const sigOk = crypto.verify("RSA-SHA256", signed, pub, b64urlToBuf(parts[2]));
    if (!sigOk) return { ok: false, error: "bad signature" };

    const p = b64urlToJson(parts[1]);
    const iss = String(p.iss || "");
    if (iss !== "accounts.google.com" && iss !== "https://accounts.google.com") return { ok: false, error: "bad issuer" };
    if (!allowedAudiences().includes(String(p.aud))) return { ok: false, error: "audience mismatch" };
    if (typeof p.exp !== "number" || p.exp * 1000 <= Date.now()) return { ok: false, error: "expired" };
    if (p.email_verified !== true && p.email_verified !== "true") return { ok: false, error: "email not verified" };

    const email = String(p.email || "").toLowerCase();
    // The admin-managed allowlist is the source of truth for who may sign in.
    // (It is seeded from VERIDIAN_GOOGLE_ALLOWED_EMAILS on first run.)
    if (!isAllowed(email)) return { ok: false, error: "email not allowed" };

    return { ok: true, email, role: roleFor(email) || "user" };
  } catch {
    return { ok: false, error: "verify failed" };
  }
}
