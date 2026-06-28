# Decisions Log — Veridian Program Control

Append-only. Each: date · decision · why · alternatives.

## 2026-06-28
- **One session, not two literal CLIs.** This Claude Code session runs the DESK track +
  control plane. The Android (AND) track is a *separate Claude Code CLI* the owner opens
  pointed at this same repo/control-plane. All 70 packages are registered now; AND packages
  are dispatched when CLI B is opened (or sequenced by DESK if the owner prefers a single
  session). *Why:* a single session can't fork into two independent CLIs; the shared
  control-plane files are the coordination substrate either way.
- **Agent concurrency ≤ ~10 per wave, not 70 simultaneous writers.** *Why:* the tool caps
  concurrency and 70 concurrent writers on one repo = merge conflicts + drift + uncommitted
  loss — the exact failure the spec forbids. Model: many concurrent read/review agents +
  exclusive writers + commit gates between waves.
- **Reuse, do not duplicate.** Vault = `auth/vault.ts`/`lib/dpapi.ts` (VERIFIED) — no new
  vault. AI router/skill = `ai/providers.ts` + `~/.claude/skills/veridian` (VERIFIED) — no
  second router. Storage = `lib/atomic.ts`. Sync allowlist = `autopilot/sync-sanitize.ts`.
  Memory = `~/.claude/.../memory` + new context ledger. *Why:* spec §2 forbids duplicates.
- **Registry storage = atomic JSON now; SQLite deferred.** *Why:* native better-sqlite3
  build risk on Windows; atomic writes already remove the corruption vector. Revisit if
  volume demands. (DEFERRED: SQLite migration.)
- **Secret registry = reference/metadata ONLY.** Values stay in the DPAPI vault; the
  registry stores name/type/provenance/first-seen/last-used/repo — never the value. *Why:*
  spec §6 + the project's hard privacy stance.
- **No keystroke/covert capture in the orchestrator.** Spec §13 forbids it. The existing
  keystroke recorder is consent-based + local-only; the "fix keystroke recorder" task stays
  within explicit, visible, configurable, metadata-restricted telemetry.
- **Big LLM (OpenRouter skill) is advisory only.** It may propose code/critique; it may
  never deploy, touch the vault, rotate creds, run destructive git, or message customers
  (spec §5). All requests recorded redacted under `docs/program-control/ai-evidence/<task>/`.
- **Provider not hardcoded.** Router supports default/fallback/local-only/per-task/budget/
  killswitch; provider chosen via Settings after verification (spec §14).
