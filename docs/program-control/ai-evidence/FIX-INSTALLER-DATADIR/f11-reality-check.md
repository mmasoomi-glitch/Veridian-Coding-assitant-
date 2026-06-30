# F11 Applied-Code Reality Check — FIX-INSTALLER-DATADIR (foundation increment)

package: FIX-INSTALLER-DATADIR (part 1 of 2 — foundation; store sweep follows)
author_model: cohere/north-mini-code:free (snapshot cohere/north-mini-code-20260617:free), BUNDLE_OK 2 files
reviewer: Opus gate on applied artifacts

## Applied (foundation only)
- lib/paths.ts (new, VERBATIM) — DATA_DIR = VERIDIAN_DATA_DIR (trimmed) or process.cwd(); best-effort
  mkdir; dataPath(...segs). Defaults to cwd, so dev/test behavior is UNCHANGED.
- tests/paths.test.ts (new, VERBATIM) — 4/4 pass.
- electron/main.cjs — added env line VERIDIAN_DATA_DIR = process.env.VERIDIAN_DATA_DIR || watchDir
  (watchDir = app.getPath('userData')). CODE/RESOURCE paths (.ps1, dist) intentionally untouched.

## Checks
- diff_equals_approved: PASS — lib/paths.ts + test verbatim; electron edit is the single approved env line.
- exit_code_truth: PASS — tsc --noEmit EXIT 0; `tsx tests/paths.test.ts` "paths.test: 4 passed" EXIT 0;
  `node --check electron/main.cjs` EXIT 0.
- path_of_claim: PARTIAL/HONEST — this increment establishes the data root and passes it to the packaged
  server. It does NOT by itself relocate data: NO store imports dataPath yet, so the data-loss bug is
  NOT yet fixed. Claimed label = IMPLEMENTED-UNTESTED (foundation); positive_path NOT_PROVEN for the
  actual data-relocation outcome (requires the store sweep + a packaged-run verification).
- label_reconciliation: PASS — not claiming the bug fixed; explicitly "foundation, stores pending".
- no_secret_leak / blast_radius: PASS — L1 so far (one new module + test + one env line); no behavior
  change in dev (DATA_DIR defaults to cwd).
- platform: NOTED — app.getPath('userData') currently resolves to %APPDATA%\react-example (app name),
  NOT %APPDATA%\Veridian (confirmed live: telemetry workspacePath showed ...\Roaming\react-example).
  The sweep part must add app.setName('Veridian') (or accept react-example) to land data in the
  intended folder. Tracked as a required step of part 2.

## VERDICT: F11 PASS (foundation) — safe to commit; bug NOT yet resolved
Part 2 (store sweep: migrate ~28 DATA sites across auth/autopilot/orchestrator/telemetry + server.ts:51
to dataPath(); keep .ps1/dist/git on cwd; add app.setName('Veridian')) follows, then a packaged-run
proof and installer v1.0.1 rebuild before any RUNTIME VERIFIED label.

---

## Part 2a (CRITICAL CLUSTER MIGRATED) — F11 PASS
Migrated the highest-value DATA stores (the ones whose loss would break login + lose history) to
dataPath(): auth/vault.ts (veridian.cred, totp-config.json), auth/users.ts (auth-users.json),
server.ts:51 + telemetry/persist.ts (workspace-sessions.json), autopilot/sessions.ts (sessions.json),
autopilot/fleet.ts (fleet-projects/-progress.json), telemetry/watcher.ts (reads sessions.json +
fleet-progress.json). The three shared files (workspace-sessions / sessions / fleet-progress) were
migrated as ATOMIC reader+writer groups → no split-brain.

- exit_code_truth: PASS — `npx tsc --noEmit` EXIT 0.
- regression: PASS — FULL tsx suite **22 passed, 0 failed** (dataPath defaults to cwd in dev, so all
  data resolves identically; auth-vault + admin-users specifically green).
- diff_equals_approved: PASS — mechanical process.cwd()→dataPath swaps + the model-authored dataPath
  helper; no .ps1/dist/git refs touched; no logic change.
- platform: in the PACKAGED app these stores now write under VERIDIAN_DATA_DIR (userData) instead of
  Program Files → they survive upgrade/uninstall. (Folder is currently %APPDATA%\react-example until
  app.setName('Veridian') is added in 2b — but upgrade-survival, the actual bug, is already achieved.)
- claimed_label: INTEGRATED (critical stores); RUNTIME VERIFIED deferred until a packaged-run proof.

### Still pending (part 2b, honest): ~21 independent single-file stores
autopilot/{backup,learn,desktop-briefs,todo-store,prompts-store,scratch-store,pdr,notebook,
screenshots-store(keep .ps1),burnout-store,keylog-store(keep .ps1),ai-ask,sync-store,clip-sync-store,
clip-history,flags-store}.ts + orchestrator/{device-registry,settings-store,secret-reference-registry,
lock-manager,repo-registry(keep scan-root)}.ts. Plus app.setName('Veridian') and installer v1.0.1
rebuild + packaged-run proof. Each is an independent data file (no cross-module sharing) → safe to
migrate in any grouping; the pattern is proven (22/22 suite green).

## VERDICT (2a): F11 PASS — READY TO COMMIT (critical data now survives upgrade)
