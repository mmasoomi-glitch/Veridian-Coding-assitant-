# HANDOFF MEMORY — Veridian Program Control

Durable, pre-compaction memory. Update before any compaction / handoff / model switch /
release. Status words only: VERIFIED · IN PROGRESS · BLOCKED · UNVERIFIED · NOT FOUND ·
DEFERRED(reason). No secrets, no PII.

## Current mission
Build the Veridian Development Orchestrator + desktop control center + Android control
client, in controlled agent waves, reusing existing Veridian subsystems (vault, AI router,
sync/fleet, memory, atomic storage). Branch: `fix/veridian-pretest-release-gates`.

## Current priority
Wave 0 groundwork: control plane + 70-package board (this commit), then Definition Packs
for Wave 1 foundation writers (D05–D11, D21–D24, D36, D46, D47).

## Verified architecture (reuse — do NOT duplicate)
- VERIFIED Encrypted vault: `auth/vault.ts` + `lib/dpapi.ts` (DPAPI CurrentUser seal; AES
  machine fallback off-Windows). 25-check test passes. → use for all secret-at-rest.
- VERIFIED AI router/skill: `ai/providers.ts` (OpenRouter+Anthropic, HTTP-only) and the
  `veridian` OpenRouter Debug Skill at `~/.claude/skills/veridian/` (live). → Big LLM loop.
- VERIFIED Atomic storage: `lib/atomic.ts` writeJsonAtomic (all registries use this).
- VERIFIED Sync/cloud split: `autopilot/sync-*.ts` allowlist (F-004) → device/repo sync
  must reuse this; only non-sensitive metadata leaves a device.
- VERIFIED Auth/roles: passphrase+TOTP+DPAPI local; Google/TOTP cloud; admin/team
  (`auth/users.ts`, owner=afaqsubs@gmail.com permanent admin).
- VERIFIED Cross-device clipboard E2E: `lib/sync-crypto.ts` + `autopilot/clip-sync-store.ts`.

## Active branches / worktrees
- `fix/veridian-pretest-release-gates` @ clean (0/0 vs origin). Single worktree.
- Per-package writer branches/worktrees: see AGENT_OWNERSHIP.md (created at dispatch).

## Active agents / ownership
- This session = release commander + DESK track. Android (AND) track = separate CLI B.
- No writers dispatched yet (Wave 0 = control plane + definition).

## Runtime / test state
- tsc: clean. Suites green: dpapi, auth-vault(25), google-auth(13), admin-users(21),
  clip-sync(17), sync-sanitize(15), context-sanitizer(17), atomic, ai-provider(3).

## Current incidents
- None.

## Rollback references
- Last good commit before orchestrator: `444b1bd` (owner/team). Branch pushed to origin.

## Completed work (this program)
- IN PROGRESS D01 program-control bootstrap (this commit). VERIFIED D03 vault, D41 skill located.

## Exact blockers
- None blocking Wave 0. External (owner): Google Client ID for cloud; OpenRouter privacy
  toggle for owl-alpha. Structural: Android track needs a 2nd Claude Code CLI (see DECISIONS).

## Next three actions
1. Commit control plane + board; push.
2. Create Wave-1 Definition Packs (D05/D06/D07/D08/D21/D24/D46) via the prevention-first loop.
3. Dispatch Wave-0 read-only scouts (repo inventory, git risk, keystroke diagnosis, flag-gate points).
