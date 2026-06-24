# 01 — Architecture Map (Veridian)

> Synthesized by the lead release auditor from 10 specialist audits + direct re-verification against the running server (localhost:3000) and repo files on 2026-06-24. Evidence is `file:line` or live command output.

## One-paragraph picture
Veridian is a **single Node process** (`tsx server.ts`) serving an Express API **and** a Vite/React SPA from the same port (3000 local, 3100/`pr.afaq24.store` cloud). It shells out to **Windows PowerShell** scripts for all real telemetry, persists everything to **flat JSON files in `process.cwd()`**, and calls an **LLM provider** (currently DeepSeek, not the PDR-mandated Claude Opus). There is no database, no test suite, no process manager. An Electron wrapper (`Veridian.exe`) and a Capacitor APK are secondary surfaces.

## Components / processes

| Component | File(s) | Role | Runs where |
|---|---|---|---|
| HTTP server + SPA host | `server.ts` | All `/api/*` endpoints, CORS (origin-reflecting, `server.ts:40-50`), TOTP gate (`server.ts:64-71`), telemetry poller, Vite middleware | Node (Win local + Linux cloud) |
| Telemetry collector | `telemetry/collect.ps1` | Active window, clipboard, PowerShell history, git, virtual-desktop index, browser tab | **Windows only** (Win32/UIAutomation) |
| Screenshot capture | `telemetry/screenshot.ps1` | Per-desktop PNG capture | **Windows only** (System.Windows.Forms) |
| Keystroke metrics | `telemetry/keystroke-metrics.ps1` | Timing-only fatigue signals (GetAsyncKeyState) | **Windows only** |
| Keystroke recorder | `telemetry/keylog.ps1` + `autopilot/keylog-store.ts` | Full keystroke text log (opt-in, manual start) | **Windows only** |
| Desktop switch | `telemetry/desktop-switch.ps1` | Win+Ctrl+Arrow via registry GUID order | **Windows only** |
| AI provider abstraction | `ai/providers.ts` | `chatJSON()`; provider = claude(CLI) / openai / **deepseek (current default)** | Node |
| Autopilot fleet | `autopilot/fleet.ts` | One headless `claude -p --model opus` session per project; modes assess/build/full | Node + local `claude` CLI |
| Per-desktop briefs | `autopilot/desktop-briefs.ts` | "where I was / next step" per desktop | Node |
| Autonomy learning | `autopilot/learn.ts` | Action becomes "trusted" after 3 approvals | Node |
| Clipboard history | `autopilot/clip-history.ts` | 20 rolling entries + frequency counts | Node |
| AI Ask | `autopilot/ai-ask.ts` | Q&A over gathered local context | Node + LLM |
| Burnout | `autopilot/burnout-store.ts` | Fatigue score from keystroke metrics (returns `level:"ok"` with no data) | Node |
| Cloud sync | `autopilot/sync-client.ts`, `autopilot/sync-store.ts` | Push local state to `CENTRAL_URL` (disabled: env unset) | Node |
| Backup | `autopilot/backup.ts` | scp/ssh to Hetzner `root@89.167.49.209` volume | Node |
| Auth | `auth/totp.ts` | TOTP setup/login/recovery, HMAC session cookie | Node |
| Desktop app | `electron/main.cjs` | Spawns bundled server, points cwd at `resourcesPath` | Windows |
| Mobile | Capacitor (`@capacitor/*`) | Read-only companion viewer | Android |

## Data files (all flat JSON/text in `process.cwd()`, git-ignored, unencrypted)
`workspace-sessions.json`, `clip-history.json` (**raw `value` incl. secrets**, `clip-history.ts:148`), `clip-counts.json` (**raw `value` incl. secrets**, `clip-history.ts:113-114`), `todo-store.json`/`todos.json`, `desktop-briefs.json` (contains residual fake "mira-vpn" data), `screenshots-index.json` (capped 200) + `screenshots/*.png`, `fleet-projects.json`, `fleet-progress.json`, `autopilot-learning.json`, `ask-history.json` (**contains leaked `sk-ant-*` keys from prior AI responses** — verified by grep), `notebook.json` + `notebook-files/`, `keystroke-log.txt`, `sync-machines.json`, `keylog.pid`.

## Key routes (selected)
`/api/telemetry/current`, `/api/ai/summarize`, `/api/ask`, `/api/autopilot/next`, `/api/autopilot/feedback`, `/api/fleet/{projects,run,status}`, `/api/desktop/{switch,brief,briefs,info}`, `/api/clipboard/{history,top,suggest}`, `/api/screenshots` + `/api/screenshots/img/:id`, `/api/todos`, `/api/scratch`, `/api/keylog{,/start,/pause,/clear}`, `/api/burnout`, `/api/pdr/generate`, `/api/notebook/file`, `/api/backup`, `/api/backups`, `/api/sync/{push,machines}`, `/api/auth/{status,setup,login,logout}`, `/api/db-config`, `/api/stats`, `/api/gitstats`.

## What runs where — the central architectural fault
- **Windows local PC**: full telemetry, screenshots, keystrokes, desktop switch all work (verified live: `/api/telemetry/current` returns real data).
- **Linux cloud VPS (`pr.afaq24.store`, shared commerce box `afaq-commerce-01`)**: the **same `server.ts`** runs but **cannot execute any `.ps1`** — `powershell.exe` does not exist on Linux. So all Windows-only telemetry/screenshots/keystrokes/desktop features are blind on cloud. The cloud is positioned as "central command" but the push-sync path that would feed it (`CENTRAL_URL`) is **unset** (verified: env empty), so the cloud aggregates **nothing**.

## Security boundary (as built)
- Auth (`auth/totp.ts:71-72`) is gated only by `VERIDIAN_AUTH === 'totp'`. **Default OFF.** Live local: `/api/auth/status` → `{"required":false,...}`. Every data endpoint is otherwise fully open to anyone who can reach the port.
- CORS reflects the request Origin (`server.ts:42`), so any website the owner visits can read the local API while auth is off.
- No encryption at rest; secrets persisted raw in clipboard files and echoed into `ask-history.json`.
