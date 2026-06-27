# Veridian — Product Specification & PDR (authoritative)

> Source: synthesized from the owner's requests across the build session, the preflight audit (`docs/preflight/*`), and the remediation direction (`docs/remediation/*`). This is the **forward source of truth**. Where it conflicts with older notes/README/PDR fragments, **this document wins**. Status today: **REJECT — not ready for human testing**; this spec defines the target.

---

## 0. Vision & problem
Veridian is a **single-owner, Windows-first "workspace memory + command center."** The owner is a developer (ADHD / burnout-prone) who context-switches across many Windows virtual desktops, multiple repos, terminals, and AI sessions, and loses track of "where was I?". Veridian:
- captures **real** local machine context (no fiction, no simulation),
- gives an instant grounded **"Where was I?"** brief,
- offers **safe autopilot planning** and proactive help when the owner is fatigued,
- aggregates context across the owner's **several machines** into a **read-only central command** view,
- reduces cognitive load with a fast tabbed UI, clipboard memory, notes, screenshots, todos, and a calm voice.

**Failure for the user =** fake/ungrounded answers, lost data on refresh/restart, clipboard/telemetry that doesn't actually capture, secrets leaking, or the app creating more work than it saves.

## 1. Actors & environment
- **Owner / admin** — the only human role. No multi-user, no collaboration.
- **Local Windows agent** — runs on each Windows PC; owns all capture.
- **Cloud dashboard** — read-only aggregator on a **dedicated** Linux host (NOT the shared commerce VPS).
- **Companion surfaces** — Android APK + PWA (read-only viewers).
- Environment: several **Windows 11** PCs; one **dedicated** Linux VPS for the dashboard; an Android phone/tablet.

## 2. Operating modes (must be explicit at runtime)
| Mode | Runs on | May capture | Binding | Auth |
|---|---|---|---|---|
| `local-agent` | Windows only | window/clipboard/git/desktop/browser-tab/keystroke-metrics/screenshots (with consent) | loopback by default | bypass only on loopback + explicit `VERIDIAN_LOCAL_DEV=1` |
| `cloud-dashboard` | Linux (dedicated) | **nothing** (read-only aggregator) | public, HTTPS | **TOTP required** |
| `optional-sync` | both | allowlisted sanitized metadata only | — | authenticated machine enrollment |

Windows-only collectors **must hard-check platform** and report "unsupported on this OS" — never fabricate, never error silently.

## 3. AI provider — the ONLY intelligence path (FINAL)
- **Direct Anthropic-compatible HTTP endpoint only.** `ANTHROPIC_BASE_URL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL=claude-opus-4-8`, read at runtime (optionally via `VERIDIAN_ENV_FILE`).
- **Forbidden forever:** DeepSeek, OpenAI, Gemini, local-model fallbacks, Claude Code CLI, `claude -p`, headless Claude subprocesses, `--resume`, `CLAUDE_CODE_OAUTH_TOKEN`, `child_process` for AI.
- **States:** missing config → **DISABLED**; endpoint unreachable → **UNAVAILABLE**; model rejected → **UNAVAILABLE**; success → **AVAILABLE**. **No fallback. No fake heuristic shown as AI.** A deterministic local summary is allowed only if labeled `LOCAL STATUS SUMMARY — NO AI PROVIDER USED`.
- **Diagnostics view** (sanitized): configured / reachable / model-accepted / last-check / error-category. Never prints key, prompts, or responses.
- **Context policy** (applies to every AI request):
  - **Allowed:** active app name, repo basename, sanitized git branch/status, task titles, sanitized timestamps, high-level user-selected notes, redacted error summaries.
  - **Never sent:** raw clipboard, API keys/passwords/tokens, keystrokes, screenshots, browser content, full file contents, full local paths, private notes, shell history, customer/business data.
  - For any optional sensitive context: **per-request consent screen** showing exactly which categories will be sent; **local secret scan first**; deny if uncertain; never persist the transmitted prompt in plaintext.
- **Tone:** calm, respectful, concise, evidence-grounded. Never alarmist, never "rude robot." When context is empty, say so — never fabricate.

## 4. Feature requirements (P0 = release-critical)

### P0-1 Honest telemetry capture (`local-agent`)
- Collect: active window title+app, virtual desktop index+name, git (branch/ahead-behind/modified for a watched repo), browser tab URL/title, recent terminal commands, clipboard (redacted), screen idle.
- **Explicit enable/disable + visible status.** Poller must show real state; never silently no-op. Requires owner approval for automatic collection.
- Non-Windows → "unsupported," not failure/fabrication.
- **Acceptance:** fresh launch shows **no fake context**; disabled shows truthful state; enabled (Windows) shows real captured values; refresh/restart preserves last capture.

### P0-2 Clipboard memory
- Keep **last 20** entries; **autocomplete** as the user types; **top-5 most-repeated pinned** on top; **click-to-restore** to the OS clipboard (Windows; show "unsupported" elsewhere; **verify** the clipboard actually changed, not just exit code).
- **Secret-shaped values: stored as redacted preview + non-reversible hash only.** Raw value persisted only under explicit local-encrypted opt-in. Never sent to AI/sync.
- **Acceptance:** capture→store→list→search→restore proven end-to-end; survives restart; a secret-shaped string is never stored raw and never restorable in plaintext without opt-in.

### P0-3 "Where was I?" brief
- Grounded summary from **allowlisted** real telemetry via the Anthropic provider. Honest on empty input ("no active task determined"). No fabrication. Label local fallback clearly.
- **Acceptance:** with real telemetry → accurate brief citing the real repo/app; with empty telemetry → honest "nothing captured"; provider offline → honest UNAVAILABLE, never fake.

### P0-4 Per-desktop context (hover + switch + retain)
- Hover a desktop control → tooltip: project name, recent activity, last brief/next step, session id (if any), git summary.
- Click a desktop → **switch the OS virtual desktop** (native Win+Ctrl+Arrow, no third-party exe) and surface the **retained per-desktop brief**.
- **Acceptance:** hover shows real per-desktop data; switching lands on the correct desktop; the brief for that desktop is shown.

### P0-5 Tabbed UI
- Full-page tabs with smooth animation: **Dashboard, Clipboard, AI Ask, Screenshots, Todo, Keystrokes, Settings** (extensible to "hundreds of capabilities").
- **Honest empty states** everywhere; no flicker (skip no-op re-renders; fade value changes).
- **Acceptance:** each tab is independently usable; no fake/seed data; calm, non-jarring updates.

### P0-6 Fail-closed security (see §6)
### P0-7 Durable persistence (SQLite, see §5)
### P0-8 Anthropic-only AI (see §3)

### P1-1 AI Ask (context Q&A) — **disabled until safe**
- Ask e.g. "what was the veridian repo URL?" answered from allowlisted context (clipboard previews, sessions, notes, screenshot index).
- **Ships DISABLED** until: context allowlist + pre-send secret scan + authenticated access + tests proving no secret reaches the provider. Per-request disclosure of categories sent.

### P1-2 Autopilot (planning, safety-bounded)
- **Default mode = ASSESS** (plan only, from sanitized metadata; never file contents).
- **Per-project permission setting.** **BUILD/FULL execution is NOT a global default** and is **disabled** until a separately-reviewed, sandboxed execution path exists. No hidden CLI execution. AI plans stay plans unless an explicit per-action approval path is built.
- Stale/interrupted runs detected after restart and marked. Optional overnight runs only in ASSESS unless the owner opts a project into a reviewed safe mode.
- **Acceptance:** ASSESS returns a grounded plan via the provider; BUILD/FULL refuse honestly; no `claude` subprocess anywhere.

### P1-3 Per-desktop sessions
- One logical reasoning thread per desktop (stateless HTTP calls with prior-summary as lightweight memory). No CLI/`--resume`. Plan-only.

### P1-4 Burnout detection (metrics-only)
- Detect fatigue from **keystroke timing metrics only** (rate, pauses, correction ratio) — **never key content**. Gentle, non-nagging proactive nudge offering the next step. Must show **"Unavailable — no approved data source"** when no data, never a false "OK."
- Requires explicit enable + visible status.

### P1-5 Keystroke recovery (transparent, local-only)
- Records the owner's own keystrokes to recover text a faulty keyboard wipes. **Hard rules:** disabled by default; **explicit opt-in**; **persistent visible "● RECORDING (local only)" indicator + OS notification**; **easy pause** (e.g., before passwords) + clear; **encrypted at rest**; **never over HTTP raw, never synced, never sent to AI**; auto-retention deletion; **no stealth mode.**
- Ship with an **AutoHotkey backspace-debounce** script to fix the chattering key at the source.

### P1-6 Screenshots context
- Auto-capture after **>1 min** on a desktop (with consent + visible status). Stored **encrypted/OS-protected**, **UUID names**, retention cap, orphan sweep. Auth + object-level access on retrieval. **Never synced.** Used only as allowlisted AI context with consent.

### P1-7 Natural voice
- ElevenLabs (turbo, warm voice) BYOK is the default voice; Web Speech only as an explicit fallback when no key. No robotic default.

### P2-1 Copybook — vertical notes/memories/files; drag-and-drop from across projects; safe local storage.
### P2-2 Todo — task CRUD + persistence; AI may suggest items (labeled).
### P2-3 PDR generator — idea → structured PDR (via provider); save/export markdown.
### P2-4 Prompt inventory — searchable prompt library; copy + add; seeded with useful dev prompts.
### P2-5 Command palette + shortcuts — Ctrl/Cmd+K palette; hotkeys (switch desktop, run assess); quick-launch VS Code/terminal/repo (whitelisted).
### P2-6 Stats HUD — transparent until hover; shows RAM, disk activity, active project (true desktop-overlay needs the native wrapper).
### P2-7 Per-project git stats everywhere — repo URL, branch count, uncommitted/unstaged/untracked, hygiene tips, last-touched.
### P2-8 Backup & restore — mirror a chosen folder to a **dedicated** Hetzner volume over SSH; show date + file inventory + context; reusable config shown; restore verifies a manifest/checksum.
### P2-9 "Waiting on you" — surface real paused AI sessions / finished runs needing input (from owned session/fleet state, not random log scraping).

### P2-10 Central command / multi-machine sync (allowlisted, consent-gated)
- Each `local-agent` → **explicit consent** → **filtered allowlisted metadata** (machine UUID, project name, project status, non-sensitive task progress, last-seen) → **authenticated, encrypted** push → central DB → **Device B pull** → **machine picker** in the dashboard.
- **Never sync** raw clipboard, keystrokes, screenshots, AI prompts, secret-bearing notes, browser data, shell history, recovery codes.
- **Disabled by default** (`CENTRAL_URL` unset) until a **dedicated isolated host** exists, machine enrollment + rotating credentials + TLS + payload schema validation are in place. Consent revocation stops sync immediately.

## 5. Data model (durable)
- **SQLite** as source of truth: WAL mode, transactions, foreign keys, **UUID** primary keys, atomic writes, integrity/corruption detection that **quarantines (never wipes)**, rolling local backups, retention jobs.
- Stores: telemetry timeline, clipboard (redacted preview + hash; optional encrypted raw), sessions, per-desktop briefs, todos, notes/copybook (+ file blobs), prompts, PDRs, screenshots index, autopilot fleet runs, sync machine registry, auth config (secrets encrypted/separate).
- On corruption: preserve original, quarantine copy, surface "storage recovery required," do not auto-overwrite.
- **Acceptance:** concurrent writes lose nothing; crash mid-write doesn't wipe a store; IDs never collide under load.

## 6. Security & privacy (fail-closed)
- **TOTP required** for any non-loopback binding, cloud, LAN, or remote access. Local bypass only on loopback + explicit dev flag + visible banner.
- **Per-route authorization** on every sensitive route (telemetry, clipboard, screenshots, keylog, ai, todos, notes, backups, sync, config, all media/download).
- **CORS allowlist only** — never reflect arbitrary origins; never wildcard-with-credentials.
- Screenshots/keylog/clipboard endpoints: object-level checks; **raw keystrokes never returned over HTTP**; screenshot IDs are UUIDs.
- **Secrets at rest:** redacted preview + hash; encrypted where raw is needed; never in plaintext stores, AI prompts, sync, browser storage, diagnostics, or logs.
- **TOTP setup** via authenticated local flow / provisioning secret (not IP-based, not remote-self-enroll); recovery codes shown once; email fallback (m.masoomi@gmail.com) via proper SMTP (future).
- **Key rotation** is an operator action; the app never embeds or echoes secret values.
- **Never** deploy/sync sensitive Veridian data on the shared commerce VPS.

## 7. Deployment surfaces
- **Local Windows app:** lightweight (WebView2 app-mode launcher now; optional native wrapper later) + the local server; loopback by default; visible capture consent on first run.
- **Cloud dashboard:** dedicated Linux host, nginx + TLS (Let's Encrypt), systemd, non-root service account, TOTP-gated, read-only. Provide reproducible deploy docs/IaC. **Not** the commerce VPS.
- **APK / PWA:** authenticated read-only viewers; no raw sensitive data; no remote control of the local collector.

## 8. UX principles
- Honest states only (Disabled / Not configured / Unavailable / Local-only / Dry-run / Queued / Running / Completed / Failed / Expired / Needs operator action).
- Calm, respectful tone; no flicker; smooth animated tabs; accessible labels + WCAG-AA contrast + keyboard nav + responsive/mobile.
- Destructive actions: confirm + scope + undo where practical.
- Network: timeouts, cancel, offline indicator, "not saved" visibility, safe retries; preserve drafts/tab across refresh (never secrets in browser storage).

## 9. Non-goals
Multi-user/collaboration; replacing email/calendar; any AI provider other than the Anthropic-compatible endpoint; unsupervised permissionless file/command execution; covert/stealth monitoring; syncing sensitive data; deploying sensitive data to shared infrastructure.

## 10. Release gates (must all pass for CONDITIONAL → READY)
1. Exposed credentials rotated (operator) + no raw secrets persisted/echoed.
2. Anthropic-only AI validated, or honestly disabled; no fallbacks/CLI.
3. Fail-closed auth + per-route authz proven.
4. No fake/seed data anywhere (incl. removing dead `loadScenario`).
5. Windows collector vs read-only cloud cleanly separated.
6. Raw clipboard/keystrokes/screenshots/secrets never leave the device.
7. SQLite persistence survives concurrent writes + restart.
8. Capture requires visible consent + status; burnout honest when no data.
9. Sync disabled unless dedicated secure infra; allowlist enforced.
10. Automated + manual acceptance tests (see `docs/preflight/06`, handoff `11`) pass with runtime proof.

## 11. Open questions for the owner (genuine unknowns)
- Data retention windows (clipboard/screenshots/keystrokes/telemetry)?
- Exact cross-device data scope beyond the metadata allowlist?
- Desktop↔project mapping stability (auto-detect vs manual config)?
- Voice/persona preferences (voice id, verbosity)?
- Autonomy ceiling — is any auto-execution ever wanted, and under what review?
- Is the shared commerce VPS ever acceptable, or always a hard block?
- Local-only vs LAN auth boundary preference?

> Cross-references: `docs/preflight/03-findings.md` (defects), `docs/remediation/10-release-verdict.md` (current verdict), `../veridian-opus-handoff/12-OPUS-IMPLEMENTATION-BRIEF.md` (build order), `../veridian-opus-handoff/11-ACCEPTANCE-TESTS.md` (pass criteria).
