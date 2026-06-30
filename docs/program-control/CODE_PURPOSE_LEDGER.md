# CODE PURPOSE LEDGER (from controlled read-only audit 2026-06-30)

Labels: CONFIRMED / INFERRED / UNKNOWN / CONTRADICTED / STALE / SIMULATED / NOT FOUND.

## Backend / runtime (CONFIRMED unless noted)
| Module | Label | Purpose | Risk if wrong |
|--------|-------|---------|---------------|
| server.ts | CONFIRMED | Express API + telemetry poller; 40+ routes; TOTP gate | downtime = blackout; auth bypass |
| telemetry/collect.ps1 | CONFIRMED | Real Win telemetry; honest "unknown", never fakes | bad JSON → parse fail |
| telemetry/persist.ts | CONFIRMED | rolling live-telemetry session (cap 60 timeline) | lost context |
| telemetry/watcher.ts | CONFIRMED | "waiting on you" from sessions.json + fleet-progress.json | — |
| autopilot/desktop-briefs.ts | CONFIRMED | per-desktop wasDoing/nextStep store | context amnesia |
| autopilot/fleet.ts | SIMULATED (intentional) | ASSESS plan-only; BUILD/FULL refuse w/ explanation | if re-enabled w/o safe exec → file corruption |
| ai/providers.ts | CONFIRMED | OpenRouter/Anthropic HTTP, honest-disabled, no fake LLM | — |
| orchestrator/* (D05/07/11/21-24/29) | CONFIRMED | flags, repo risk, settings, locks, secret-ref, branch/worktree, devices | scope/secret risk (guarded+tested) |
| auth/vault.ts + totp.ts | CONFIRMED | DPAPI-sealed 2FA; honest fail | recovery via re-setup |
| src/components/FocusNow.tsx + focus-summary.ts | CONFIRMED | MC01 Home; real telemetry+waiting; no secret/path leak | — |

## ⚠️ TRUTH FINDINGS (must address)
- **STALE:** CLAUDE.md still implies the DeepSeek gateway is primary — superseded by cohere/north-mini-code:free (MODEL_EXECUTION_POLICY updated; CLAUDE.md to follow).
- **AI provider likely UNCONFIGURED** locally (no ANTHROPIC_BASE_URL) → /api/ai/summarize + desktop-brief generation disabled; honest fallback shown.
- **SIMULATED / UNMARKED FAKE DATA in src/components/ApkCompanion.tsx** (phone preview): hardcoded time "12:57 PM", always-full battery/signal/wifi, hardcoded push alerts, default "45 min late" slider. Labeled "Simulated APK Companion" but contains UNFLAGGED fake values → MISLEADING. → move to Developer Lab (VC08) or remove.
- **App.tsx HUD**: hardcoded hostname fallback "Coordinates pinned"; "Generating live AI recall…" placeholder. RAM/CPU/UPTIME honestly show "…" when /api/stats unreachable (that's why the phone showed unknowns: backend not reachable, NOT pure simulator).
- **Dead code:** loadScenario(1/2/3) demo presets present but unreachable from UI.

## Key truth: a real "where-was-I / current context" can be built TODAY from EXISTING data
(no new collectors): /api/telemetry/current (currentState+timeline), desktop-briefs.json,
/api/waiting, /api/orch/risk + getGitStats, workspace-sessions.json recent timeline. The only
gap for AI-brief text is provider config. → grounds VC02 (see definition-packs/VC02.md).
