# 10 — Release Verdict (post AI-direction remediation)

> Veridian uses a direct Anthropic-compatible provider endpoint for intelligence. It does not use DeepSeek, OpenAI, Gemini, local-model fallbacks, Claude Code CLI, or headless Claude subprocesses.

## VERDICT: REJECT — NOT READY FOR HUMAN TESTING

The AI direction is now **final and verified**, and the exposed secrets are **contained**. But release-gate criteria remain unmet:

- Auth is **fail-open** locally; sensitive routes (keylog/screenshots/telemetry/todos) lack per-route authz (F-002/010/011).
- Raw secrets are still **retained by design** in clipboard/ask stores (only quarantined, not re-architected) (F-003/029).
- **AI Ask** sends unfiltered context to the provider → must stay **disabled** until allowlist + secret-scan exist (F-012).
- Persistence is **flat-JSON** (race/corruption/timestamp-IDs) (F-013/14/15).
- **Local/cloud split** not implemented; cloud still on the shared commerce VPS (F-004/009/038).
- Test coverage is **AI-only**; auth/storage/e2e untested (F-005).

## What IS done & verified this pass
- Incident containment (secrets quarantined; operator key rotation flagged).
- AI = Anthropic-compatible HTTP only; CLI/DeepSeek/OpenAI/Gemini removed from runtime; validated (`diag` + 3/3 automated tests).
- Fake `currentState` seed removed; AI output honest on empty input.
- Autopilot ASSESS via provider (verified); BUILD/FULL refused (no hidden CLI).

## Conditional-testing posture (informational; verdict still REJECT)
Safe locally: tabbed nav, Todo, Scratch, voice test, **"Where was I?" / fleet ASSESS** (provider-grounded, metadata-only).
Forbidden: **AI Ask** (context leakage), cloud, sync, fleet BUILD/FULL, backup, keystroke/burnout enable, `.exe`/APK distribution, concurrent use.

## Operator actions required (outside repo)
1. Rotate the exposed Anthropic key. 2. Rotate/remove the `DEEPSEEK_API_KEY` Windows User env var. 3. Shred `quarantine/`.

## Next gate order
Gate 2 fail-closed auth → Gate 3 SQLite + redacted-only secret storage → Gate 4 AI-Ask context allowlist → Gate 5 local/cloud split → broaden tests.
