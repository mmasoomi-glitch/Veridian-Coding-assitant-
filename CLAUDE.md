# Veridian Coding Assistant — Project Guide (for Claude sessions)

This file orients any Claude session working on this repo. Read it first, then read `HANDOFF.md` for the latest timestamped state and the next action.

## What this is
A **local, real-telemetry developer copilot** for a developer who context-switches across many Windows virtual desktops and forgets where they left off. Originally a Google AI Studio simulator (all fake data); rebuilt into a real tool that observes the actual machine and uses an LLM to tell you "where was I?" and to autonomously advance projects.

## Run it
```bash
npm install
# set ONE provider (see Providers below), then:
$env:VERIDIAN_WATCH_DIR="C:\path\to\a\git\repo"   # repo to report git telemetry for
$env:TELEMETRY_POLL_MS="30000"                      # optional background capture
npm run dev                                          # tsx server.ts + Vite middleware on http://localhost:3000
```
Server restart is required for any change to `server.ts` / `vite.config.ts` / files under `ai/`, `telemetry/`, `autopilot/`. Only `src/**` hot-reloads.

## Architecture
- `server.ts` — Express + Vite middleware. All endpoints; CORS open (no cookies). Telemetry poller.
- `telemetry/collect.ps1` — REAL Windows telemetry: active window/app, clipboard, PowerShell history, git (for `VERIDIAN_WATCH_DIR`), virtual-desktop index (registry GUID order), browser tab URL (UI Automation). Emits one compact JSON line. Honest `"unknown"` when a value can't be read — never fakes.
- `telemetry/persist.ts` — rolling `live-telemetry` session in `workspace-sessions.json` (deduped timeline, cap 60).
- `telemetry/watcher.ts` — "waiting on you" sensor; scans Claude task logs under `%LOCALAPPDATA%\Temp\claude`, filters infra/build noise.
- `telemetry/desktop-switch.ps1` — click-to-switch desktops via native Win+Ctrl+Arrow (delta from current registry index). No third-party exe.
- `ai/providers.ts` — `chatJSON()`; provider = `claude` (local Claude Code CLI, **uses Max plan, no API cost** — `AI_PROVIDER=claude`), else `openai` (OPENAI_API_KEY), else `deepseek` (DEEPSEEK_API_KEY).
- `autopilot/learn.ts` (`autopilot-learning.json`) — approval learning; an action type becomes "trusted" after 3 clean approvals.
- `autopilot/desktop-briefs.ts` (`desktop-briefs.json`) — per-desktop "where I was + next step", saved on each summary, resurfaced on switch.
- `autopilot/fleet.ts` (`fleet-projects.json`, `fleet-progress.json`) — **the autopilot fleet**: one headless Claude Code (Opus) session per project. Modes → Claude permission modes: `assess`→`plan` (read-only), `build`→`acceptEdits` (auto-edits, gates risky), `full`→`bypassPermissions` (unsupervised, opt-in only).
- `src/App.tsx` — dashboard. `src/components/CommandDeck.tsx` (desktop switch + autopilot "What now?" + waiting inbox), `src/components/AutopilotFleet.tsx` (fleet control + progress).

## Key endpoints
`/api/telemetry/current`, `/api/ai/summarize`, `/api/desktop/switch`, `/api/desktop/brief(s)`, `/api/waiting`, `/api/autopilot/next`, `/api/autopilot/feedback`, `/api/fleet/projects` (GET/POST), `/api/fleet/run` (POST {mode,desktop?}), `/api/fleet/status`.

## Providers — exploiting the Claude Max plan
The owner has a **Claude Max ($200) plan**. The cheapest, most powerful brain is the **local Claude Code CLI** (`claude -p --model opus`), which `ai/providers.ts` and `autopilot/fleet.ts` both shell out to. Set `AI_PROVIDER=claude` (and `CLAUDE_MODEL=opus`). No API key, flat-rate. This is the intended "powerful AI" plant point.

## SAFETY GUARDRAIL (do not remove)
The autopilot auto-EXECUTES only safe, reversible, local actions and ALWAYS gates anything irreversible/outward-facing (send, delete, publish, push, pay, auth) behind explicit human approval — regardless of confidence. Fleet `full` mode (`bypassPermissions`) is opt-in per project by the owner, never the default. Clipboard secrets are redacted before persist/AI send (`redactSecret` in server.ts).

## Conventions
- Match existing dark-cockpit Tailwind styling; use `motion/react` for gentle fades (no jarring refresh — the owner is sensitive to flicker).
- Data files are git-ignored (private telemetry). Never commit them.
- After changes: `npx tsc --noEmit` must pass.

## Cross-machine coordination
Other Claude sessions on other computers also work this repo. Append your progress to `HANDOFF.md` (timestamped, Q&A format) and commit, so the next session picks up cleanly. Pull before you start.
