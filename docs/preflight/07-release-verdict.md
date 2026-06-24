# 07 — Release Verdict

## VERDICT

**REJECT — NOT READY FOR HUMAN TESTING**

## Gate rationale
The rejection rules are triggered on multiple independent grounds — any one is sufficient:

1. **BLOCKERs and CRITICALs exist.** 11 BLOCKER and 11 CRITICAL findings (see counts). Rule: REJECT if any BLOCKER or CRITICAL exists.
2. **Main workflow unproven / wrong.** The flagship "telemetry → AI brief / AI Ask / autopilot" workflow runs on **DeepSeek**, not the PDR-mandated **Claude Opus** (F-001). The PDR explicitly says "do NOT implement DeepSeek." The core promise is therefore unmet and the "intelligence" leg is the wrong, mocked-relative-to-intent integration.
3. **Required integration mocked / inert.** Burnout detection and keystroke capture are inert by default (always `level:"ok"`, recorder not auto-started) — F-007. Cloud "central command" aggregates nothing (CENTRAL_URL unset and Linux cannot run the collectors) — F-004/F-031.
4. **Data does not reliably survive restart.** Corrupt/truncated JSON silently truncates the whole store on next write; concurrent writes lose data (proven: 5 concurrent scratch saves → 1-2 survive) — F-013/F-014.
5. **Cannot install from docs.** No reproducible cloud deploy (no systemd/nginx/certbot/scripts), README contradicts intent on the AI provider, and the Electron .exe has no first-run configuration — F-019/F-020/F-021.
6. **No acceptance test plan / no automated tests existed before this audit.** Zero `*.test.*`, no `test` script, no CI — F-005.
7. **Security is fail-open.** All data endpoints are unauthenticated by default; real `sk-ant-*` secrets are persisted in plaintext and echoed back by AI Ask — F-002/F-003.

Independently, the **fake "Mira VPN" seeded state** (F-006) directly violates the owner's stated requirement that nothing fake be presented as real, and is shown on first load.

## Counts
- Specialist agents synthesized: **10**
- Deduped findings: **45** (F-001 … F-045)
- By final severity:
  - **BLOCKER: 11** (F-001, F-002, F-003, F-004, F-005, F-006, F-007, F-008?→ see note, F-009, F-010, F-011 — note: F-008–F-012 are CRITICAL; the 11 BLOCKERs are F-001, F-002, F-003, F-004, F-005, F-006, F-007, F-019, F-020, F-021, F-029)
  - **CRITICAL: 11** (F-008, F-009, F-010, F-011, F-012, F-013, F-014, F-015, F-016, F-017, F-018)
  - **MAJOR: 18** (F-022 … F-040 excluding none in that band: F-022, F-023, F-024, F-025, F-026, F-027, F-028, F-030, F-031, F-032, F-033, F-034, F-035, F-036, F-037, F-038, F-039, F-040)
  - **MINOR: 5** (F-041, F-042, F-043, F-044, F-045)
- Release gates among findings: REJECT-gated: 16; CONDITIONAL: 24; OK: 5.

## Workflows SAFE to test now (local Windows, read-only, with no secrets in clipboard)
- Tabbed UI navigation (TG-17)
- Todo CRUD + persistence (TG-7) — avoid relying on empty-input validation
- Scratch buffer single-user (TG-8) — avoid concurrent stress
- Voice narration / Web Speech fallback (TG-16)
- Autopilot fleet **ASSESS mode only** (TG-3) — read-only, no file changes
- Desktop briefs read (TG-4), screenshots **local-only** viewing (TG-6), clipboard display (TG-5) — with the explicit understanding that secrets are still stored raw on disk until F-003 is fixed.

## Workflows that MUST NOT be tested yet
- Any **cloud / `pr.afaq24.store`** usage (F-002/F-004/F-008) — unauthenticated, blind, proxy-bypass risk.
- **AI brief / AI Ask** as a trust signal (F-001/F-003/F-012) — wrong brain + secret leakage.
- **Burnout** (F-007) — inert; will mislead.
- **Backup/restore** (F-022) — silent failure, unverified restore.
- **Sync / central command / enabling CENTRAL_URL** (F-004/F-009) — would push secrets to a shared production box.
- **Autopilot fleet BUILD / FULL** (F-024) — unsupervised changes, no per-project guardrail surfaced.
- **Electron .exe / APK** distribution (F-021) — broken/unconfigured clean install.
- **Concurrent / multi-instance** anything (F-013/F-014) — data corruption.

## Repair order (highest risk first)
1. **Rotate the exposed `sk-ant-...` Anthropic key immediately**; stop persisting raw clipboard `value`; scrub `clip-history.json`/`clip-counts.json`/`ask-history.json` (F-003, F-029, SEC-2).
2. **Make auth fail-closed**: require TOTP on any non-localhost deploy; gate every data endpoint; fix the `/api/auth/setup` proxy bypass (`trust proxy`, lock setup) (F-002, F-008, SEC-1/3/10).
3. **Fix the AI brain**: set `AI_PROVIDER=claude`, remove `DEEPSEEK_API_KEY`, verify Claude CLI; relabel UI/comments; startup assertion (F-001, F-020).
4. **Harden persistence**: SQLite or temp+fsync+rename + file locking + UUID ids + crash-safe reads + rolling backups (F-013, F-014, F-015).
5. **Remove fake seed data**: empty initial state, gate/remove demo scenarios, wipe seeded JSON (F-006).
6. **Fix the cloud architecture**: split Windows collector from Linux read-only aggregator; document that cloud cannot collect; do not enable clipboard/keystroke sync (F-004, F-009, F-031).
7. **Auto-start (with consent) or honestly document** burnout/keystroke/poller so they are not silently inert (F-007).
8. **Secure exposed sensitive endpoints**: auth + random IDs + at-rest encryption for keylog/screenshots/ask (F-010, F-011, F-012, F-037).
9. **Add tests + smoke + CI** and adopt this audit's `06` as the interim acceptance plan (F-005).
10. **Make it installable**: deploy docs/IaC (systemd/nginx/certbot), Electron first-run config, fix README (F-019, F-021, F-020).
11. **Destructive-action confirms, 401 handling, UI state persistence, offline indicator** (F-016, F-017, F-018, F-025).
12. **Input validation, backup integrity, fleet scheduling + per-project modes** (F-026, F-022, F-023, F-024).
13. **Accessibility (labels, contrast), UX polish, retention/cap-before-write, secondary leaks** (F-027, F-028, F-033, F-034, F-039, F-040, and remaining MINORs).
