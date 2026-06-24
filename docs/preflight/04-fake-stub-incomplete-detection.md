# 04 — Fake / Stub / Incomplete Detection

> Classification:
> - **A = Fake / fabricated data presented as real** (deception risk)
> - **B = Stub / placeholder / inert** (present in UI/API but does nothing real)
> - **C = Incomplete / half-wired** (partially built, key leg missing)
> - **D = Mislabeled / contradicts stated intent** (works, but not as advertised)

All entries carry `file:line` evidence preserved from the specialist audits and re-verified by the lead auditor where noted.

## A — Fake / fabricated data presented as real
- **A1. Seeded "Mira VPN" workspace as initial state** — `src/App.tsx:70-89` hardcodes `virtualDesktop:"Desktop 2 (Mira VPN Dev)"`, `gitRepo:"mira-vpn"`, `windowTitle:"auth.service.ts"`, `workspacePath:"D:\\MiraVPN"`, fake commit `c6a1b2d3`, fake clipboard secret `eyKey:'v_prod_9921_xzz_k9'`. Shown before real telemetry loads. **Re-verified live in App.tsx.** (F-006)
- **A2. Fake secret string in seed + scenarios** — `src/App.tsx:84` and `loadScenario()` ~`App.tsx:446`; redaction then flags it as a real leaked credential. (F-006)
- **A3. Demo scenario buttons** — `src/components/SensorsSimulator.tsx:46-513` + `loadScenario()` `App.tsx:429-515` inject fake mira-vpn / afaq-os / hacker-news state with no visual "demo" distinction. (F-006)
- **A4. Residual fake data in persisted files** — `desktop-briefs.json` ("Working on auth.service.ts … mira-vpn") and `screenshots-index.json` ("Desktop 2 (Mira vpn)") seed data not wiped. (F-006)

## B — Stub / placeholder / inert
- **B1. Burnout detection** — `autopilot/burnout-store.ts`; `BurnoutNudge.tsx` polls every 30s but live `/api/burnout` → `{"score":0,"level":"ok","reasons":["no data"]}` always, because keystroke metrics never run. Nudge never fires. **Re-verified live.** (F-007)
- **B2. Keystroke recorder auto-start** — `autopilot/keylog-store.ts:97-115` `startRecorder()` only via POST `/api/keylog/start`; no call in `startServer()`. Live `/api/keylog` → `recording:false`. (F-007)
- **B3. Telemetry poller** — `server.ts:295-308` returns immediately if `TELEMETRY_POLL_MS` unset/<5000; background capture inert by default. (F-007)
- **B4. Cloud sync client** — `autopilot/sync-client.ts:19-21` `syncEnabled()` false without `CENTRAL_URL` (unset). `startSyncClient()` is a no-op; central command aggregates nothing. (F-031)
- **B5. MachineSelector** — `src/components/MachineSelector.tsx` stub, not wired to `/api/sync/machines`. (F-031)

## C — Incomplete / half-wired
- **C1. Fleet overnight scheduling** — `autopilot/fleet.ts:120-142` fire-and-forget; no cron/scheduler. HANDOFF "overnight mode" TODO. (F-023)
- **C2. Fleet per-project permission mode** — `AutopilotFleet.tsx:57` global mode only; per-project modes not stored. (F-024)
- **C3. Persistent interactive per-desktop sessions** — HANDOFF #3 TODO; only one-shot fleet runs exist. (workflow matrix)
- **C4. Clipboard restore cross-platform** — `autopilot/clip-history.ts` restore only via Windows `Set-Clipboard`; no Linux path; dashboard widget read-only. (F-040)
- **C5. Backup/restore** — `autopilot/backup.ts` SSH unverified; `/api/backups` empty; restore returns ok without integrity check (`backup.ts:224`). (F-022)
- **C6. Cloud deploy plumbing** — no systemd/nginx/certbot/Dockerfile/deploy script anywhere in repo. (F-019)
- **C7. Electron first-run config** — `electron/main.cjs:82-91` no UI/wizard to set repo dir or API keys; `.env` not shipped. (F-021)
- **C8. APK build** — undocumented, not reproducible, no CI. (F-039 / integration agent)
- **C9. No 401 handling / no UI state persistence** — `TodoTab.tsx:102-111`, `ClipboardTab.tsx:86-100`; React state not persisted (except elevenLabs key `App.tsx:96`). (F-017, F-018)
- **C10. No automated tests** — zero `*.test.*`/`*.spec.*`; no `test` script in `package.json` (re-verified). (F-005)

## D — Mislabeled / contradicts stated intent
- **D1. AI provider is DeepSeek, not Claude Opus** — `ai/providers.ts:16-26` returns `deepseek` (line 24) when `DEEPSEEK_API_KEY` set and `AI_PROVIDER` unset. `.env` comment: "DeepSeek is the fallback / current working provider." UI label `App.tsx:768` "DeepSeek Smart Recall"; App comments `App.tsx:283,328` "Ask DeepSeek". PDR mandates Claude Opus only. **Re-verified: env key present, no AI_PROVIDER.** (F-001)
- **D2. README contradicts intent** — `README.md:18-20` "Set DEEPSEEK_API_KEY" vs `CLAUDE.md:28-33` `AI_PROVIDER=claude`. (F-020)
- **D3. "Natural voice replaces robot"** — falls back to robotic Web Speech without BYOK key (`App.tsx:350-368`). (F-043)
- **D4. "Secrets redacted before persist"** — only the UI *preview* is redacted; raw `value` persisted in `clip-history.json` (`clip-history.ts:148`) AND `clip-counts.json` (`clip-history.ts:113-114`); `sk-ant-*` re-verified present in both plus `ask-history.json`. (F-003, F-029)
- **D5. "Portable .exe = ephemeral"** — data persists in AppData resources; not portable between machines (`electron/main.cjs:32-43`). (F-021)
- **D6. "Proactive burnout nudge"** — feature is opt-in/manual and inert by default (see B1-B3). (F-007)
- **D7. Hardcoded "APK Ready v3.0"** vs `package.json` 0.0.0 (`App.tsx:655`). (F-041)
- **D8. "Central command aggregates machines"** — disabled (CENTRAL_URL unset) and cannot collect on Linux anyway. (F-004, F-031)
