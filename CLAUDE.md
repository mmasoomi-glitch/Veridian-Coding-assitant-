# Veridian Coding Assistant — Project Guide (for Claude sessions)

> ## ⛔ MANDATORY ENTRY POINT — READ BEFORE ANY WORK
> Every Claude Code agent MUST read these before writing any feature code:
> `CLAUDE.md` · `CLOUD.md` · `docs/program-control/MODEL_EXECUTION_POLICY.md` ·
> `docs/program-control/SKILL_ROUTING_POLICY.md` · `docs/program-control/FEATURE_GATE_POLICY.md` ·
> `docs/program-control/HANDOFF_MEMORY.md` · `docs/program-control/AGENT_OWNERSHIP.md` ·
> `docs/program-control/WORK_PACKAGE_BOARD.md`.
>
> **Model routing (enforced):** Opus = assess/plan/audit/review/gates. **DeepSeek V4 via the
> single gateway `scripts/ai/openrouter_deepseek_bundle.py` = the ONLY code author.** Haiku =
> apply-only disk writer. Anthropic-HTTP = assess-only. No Qwen, no fallback, no substitution.
> No feature code before the correct skill (`veridian-debug` → `veridian-develop`) and the
> Feature/Practicality/Blast-Radius gates run. No `git add -A` — use `scripts/git/safe-stage`.
> Truthful labels only (LOCAL TESTED ≠ RUNTIME VERIFIED ≠ INTEGRATED ≠ DEPLOYED).

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
- `ai/providers.ts` — `chatJSON()` via a **direct Anthropic-compatible HTTP endpoint ONLY** (`ANTHROPIC_BASE_URL`/`ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL=claude-opus-4-8`, read at runtime, optionally via `VERIDIAN_ENV_FILE`). **No DeepSeek, OpenAI, Gemini, local-model fallbacks, Claude Code CLI, or headless Claude subprocesses.** Missing config ⇒ AI honestly disabled (no fallback, no fake heuristic posing as AI).
- `autopilot/learn.ts` (`autopilot-learning.json`) — approval learning; an action type becomes "trusted" after 3 clean approvals.
- `autopilot/desktop-briefs.ts` (`desktop-briefs.json`) — per-desktop "where I was + next step", saved on each summary, resurfaced on switch.
- `autopilot/fleet.ts` (`fleet-projects.json`, `fleet-progress.json`) — **the autopilot fleet**: one headless Claude Code (Opus) session per project. Modes → Claude permission modes: `assess`→`plan` (read-only), `build`→`acceptEdits` (auto-edits, gates risky), `full`→`bypassPermissions` (unsupervised, opt-in only).
- `src/App.tsx` — dashboard. `src/components/CommandDeck.tsx` (desktop switch + autopilot "What now?" + waiting inbox), `src/components/AutopilotFleet.tsx` (fleet control + progress).

## Key endpoints
`/api/telemetry/current`, `/api/ai/summarize`, `/api/desktop/switch`, `/api/desktop/brief(s)`, `/api/waiting`, `/api/autopilot/next`, `/api/autopilot/feedback`, `/api/fleet/projects` (GET/POST), `/api/fleet/run` (POST {mode,desktop?}), `/api/fleet/status`.

## Providers (current — supersedes any older note in this file)
- **In-product runtime AI** (`ai/providers.ts`): OpenRouter (key `VERIDIAN_ENV`) or Anthropic
  HTTP, assess/answer only; honest-disabled when unconfigured. No CLI/subprocess.
- **Development code authoring**: NOT done by the in-product provider. It goes through the
  **DeepSeek V4 gateway** (`scripts/ai/openrouter_deepseek_bundle.py`) under
  MODEL_EXECUTION_POLICY.md. (The earlier "Claude Max CLI / shell out to claude -p" note is
  obsolete — there is no CLI shell-out.)

## SAFETY GUARDRAIL (do not remove)
The autopilot auto-EXECUTES only safe, reversible, local actions and ALWAYS gates anything irreversible/outward-facing (send, delete, publish, push, pay, auth) behind explicit human approval — regardless of confidence. Fleet `full` mode (`bypassPermissions`) is opt-in per project by the owner, never the default. Clipboard secrets are redacted before persist/AI send (`redactSecret` in server.ts).

## Conventions
- Match existing dark-cockpit Tailwind styling; use `motion/react` for gentle fades (no jarring refresh — the owner is sensitive to flicker).
- Data files are git-ignored (private telemetry). Never commit them.
- After changes: `npx tsc --noEmit` must pass.

## Cross-machine coordination
Other Claude sessions on other computers also work this repo. Append your progress to `HANDOFF.md` (timestamped, Q&A format) and commit, so the next session picks up cleanly. Pull before you start.
