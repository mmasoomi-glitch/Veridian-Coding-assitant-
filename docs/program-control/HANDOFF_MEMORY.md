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

## Current incidents (Wave-0 git scan, 14 repos)
- INC-001 CRITICAL: mira-vpn uncommitted new project (0 commits, no remote).
- INC-002 CRITICAL: PC2GSM 2 unpushed local commits, no upstream.
- INC-003/004 MEDIUM: AFAQ10 stale+20 prunable worktrees; vualet-web/calc-proxy dirty; Vualet behind 11; scws 1.5y stale.

## Wave-0 findings (VERIFIED, 2026-06-28)
- D02 reuse map: feature-flags = NOT FOUND (build `autopilot/flags-store.ts` + `/api/flags`); all other pillars have reuse targets (vault, ai/providers, lib/atomic, sync-store, auth/users, telemetry poller, TabbedApp tab pattern, server route pattern). Control Center tab + `/api/orch/*` insertion points identified.
- D21/D24/D25: 14 repos across roots; 2 CRITICAL, 5 MEDIUM, 7 LOW (see incidents). git-scan approach proven with read-only commands.
- Keystroke: ROOT CAUSE = `GetAsyncKeyState()` returns 0 in the detached/hidden spawned PowerShell (no input-desktop context) → buffer always empty → log never written → UI shows idle. Fix needs a real user-session keyboard hook; **policy conflict with spec §13 (no covert capture)** — keep consent-based + visible or DEFER. Owner decision pending.
- D29/D30 Tailscale: CLI present v1.98.4; `status --json` mapped; collector `telemetry/tailscale-scan.ps1` contract drafted (emit name/os/online/lastSeen only — drop IPs/paths per F-004); join via getGitStats (already exists). VERIFIED path.

## Rollback references
- Last good commit before orchestrator: `444b1bd` (owner/team). Branch pushed to origin.

## Completed work (this program)
- IN PROGRESS D01 program-control bootstrap (this commit). VERIFIED D03 vault, D41 skill located.

## Exact blockers
- None blocking Wave 0. External (owner): Google Client ID for cloud; OpenRouter privacy
  toggle for owl-alpha. Structural: Android track needs a 2nd Claude Code CLI (see DECISIONS).

## Next three actions
1. Wave-1 Definition Packs (D06 feature-flags, D21 repo-registry, D24 risk-scanner, D46 control-center API) via prevention-first OpenRouter loop, then exclusive-writer build.
2. Build D06+D21+D24 (foundation writers) + a first /api/orch endpoint; commit per unit; publish contracts in INTERFACE_CONTRACTS.
3. Owner decisions: (a) proceed to Wave-1 writers now? (b) keystroke — fix consent-based or DEFER per §13? (c) Android via 2nd CLI or sequence here?
