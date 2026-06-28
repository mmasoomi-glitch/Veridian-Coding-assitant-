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

## SCOPE (effective 2026-06-29) — VERIDIAN ONLY
In scope: `C:\Users\HI\veridian`, its git remote(s), its registered worktrees, repos
added via Settings. Everything else OUT OF SCOPE — no scan/commit/push/rescue/incident.
Whole-disk scanning DISABLED by default. Active Veridian incident count: **0**.

## Session agents released
4 Wave-0 scout agents (reuse-map, git-risk, keystroke-diagnosis, tailscale) — all
COMPLETED and released; none running. Stray scout scripts removed (commit f00b2e8).
No unrelated user apps/services/containers/CLIs touched.

## Current incidents
- None active (Veridian). Prior cross-repo findings reclassified OUT_OF_SCOPE in INCIDENT_LOG.

## Wave-0 findings (VERIFIED, 2026-06-28)
- D02 reuse map: feature-flags = NOT FOUND (build `autopilot/flags-store.ts` + `/api/flags`); all other pillars have reuse targets (vault, ai/providers, lib/atomic, sync-store, auth/users, telemetry poller, TabbedApp tab pattern, server route pattern). Control Center tab + `/api/orch/*` insertion points identified.
- D21/D24/D25: 14 repos across roots; 2 CRITICAL, 5 MEDIUM, 7 LOW (see incidents). git-scan approach proven with read-only commands.
- Keystroke: ROOT CAUSE = `GetAsyncKeyState()` returns 0 in the detached/hidden spawned PowerShell (no input-desktop context) → buffer always empty → log never written → UI shows idle. Fix needs a real user-session keyboard hook; **policy conflict with spec §13 (no covert capture)** — keep consent-based + visible or DEFER. Owner decision pending.
- D29/D30 Tailscale: CLI present v1.98.4; `status --json` mapped; collector `telemetry/tailscale-scan.ps1` contract drafted (emit name/os/online/lastSeen only — drop IPs/paths per F-004); join via getGitStats (already exists). VERIFIED path.

## Rollback references
- Last good commit before orchestrator: `444b1bd` (owner/team). Branch pushed to origin.

## Truthful package status (no padding)
- D01 program-control: IMPLEMENTED (docs).
- D03 vault: VERIFIED (capability + 25-check test, pre-existing).
- D06 flags, D21 repo-registry, D24 risk, D46 health, D47 Control Center UI:
  **IMPLEMENTED — LOCAL TESTED** (tsc clean + unit tests). NOT runtime-verified end-to-end,
  NOT independently reviewed, NOT integrated to main, NOT deployed/production-tested.
  Pushed to feature branch `fix/veridian-pretest-release-gates` only.
- A01–A05 Android: **SCAFFOLDED / UNVERIFIED** (no Android build/run; CLI B not active).
- Big-LLM evidence exists ONLY for D24 (docs/program-control/ai-evidence/D24). Earlier
  desktop modules were author-written, not skill-drafted — do not claim otherwise.

## Exact blockers
- None blocking Wave 0. External (owner): Google Client ID for cloud; OpenRouter privacy
  toggle for owl-alpha. Structural: Android track needs a 2nd Claude Code CLI (see DECISIONS).

## Wave 2 — VERIFICATION CLOSED (2026-06-29)
12 review agents ran (R01–R12). Verdict by package:
- D01,D03,D05,D06,D08,D21,D22,D23,D24,D46 = LOCAL TESTED + INDEPENDENTLY REVIEWED (APPROVE).
- D29/D30 = APPROVE (low: add runtime ps1 output test).
- D47 = endpoints RUNTIME VERIFIED (health 200/flags 200/admin 403 on :3941); React UI
  NOT browser-verified (needs admin session in a browser — owner-gated). Label: LOCAL TESTED + API-RUNTIME-VERIFIED.
- **D07** REJECT→REPAIRED→RE-REVIEWED CLOSED (R02b): owner-checked `release(id,owner?)`.
  R02's 'backslash CRITICAL' was a FALSE POSITIVE (regex correct, proven by test).
- **D11** REJECT→REPAIRED→RE-REVIEWED→2nd CRITICAL(newline-split)→REPAIRED CLOSED (R04b):
  looksLikeSecret now catches PEM/AWS-slash/conn-string/uri-creds + newline-split; paths still pass.
- Big-LLM evidence genuine for all (R11); D07+D11 have real qwen critiques/corrections
  (raw output kept local & git-ignored; manifest+hash committed).
- Test quality (R10): suites are happy-path-heavy → negative tests added for D07/D11; other
  modules' deeper negative tests are a recorded follow-up (LOW/MED), not Wave-2 blockers.
Commits: c6e54f1, 44ffdf8, 5c101d3, c839fe9, 9b9660c, 4936178 (all pushed).
Git-hygiene slip this wave: a `git add -A` swept reviewer scratch into one commit; removed
in 4936178 + root-scratch now git-ignored. No secrets ever committed (push-protection + sweeps).
Keystroke: DEFERRED per §13 (untouched). No Wave-2 BLOCKER/CRITICAL remain open → Wave 3 unblocked.
