// D11 — Secret-REFERENCE registry. METADATA ONLY, NEVER secret values.
//
// This registry tracks *that a secret exists* and *where it came from* — its id,
// human name, kind, scope, provenance, and usage timestamps. It deliberately has
// NO place to store the secret itself. addRef() actively REFUSES any metadata field
// that looks like a real credential (see looksLikeSecret) and strips any stray
// `value`-style field, so a value can never leak into secret-references.json even by
// caller mistake. Mirrors the AI-evidence ledger rule: "metadata + hash only, never
// raw values" (docs/program-control/ai-evidence/README.md).
//
// Persistence is atomic (tmp + fsync + rename) via ../lib/atomic, matching the rest
// of the orchestrator's flat-file state.

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { writeJsonAtomic } from "../lib/atomic";

export type SecretKind =
  | "openrouter-key"
  | "google-client"
  | "totp"
  | "ssh"
  | "webhook"
  | "other";

export type SecretScope =
  | "global"
  | "project"
  | "service"
  | "infrastructure"
  | "deployment"
  | "temporary";

export interface SecretRef {
  id: string;
  name: string;
  kind: SecretKind;
  scope: SecretScope;
  provenance: string; // e.g. "Desktop\\env\\.env" — a LOCATION, never the value
  firstSeen: string;  // ISO
  lastUsed?: string;  // ISO
  repo?: string;
}

/** Metadata accepted by addRef — never includes id/firstSeen (generated) or any value. */
export type SecretRefInput = Omit<SecretRef, "id" | "firstSeen" | "lastUsed">;

const FILE_PATH = path.join(process.cwd(), "secret-references.json");

// Fields that are NEVER persisted — even if a caller passes them in, they're dropped.
const FORBIDDEN_FIELDS = new Set([
  "value",
  "secret",
  "token",
  "key",
  "password",
  "pass",
  "credential",
  "privateKey",
  "private_key",
  "apiKey",
  "api_key",
]);

/**
 * Heuristic: does this string look like an ACTUAL secret value (not metadata)?
 * Used to reject metadata that accidentally (or maliciously) carries a credential.
 */
export function looksLikeSecret(s: unknown): boolean {
  if (typeof s !== "string") return false;
  const v = s.trim();
  if (!v) return false;

  // PEM / OpenSSH private key blocks (multiline) — R04 fix.
  if (/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(v)) return true;
  // Connection strings / assignments carrying a password — R04 fix.
  if (/(password|passwd|pwd)\s*[:=]\s*\S{4,}/i.test(v)) return true;
  // URI with embedded credentials:  scheme://user:pass@host — R04 fix.
  if (/[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s:@/]+@/i.test(v)) return true;
  // OpenAI / OpenRouter keys: sk-..., sk-or-v1-...
  if (/\bsk-(or-v1-)?[A-Za-z0-9_-]{16,}/.test(v)) return true;
  // Anthropic keys
  if (/\bsk-ant-[A-Za-z0-9_-]{16,}/.test(v)) return true;
  // AWS access key id: AKIA + 16 uppercase/digits
  if (/\bAKIA[A-Z0-9]{16}\b/.test(v)) return true;
  // GitHub tokens: ghp_, gho_, ghs_, ghr_, github_pat_
  if (/\b(gh[opsru]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/.test(v)) return true;
  // Google OAuth client secret / API key
  if (/\bGOCSPX-[A-Za-z0-9_-]{10,}/.test(v)) return true;
  if (/\bAIza[A-Za-z0-9_-]{20,}/.test(v)) return true;
  // Slack tokens
  if (/\bxox[baprs]-[A-Za-z0-9-]{10,}/.test(v)) return true;
  // Stripe live/test secret keys
  if (/\bsk_(live|test)_[A-Za-z0-9]{16,}/.test(v)) return true;
  // JWT: eyJ... with two dots (header.payload.signature)
  if (/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(v)) return true;
  // Long high-entropy token (>=32 from the base64/secret alphabet, incl. '/') — a value,
  // not a name/path. Checked against a single contiguous run so an AWS secret containing
  // '/' is still caught (R04 fix: do not let a stray slash mark it as a "path").
  if (/[A-Za-z0-9+/=_-]{32,}/.test(v) && !looksLikePath(v)) return true;
  // Long hex blob (>=32) — keys, hashes used as live secrets
  if (/\b[a-fA-F0-9]{32,}\b/.test(v)) return true;

  // Newline-split evasion (R04b CRITICAL): a value broken across lines (e.g. an SSH/AWS
  // key with embedded \n) defeats the contiguous-run checks above. Re-test with newlines
  // removed. Spaces are NOT removed, so ordinary multi-line prose (space-separated short
  // words) still has no 32-char contiguous run and is not flagged.
  const joined = v.replace(/[\r\n]+/g, "");
  if (joined !== v) {
    if (/[A-Za-z0-9+/=_-]{32,}/.test(joined) && !looksLikePath(joined)) return true;
    if (/\b[a-fA-F0-9]{32,}\b/.test(joined)) return true;
  }

  return false;
}

// A real filesystem path is legitimate provenance, not a secret. NARROW on purpose
// (R04 fix): a mere embedded "/" no longer counts — only a genuine path shape does, so a
// high-entropy secret that happens to contain "/" is NOT excused as a path.
function looksLikePath(v: string): boolean {
  return (
    /\.(env|json|ya?ml|txt|cfg|conf|ini|toml|md|pem|key|ppk|pub)$/i.test(v) || // known file extension
    /^[A-Za-z]:[\\/]/.test(v) ||                                                // Windows drive path
    /^(\.{0,2}[\\/]|~[\\/])/.test(v)                                            // ./  ../  /  ~/ start
  );
}

/** Throw if any string field of `meta` carries something that looks like a real secret. */
function assertNoSecretValues(meta: Record<string, unknown>): void {
  for (const [field, value] of Object.entries(meta)) {
    if (typeof value === "string" && looksLikeSecret(value)) {
      throw new Error(
        `D11 secret-reference-registry: refusing to store metadata field "${field}" — it looks like an actual secret value, not a reference.`,
      );
    }
  }
}

function readRefs(): SecretRef[] {
  try {
    if (!fs.existsSync(FILE_PATH)) return [];
    const data = JSON.parse(fs.readFileSync(FILE_PATH, "utf8"));
    return Array.isArray(data) ? (data as SecretRef[]) : [];
  } catch {
    return []; // corrupt/unreadable ⇒ behave as empty, never throw on read
  }
}

function writeRefs(refs: SecretRef[]): void {
  writeJsonAtomic(FILE_PATH, refs);
}

/** All references (metadata only). */
export function listRefs(): SecretRef[] {
  return readRefs();
}

/**
 * Add a reference. Generates id + firstSeen. Strips any forbidden value-bearing field,
 * then refuses (throws) if any remaining metadata field looks like a real secret.
 */
export function addRef(meta: SecretRefInput): SecretRef {
  // 1. Strip any field that could carry a value (defense in depth — never persisted).
  const cleaned: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(meta as Record<string, unknown>)) {
    if (FORBIDDEN_FIELDS.has(k)) continue;
    cleaned[k] = val;
  }

  // 2. Reject if any surviving field still looks like a secret value.
  assertNoSecretValues(cleaned);

  // 3. Build the canonical record from known metadata fields ONLY.
  const ref: SecretRef = {
    id: randomUUID(),
    name: String(cleaned.name ?? ""),
    kind: (cleaned.kind as SecretKind) ?? "other",
    scope: (cleaned.scope as SecretScope) ?? "temporary",
    provenance: String(cleaned.provenance ?? ""),
    firstSeen: new Date().toISOString(),
  };
  if (typeof cleaned.repo === "string" && cleaned.repo) ref.repo = cleaned.repo;

  const refs = readRefs();
  refs.push(ref);
  writeRefs(refs);
  return ref;
}

/** Remove a reference by id. Returns true if one was removed. */
export function removeRef(id: string): boolean {
  const refs = readRefs();
  const next = refs.filter((r) => r.id !== id);
  if (next.length === refs.length) return false;
  writeRefs(next);
  return true;
}

/** Stamp lastUsed=now for a reference. Returns the updated ref, or null if not found. */
export function markUsed(id: string): SecretRef | null {
  const refs = readRefs();
  const ref = refs.find((r) => r.id === id);
  if (!ref) return null;
  ref.lastUsed = new Date().toISOString();
  writeRefs(refs);
  return ref;
}
