# Model build context — Veridian (use this as the system preamble for LLM fix requests)

## Intention of the app
Veridian is a **single-owner, Windows-first "workspace memory + command center."** It captures the owner's real local machine context (active window, clipboard, git, virtual desktops, browser tab, terminal history, screenshots) and uses an LLM to answer "where was I?", advance projects safely (autopilot), and reduce cognitive load. A read-only cloud dashboard aggregates the owner's several machines; an APK/PWA are read-only viewers.

## What it does today (verified)
- Local Node+Express server (`server.ts`) + React/Vite tabbed UI.
- Real telemetry via PowerShell collectors (`telemetry/*.ps1`), persisted to flat JSON.
- AI provider = **OpenRouter (OpenAI-compatible) or Anthropic**, HTTP only (`ai/providers.ts`); honest-disabled when unconfigured; no CLI/subprocess, no fake heuristic shown as AI.
- Tabs: Dashboard, Clipboard, AI Ask, Screenshots, Todo, Keystrokes, Settings.
- TOTP auth implemented (`auth/totp.ts`) but currently fail-open.

## Owner expectations (hard)
- **Everything real — no fake/seed data, no fabrication.** Honest states only.
- **Calm, respectful, grounded** assistant tone.
- **Privacy:** raw clipboard/keystrokes/screenshots/secrets never leave the device, never sent to the LLM, never synced.
- **Safety:** fail-closed auth; autopilot defaults to plan-only (ASSESS); no unsupervised destructive execution.
- Fast, low-friction, no UI flicker. Cheap to run (OpenRouter cheap model preferred).

## Engineering rules for any generated fix
- TypeScript; match existing style. **Return ONLY the requested code** (full revised file or a precise replacement block) — no prose, no markdown fences.
- Do not introduce new dependencies unless asked. Do not weaken security to pass a check.
- Must compile (`npx tsc --noEmit`) and not break existing routes/SPA serving.

## Model-loop policy (how fixes are produced)
1. Draft with the **cheap** model (`deepseek/deepseek-chat`).
2. Apply → verify (`tsc` + targeted runtime check). **If it passes, move forward — do not re-prompt the same model.**
3. If it fails verification, **escalate** the model (deepseek → `qwen/qwen3-coder` → `anthropic/claude-sonnet-4`), one attempt each, then stop and report.
4. A human/Claude reviews before the disk write; nothing auto-commits.

## CURRENT TARGET ISSUE — F-002: fail-open auth + non-loopback bind
`server.ts` binds the server to `0.0.0.0` (all interfaces) and its auth middleware only enforces TOTP when `VERIDIAN_AUTH=totp` is set — otherwise **every `/api/*` route is reachable unauthenticated on the LAN** (clipboard, keylog, screenshots, telemetry, launch).

**Required behavior:**
- Bind to `127.0.0.1` (loopback) by default. Bind to a non-loopback address ONLY if `VERIDIAN_BIND` is explicitly set (e.g. `0.0.0.0`).
- If the effective bind is non-loopback **or** `VERIDIAN_AUTH=totp`, then **require a valid session** for all `/api/*` routes except `/api/auth/*` (return 401 otherwise) — i.e., fail-CLOSED on any network-exposed binding.
- Allow an explicit local-dev bypass ONLY when bind is loopback AND `VERIDIAN_LOCAL_DEV=1` (and surface that state).
- Must not break: the SPA/static serving, `/api/auth/*`, or CORS.
