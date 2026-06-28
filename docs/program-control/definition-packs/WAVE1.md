# Wave-1 Definition Packs (D06, D21, D24, D46, D47)

Scope reminder: **Veridian repo + its registered worktrees only.** No whole-disk scans.

## D06 — Feature flags + policy resolution
- Owner DESK-w1 · branch fix/veridian-pretest-release-gates · files: `autopilot/flags-store.ts` (new), `server.ts` (/api/flags). Forbidden: auth/*, vault.
- Outcome: admin toggles subsystems on/off; code checks `isEnabled(id)`.
- Reuse: `lib/atomic.ts`, `requireAdmin`. Data: `feature-flags.json` (git-ignored). Security: admin-gated writes; no secrets. Egress: none.
- Tests: default-on flags, set/get, unknown flag default, persistence. Rollback: delete file → defaults. Reviewer: commander. Deps: none.

## D21 — Veridian-only repository registry
- Owner DESK-w2 · files: `orchestrator/repo-registry.ts` (new), `server.ts` (/api/orch/repos). Forbidden: other repos, disk walk.
- Outcome: list of THIS repo + its worktrees with branch/ahead/behind/dirty. Reuse: `git worktree list`, `telemetry/gitstats.ts` if useful. Data: computed live (no store needed) + optional cache. Security: read-only git; no paths leave device via sync (F-004). Egress: none.
- Tests: returns ≥1 entry (self), shape correct. Deps: none.

## D24 — Uncommitted/unpushed/dirty risk scanner (Veridian-only)
- Owner DESK-w2 · files: `orchestrator/repo-registry.ts` (risk fn), `server.ts` (/api/orch/risk). 
- Outcome: each registry entry classified LOW/MED/HIGH/CRITICAL. Rules: CRITICAL = dirty≥1 with no upstream OR local commits no upstream; HIGH = unpushed>0; MEDIUM = dirty small or stale>7d; LOW = clean. Reuse: D21. Tests: classifier unit table. Deps: D21.

## D46 — Control Center API health/readiness
- Owner DESK-w3 · files: `server.ts` (/api/orch/health). Outcome: `{ok,version,uptimeMs,checks{vault,ai,flags,git}}`. Reuse: existing module presence checks. Security: no secrets in output. Tests: returns ok shape. Deps: none.

## D47 — Control Center shell (UI)
- Owner DESK-w4 · files: `src/components/ControlCenter.tsx` (new), `src/components/TabbedApp.tsx` (register admin tab). Forbidden: backend files. Outcome: admin "Control Center" tab showing health + repo risk + feature toggles. Reuse: TabbedApp tab pattern, apiBase/fetch convention. Deps: D06, D24, D46 contracts.
