# Definition Pack — FIX-INSTALLER-DATADIR

**Package id:** FIX-INSTALLER-DATADIR
**Owner (writer):** Big-LLM author → Opus gate → controlled apply
**Blast radius:** L2 (new path helper + ~26 store path-resolution edits + 1 installer env line; mechanical, no logic change)
**File scope:** `lib/paths.ts` (new), `electron/main.cjs`, `server.ts:51`, `telemetry/persist.ts`, `telemetry/watcher.ts`, `auth/*`, `autopilot/*`, `orchestrator/*` data stores
**⚠ Overlaps `server.ts` with FIX-TELEMETRY-PARSE — MUST NOT run in parallel with it.** Sequence after telemetry parse is committed.
**Status:** READY FOR veridian-develop (sequenced)

## Business purpose
Veridian's entire value is durable, private, on-device memory (auth vault, session history,
fleet progress, briefs, notebooks). User data must survive app upgrades and be cleanly
separable from program files.

## Confirmed defect (file:line)
- `electron/main.cjs:32-37` `resolveServerCwd()` returns `process.resourcesPath` when packaged.
- `electron/main.cjs:84` spawns the server with `cwd: SERVER_CWD` (= install dir / Program Files,
  perMachine).
- Every store resolves files via `path.join(process.cwd(), "<file>")` at module load — e.g.
  `auth/vault.ts:21` (`veridian.cred`), `auth/users.ts:20` (`auth-users.json`), `server.ts:51`
  + `telemetry/persist.ts:35` (both `workspace-sessions.json`), and ~22 `autopilot/*` +
  `orchestrator/*` JSON stores. So all data, the DPAPI vault, screenshots, and notebooks are
  written into **Program Files** → wiped/orphaned on upgrade/uninstall; perMachine also blocks
  reliable non-admin writes.
- `app.getPath('userData')` (= `%APPDATA%\Veridian`) is **already computed** at
  `electron/main.cjs:82` but only forwarded as `VERIDIAN_WATCH_DIR` (git-telemetry target,
  `server.ts:841`) — NOT as a data root.

## Critical distinction (do not conflate)
- **DATA** (must move): `.json` / `.cred` / `.txt` / `.pid` files + `screenshots/`,
  `notebook-files/` subdirs.
- **CODE/RESOURCES** (must STAY on `process.cwd()`/resourcesPath): `.ps1` script refs
  (`server.ts:310` collect.ps1, `server.ts:563` desktop-switch.ps1,
  `autopilot/screenshots-store.ts:19`, `autopilot/keylog-store.ts:21`) and `dist/` static
  (`server.ts:935`). A naive global replace would break script resolution.

## Minimal migration design
New `lib/paths.ts`:
```ts
import path from "node:path"; import fs from "node:fs";
const DATA_DIR = (process.env.VERIDIAN_DATA_DIR?.trim()) || process.cwd(); // dev fallback = repo root
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
export { DATA_DIR };
export const dataPath = (...segs: string[]) => path.join(DATA_DIR, ...segs);
```
Wire-up: (1) `electron/main.cjs:89` add `VERIDIAN_DATA_DIR: process.env.VERIDIAN_DATA_DIR ||
watchDir` to the spawn env. (2) Each DATA store: `path.join(process.cwd(), "x")` → `dataPath("x")`.
Leave CODE/RESOURCES refs untouched. `server.ts:51` and `telemetry/persist.ts:35` (same
`workspace-sessions.json`) MUST migrate together or they split-brain.

## Required outcome
1. All persistent user data resolves under one root, default `%APPDATA%\Veridian`
   (`app.getPath('userData')`), via `VERIDIAN_DATA_DIR` → `lib/paths.ts`.
2. Install dir contains only program/resource files; no JSON/cred/txt data written there.
3. Installing v1.0.1 over v1.0.0 leaves the vault + stores intact (data lives outside the
   replaced install dir). `deleteAppDataOnUninstall:false` (already set) preserves data on
   uninstall.
4. Dev behavior unchanged: no `VERIDIAN_DATA_DIR` ⇒ `process.cwd()` (repo root); existing
   tests keep passing.
5. One-time migration: if `%APPDATA%\Veridian` is empty but install-dir copies exist, move them
   (decision required — see Unknowns).

## Acceptance / verification
- Fresh packaged install + run: `veridian.cred`, `auth-users.json`, `workspace-sessions.json`,
  `fleet-progress.json`, `screenshots/`, `notebook-files/` appear under `%APPDATA%\Veridian`,
  NOT the install dir.
- Init vault → add team member → generate session → upgrade-install → login still works, stores
  intact. Uninstall → `%APPDATA%\Veridian` survives → reinstall re-attaches.
- Telemetry/desktop `.ps1` and static `dist/` still resolve. `npx tsc --noEmit` passes.

## Unknowns / risks
- **`app.getPath('userData')` folder name depends on `app.name`** — verify it resolves to
  `%APPDATA%\Veridian` and not `%APPDATA%\react-example` (package.json `name`); if wrong, call
  `app.setName('Veridian')` before `getPath`.
- **Existing-data migration** needs an explicit decision (move vs fresh).
- **Two divergent builder configs** (`package.json` NSIS vs `electron-builder.yml` portable) —
  the NSIS build does not ship `autopilot/`/`ai/` as extraResources; confirm esbuild bundles
  them into `dist/server.cjs` (it should, `--packages=external` notwithstanding) or the packaged
  server is missing runtime code regardless of this fix.

## Hard stops
No auth/route/secret logic change — path resolution only. F11 mandatory before commit. Rebuild
installer → v1.0.1 only after verification.
