# Remediation status — pre-test release gates

Snapshot of the security/architecture/durability gates from the 10-agent audit
(verdict was REJECT). Each item below is implemented, type-checks clean
(`npx tsc --noEmit` → 0), and has a targeted test where applicable.

## Closed

| Gate | What it was | Fix | Verified by |
|------|-------------|-----|-------------|
| **F-002** | Fail-open auth + `0.0.0.0` bind — every `/api/*` reachable unauthenticated on the LAN | Bind `127.0.0.1` by default; fail-CLOSED (require TOTP session) whenever bind is non-loopback or `VERIDIAN_AUTH=totp`; loopback dev bypass only with `VERIDIAN_LOCAL_DEV=1` | exposed→401, loopback→200; tsc |
| **F-012** | AI-Ask sent raw local context (clipboard/commands/paths/URLs) to the LLM | New `ai/context-sanitizer.ts` `sanitizeContextForLLM()` scrubs keys/tokens/JWT/PEM/Bearer/assignments/Windows-paths and **strips URL query strings**; wired into `ai-ask.ts` before every `chatJSON` | `tests/context-sanitizer.test.ts` (17 checks) |
| **F-003 / F-029** | Raw secrets persisted at rest (clipboard files, TOTP secret, terminal commands) | Clipboard: secrets never written to disk (ephemeral in-memory cache for in-session restore); `clip-counts.json` keyed by one-way hash, not raw value. Terminal commands redacted before timeline persist. TOTP secret encrypted at rest (AES-256-GCM, machine-bound key); legacy plaintext auto-upgraded; recovery codes stay hashed | `tests/clip-secret-at-rest.test.ts`; tsc |
| **F-004** | Sync could push raw clipboard/paths/commands/URLs to the central/cloud box | New `autopilot/sync-sanitize.ts` allowlist; outbound push sanitized in `sync-client.ts`; central `sync-store.ts` re-sanitizes on receipt (defense in depth) and logs dropped sensitive fields | `tests/sync-sanitize.test.ts` (15 checks) |
| **F-013 / F-014 / F-015** | Flat-JSON writes truncate-in-place → corruption on crash mid-write | New `lib/atomic.ts` `writeJsonAtomic()` (tmp + fsync + atomic rename); applied to all 19 persistence write sites | `tests/atomic.test.ts`; tsc |

## Follow-up (not blocking, documented)

- **Full SQLite/WAL migration** — the atomic-write helper removes the corruption
  vector without a native dependency. A `better-sqlite3` migration (concurrency,
  indexed queries) remains the longer-term durability story; see the storage
  inventory + phased plan produced during scoping. Deferred because the native
  Windows build is risky to run unattended.
- **Screenshot OCR / notebook entries** into AI-Ask: currently pass through the
  F-012 sanitizer like everything else; an explicit per-source opt-in could be
  added if OCR is ever auto-populated.

## Model fix-loop note
F-002 and the F-012 draft were run through the cheap-model loop
(`deepseek/deepseek-chat`). For F-012 the cheap draft had a real URL-query leak
(used `$&`, re-emitting the token) and over-rigid key-length anchors, so it was
escalated to Opus authorship. See `MODEL-SCORECARD.md`. Owl Alpha (free stealth
model) is blocked by the account's OpenRouter privacy policy until prompt-logging
is enabled — left to the owner.
