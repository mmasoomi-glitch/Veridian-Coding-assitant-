# 08 — Test Evidence (AI direction)

> Veridian uses a direct Anthropic-compatible provider endpoint for intelligence. It does not use DeepSeek, OpenAI, Gemini, local-model fallbacks, Claude Code CLI, or headless Claude subprocesses.

Historical preflight results (`docs/preflight/*`) are **baseline findings** and must be revalidated against current runtime behavior (see §reclassification in `09`/`10`).

## Automated — `npm run test:ai` (`tests/ai-provider.test.ts`)
```
PASS  TC-AI-04 no forbidden provider/CLI paths in ai/providers.ts
PASS  TC-AI-05 missing config disables AI (no fallback)
PASS  TC-AI-06 unreachable provider => sanitized unavailable (no fabrication)
AI provider tests: 3 passed, 0 failed
```
- **TC-AI-04** static scan of `ai/providers.ts` finds none of: deepseek/openai/gemini/child_process/spawn/`claude -p`/CLAUDE_BIN/CLAUDE_CODE_OAUTH/`--resume`.
- **TC-AI-05** with config removed, `aiConfigured()===false`, `activeProvider()===null`, `chatJSON()` rejects "not configured" — no fallback.
- **TC-AI-06** unreachable endpoint → `validateProvider()` returns `modelAccepted:false` + an `errorCategory` (no fabricated answer).

## Runtime — live endpoints (sanitized)
- `GET /api/db-config` → `apiKeyConfigured:true, aiProvider:"anthropic"`.
- `GET /api/ai/diag` → `{configured:true, reachable:true, modelAccepted:true, errorCategory:null}` (safe synthetic "Reply OK" probe; model `claude-opus-4-8`).
- `POST /api/ai/summarize` with empty telemetry → **honest** brief ("No active task could be determined — all telemetry fields are empty/unknown"); no fabricated project.

## Mapping to required cases
| Case | Status | Evidence |
|---|---|---|
| TC-AI-01 config detected without exposing values | PASS | `db-config` boolean only |
| TC-AI-02 safe synthetic reachability | PASS | `/api/ai/diag` reachable:true |
| TC-AI-03 model `claude-opus-4-8` accepted | PASS | `/api/ai/diag` modelAccepted:true |
| TC-AI-04 no alt provider/CLI callable | PASS (automated) | test + grep clean across `fleet.ts`/`sessions.ts`/`providers.ts` |
| TC-AI-05 missing config disabled | PASS (automated) | test |
| TC-AI-06 failure sanitized, no fabrication | PASS (automated) | test |
| TC-AI-07 autopilot ASSESS uses provider | PASS (runtime) | `/api/fleet/run` assess → provider plan (see 02a/runtime) |
| TC-AI-08 fleet BUILD/FULL no hidden CLI | PASS | `fleet.ts` refuses non-assess; no spawn present |
| TC-AI-09 AI Ask disabled until context allowlist | **OPEN** | context allowlist/secret-scan NOT built; AI Ask must stay off |
| TC-AI-10 no secret in UI/logs/source/docs | PASS | grep clean; diag/db-config return no values |

## Not yet covered by automated tests (remaining)
Auth fail-closed, SQLite durability/concurrency, screenshot/keylog authz, AI-Ask context allowlist. These remain manual/unbuilt — tracked in `09-remaining-risks.md`.
