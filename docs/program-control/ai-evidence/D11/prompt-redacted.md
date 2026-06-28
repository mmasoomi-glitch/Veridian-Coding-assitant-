Return ONLY TypeScript, no prose, no code fences. Write a Node/TypeScript module for "D11 — secret-REFERENCE registry". It stores METADATA ONLY about secrets, NEVER the secret values themselves.

Requirements:
- Atomically persist to "secret-references.json" in process.cwd() using: import { writeJsonAtomic } from "../lib/atomic";  (signature: writeJsonAtomic(file: string, data: unknown): void)
- Use node:fs and node:path.
- A reference type:
  export type SecretKind = "openrouter-key" | "google-client" | "totp" | "ssh" | "webhook" | "other";
  export type SecretScope = "global" | "project" | "service" | "infrastructure" | "deployment" | "temporary";
  export interface SecretRef { id: string; name: string; kind: SecretKind; scope: SecretScope; provenance: string; firstSeen: string; lastUsed?: string; repo?: string; }
- API: listRefs(): SecretRef[]; addRef(meta): SecretRef; removeRef(id: string): boolean; markUsed(id: string): SecretRef | null;
- addRef takes metadata WITHOUT id/firstSeen (generate those: id via crypto.randomUUID, firstSeen via new Date().toISOString()). It must ignore/strip any "value" field if present.
- CRITICAL guard: export function looksLikeSecret(s: string): boolean — returns true if the string looks like a real secret value. Detect: OpenAI/OpenRouter keys (sk-..., sk-or-v1-...), AWS access keys (AKIA followed by 16 uppercase/digits), GitHub tokens (ghp_...), Google OAuth client secrets (GOCSPX-...), JWTs (eyJ... with two dots), and long base64/hex strings of length >= 32.
- addRef MUST scan EVERY string metadata field (name, kind, scope, provenance, repo) with looksLikeSecret and THROW an Error("refusing to store value that looks like a secret") if any field matches. Never store a value field.
- markUsed sets lastUsed to new Date().toISOString() and persists; returns the updated ref or null if not found.
- All mutations persist atomically. listRefs reads the file (return [] if missing/corrupt).
- Keep it small, total, defensive. No external deps beyond node builtins + ../lib/atomic.

REDACTION: This prompt contains NO secret values, NO env contents, NO private paths, NO PII. Only type/spec text.
