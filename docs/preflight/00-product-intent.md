# 00 — Product Intent (Veridian)

> Reconstructed from: the user's pasted PDR (this session), `CLAUDE.md`, `HANDOFF.md`, `README.md`, `package.json`, `server.ts` routes, UI copy, env files, git history, and observed running behavior. Where intent is not provable it is marked **AMBIGUOUS**.

## What the app is meant to achieve (plain language)
A personal "workspace memory + command center" for a developer who context-switches across many Windows virtual desktops and loses track of where they were. It captures real machine telemetry (active window, clipboard, git, virtual desktop, browser tab, recent commands), uses an LLM to answer "where was I?" and to advance projects (autopilot), and aggregates everything into a tabbed dashboard. A cloud instance (`pr.afaq24.store`) is the remote/"central command" view across machines; a companion APK and a standalone `.exe` are additional surfaces.

## Real user
- **Single user / owner** (admin). Self-described ADHD/burnout-prone, multitasks heavily, manages multiple repos/desktops. Non-collaborative (PDR Non-Goal: no multi-user).

## Real environment
- One or more **Windows 11 PCs** (telemetry source; runs `npm run dev` / `Veridian.exe`).
- A **Hetzner Ubuntu 26.04 VPS** (`afaq-commerce-01`, shared with other people, already runs nginx+Docker for `afaq24.store` commerce) hosting `pr.afaq24.store` on port 3100.
- An **Android phone** (companion APK, LAN/remote viewer).

## Main business problem
Context loss across fragmented tools; limited clipboard history; no proactive, state-aware AI; robotic voice. Goal: unified system that anticipates needs and reduces cognitive load.

## Primary workflow (intended)
1. Local server captures live telemetry (poller).
2. UI shows "Where was I?" AI brief + per-desktop context.
3. Autopilot proposes/﻿executes the next step; per-desktop Claude (Opus) sessions.
4. Tabs: Dashboard, Clipboard (20 + autocomplete + 5 pinned), AI Ask (context Q&A), Screenshots (auto >1min), Todo, Keystrokes (recorder), Settings.
5. Burnout detection nudges when fatigued.
6. Cloud aggregates machines (central command), TOTP-gated.

## Actors / roles
- **admin** (only role). Cloud access gated by TOTP. Local access ungated.

## Required inputs/outputs/integrations
- Inputs: OS telemetry (PowerShell/Win32), clipboard, keystroke timing, screenshots.
- Outputs: AI briefs, PDRs, todos, notes, clipboard restore, voice (ElevenLabs/Web Speech), backups to Hetzner volume.
- Integrations: **Claude Code CLI (Opus, Max)** intended as sole AI; ElevenLabs TTS (BYOK); GitHub (repo); Hetzner (SSH/volume/API); Capacitor (APK).

## What failure looks like for the user
- The "where was I?" / AI Ask returns generic/fake content (no real intelligence).
- Clipboard/screenshots/keystrokes don't actually capture.
- Data lost on refresh/restart.
- Cloud shows empty/garbage because Windows features can't run on Linux.
- Burnout/keystroke recorder silently not running.
- Secrets leaked.

## Assumptions found in code NOT proven by requirements (to be audited)
1. AI provider: PDR says **Opus headless only, "do NOT implement DeepSeek"**, but `ai/providers.ts` still defaults to DeepSeek and no Claude token is configured → AI may be DeepSeek or broken. (AMBIGUOUS vs PDR.)
2. All telemetry/clipboard/screenshot/keystroke features are **Windows-only** (PowerShell/Win32/.NET) — on the Linux VPS they cannot run.
3. Single-user; no real authorization model beyond one TOTP gate on the cloud; local is fully open.
4. Persistence = flat JSON files in `process.cwd()`; assumes single process, no concurrency control.
5. Burnout + keystroke recorder are **not auto-started** — features appear present but inert until a button is clicked.
6. Screenshots stored unencrypted locally; PDR open-question on privacy unresolved.

## Known/﻿suspected contradictions (seed list for auditors — verify, do not assume)
- C1: PDR "no DeepSeek" vs DeepSeek wired as default (`ai/providers.ts`).
- C2: PDR "Claude Opus headless as backend, creds from env" vs no `CLAUDE_CODE_OAUTH_TOKEN`/`ANTHROPIC_API_KEY` present.
- C3: Clipboard "20 entries" (PDR) vs earlier 50; verify current cap.
- C4: Cloud "central command / dashboard" vs Windows-only capture → cloud tabs may be empty.
- C5: "Natural voice replaces robot" vs Web Speech fallback still present when no ElevenLabs key.
- C6: Removed fiction seed earlier, but a heuristic fallback in `App.tsx` previously emitted fake "auth.service.ts/mira-vpn" — verify it's fully gone.
- C7: No automated tests exist in repo (verify) despite a "release" posture.
- C8: Cloud is a **shared production commerce server** — running an unrelated app + a keystroke/clipboard concept there raises blast-radius and privacy concerns.

## Out of scope (PDR Non-Goals)
Replacing email/calendar; multi-user/collaboration; mobile app build (note: an APK was nonetheless built); DeepSeek (yet present).
