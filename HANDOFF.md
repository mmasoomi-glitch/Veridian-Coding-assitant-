# Veridian — Cross-Machine Handoff Log

Timestamped Q&A progression so Claude sessions on other computers can pick up exactly where this left off. **Newest entries at the top of the log. Append a new entry (with timestamp) when you do work, then commit + push.** Read `CLAUDE.md` for architecture.

---

## 📡 CROSS-AGENT INFRA NOTE — 2026-06-26 (from the Tunnel/Infra agent, `C:\VPS_PHONE` session) — STOOD DOWN

A separate Claude Code session (out of `C:\VPS_PHONE`) briefly used Veridian as a **test target** for Cloudflare Tunnel. **The owner has since decided Veridian stays as-is — I am no longer working on it.** I made **no code changes** (no edits to `server.ts`/`.env`, no server restart); this note is the only thing I added. The test tunnel was torn down immediately — nothing of mine is still running.

**One thing worth keeping (free security finding):** while testing I exposed `localhost:3000` and probed it from the internet. Because `VERIDIAN_AUTH` is unset, registered Express `/api/*` routes (e.g. `/api/waiting`, `/api/fleet/status`) returned **real data with no auth** — they bypass Vite's host-check, which only guards the SPA. **Fine on LAN; do NOT tunnel/port-forward port 3000 without first setting `VERIDIAN_AUTH=totp`** (TOTP is already implemented in `auth/totp.ts` + `totp-config.json`). Sharing in case it's useful for you — no action needed from me.

---

## ⏭️ PICK UP HERE (current state as of 2026-06-23 03:17 +04:00)

**Status:** Fully working locally on the origin machine (Windows 11, `C:\Users\HI\veridian`). Pushed to GitHub for cross-machine continuation.

**What works (verified):**
- Real telemetry (active window, clipboard, PowerShell history, git, virtual desktop, browser URL).
- "Where was I?" AI summary, per-desktop briefs, "waiting on you" inbox, click-to-switch desktops.
- **Autopilot Fleet**: one headless Opus (Claude Code / Max) session per project. An `assess` run on the Veridian project produced a real, correct codebase assessment — confirmed tangible Opus intelligence.
- Companion APK built (Capacitor 6 / JDK 17) and installed on the owner's phone; it views PC telemetry over LAN.
- Clipboard-secret redaction; flicker/reload distraction fixed.

**Immediate next steps (in priority order):**
1. **Set a provider on the new machine.** Best: `AI_PROVIDER=claude` + be logged into Claude Code (uses Max plan, no API key). The whole point is exploiting the Max/Opus subscription.
2. **Build the permission-mode button in the UI** (Suggest / Accept-edits-safe / Full) — backend modes already exist in `autopilot/fleet.ts`; surface them per-project and for the CommandDeck autopilot.
3. **Per-desktop *persistent interactive* sessions** — currently each fleet run is a fresh one-shot `claude -p`. The owner wants long-lived, hidden-but-interactive sessions per desktop that retain conversation. Design: keep a `claude` session id per desktop (resume with `--resume <id>`), or use the Agent SDK.
4. **Overnight mode** — schedule recurring `build`-mode fleet runs so progress happens while the owner sleeps. (Use a scheduler; respect the safety guardrail — `build` not `full` unless owner opts a project in.)
5. Configure `fleet-projects.json` with the owner's REAL projects per desktop (desktop #, path, goal). Currently only `Veridian` is configured.

**Owner context:** burnt out, ADHD-style context switching, wants the assistant to reduce decision load and "do the work while I sleep." Has Claude Max $200 plan. Hates UI flicker and fake/placeholder data — keep everything real and calm.

---

## Q&A Progression (this session — origin machine, 2026-06-22 → 2026-06-23)

### 2026-06-23 ~03:1x — Q: "Push to repo + make handoff .md files, timestamped Q&A."
A: Hardened `.gitignore` (private telemetry never committed). Wrote `CLAUDE.md` + this `HANDOFF.md`. Pushed to `github.com/mmasoomi-glitch/Veridian-Coding-assitant-`.

### 2026-06-23 ~03:0x — Q: "Full autopilot. Where do I plant the powerful AI (Max/Opus)? Hidden interactive Claude session per desktop, observe, decide my next move, button to act."
A: Confirmed local Claude Code CLI runs headless as Opus (Max-authenticated). Added `claude` provider (`ai/providers.ts`). Built the **Autopilot Fleet** (`autopilot/fleet.ts` + `/api/fleet/*` + `src/components/AutopilotFleet.tsx`): one Opus session per project, modes assess/build/full. Verified with a real `assess` run. Still TODO: persistent interactive per-desktop sessions, overnight scheduling, permission-mode button.

### 2026-06-23 ~02:xx — Q: "Refresh is too distracting; make changed values dim smoothly."
A: Found data-file writes triggered full page reloads → added them to Vite `watch.ignored` (0 reloads). Made waiting list skip no-op updates, slowed poll to 45s, added 0.4s fade on value changes via `motion/react`.

### 2026-06-23 ~02:xx — Q: "Fan out an agent to deliver the APK."
A: Capacitor 8 needed JDK 21 (machine has 17) → pinned Capacitor 6. Built debug APK, `adb install` to phone (`192.168.70.22`), verified the phone fetches live telemetry from the PC (`http://192.168.70.39:3000`). It's a companion/viewer (can't collect telemetry itself).

### 2026-06-22 — Q: "Clear the seed; collect correct telemetry."
A: Removed all fictional seed/placeholder data. Built `telemetry/collect.ps1` (real window/clipboard/git/desktop/browser), `persist.ts`, `watcher.ts`. Wired frontend to live telemetry. Added clipboard-secret redaction after a real key was found in clipboard.

### 2026-06-22 — Q: "It shows stub data / AI isn't working."
A: Bug: `aiBriefing` was hardcoded; UI never called the AI. Auto-triggered the real summary on load; fixed a stuck "Analyzing…" spinner (success path never cleared loading).

### 2026-06-22 — Q: "Use DeepSeek instead of Gemini; add CORS; configurable API base."
A: Swapped Gemini → DeepSeek (`/api/ai/summarize`), added CORS, `VITE_API_BASE` for the APK. Later generalized to the multi-provider `ai/providers.ts`.

### 2026-06-22 — Q: "Run the AI Studio app locally; build APK." (origin)
A: Exported the Google AI Studio project, ran it locally, then progressively rebuilt it from a simulator into this real tool.

---

## How to coordinate (multiple machines)
1. `git pull` before starting.
2. Do work. Run `npx tsc --noEmit`.
3. Add a new timestamped entry at the TOP of the Q&A Progression and update "PICK UP HERE".
4. `git commit` + `git push`.
5. Never commit `.env` or the runtime data JSONs (already git-ignored).
