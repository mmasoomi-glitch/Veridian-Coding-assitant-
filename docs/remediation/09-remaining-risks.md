# 09 — Remaining Risks & Historical Finding Reclassification

> Veridian uses a direct Anthropic-compatible provider endpoint for intelligence. It does not use DeepSeek, OpenAI, Gemini, local-model fallbacks, Claude Code CLI, or headless Claude subprocesses. Historical preflight results were baseline findings and were revalidated against current runtime.

## Reclassification of key historical findings
| Finding | New status | Evidence |
|---|---|---|
| F-001 wrong AI brain (DeepSeek) | **FIXED — VERIFIED LOCALLY** | Anthropic-only `providers.ts`; `/api/ai/diag` ok; `npm run test:ai` 3/3; grep clean |
| (all) Claude CLI / `--resume` / headless | **OBSOLETE — SUPERSEDED** | `fleet.ts`/`sessions.ts` migrated to HTTP; no `spawn('claude')` remains |
| F-006 fake "Mira VPN" seed | **FIXED — VERIFIED LOCALLY** | `App.tsx` currentState empty; summarize honest on empty telemetry. (dead `loadScenario` remains — see below) |
| F-020 provider doc/runtime contradiction | **FIXED — NEEDS RETEST** | runtime Anthropic; README/CLAUDE/.env.example updated |
| F-003 / F-029 secrets persisted plaintext | **CONTAINED — STILL OPEN (architecture)** | files quarantined; but stores still keep raw values by design until Gate 3 |
| F-012 AI Ask ships context to provider | **STILL OPEN** | no allowlist/secret-scan; AI Ask must remain disabled |
| F-002 auth fail-open | **STILL OPEN** | local `/api/auth/status` required:false; sensitive routes open locally |
| F-010 keylog over HTTP / F-011 screenshot authz | **STILL OPEN** | routes return data without per-route authz |
| F-013/14/15 flat-JSON race/corruption/IDs | **STILL OPEN** | no SQLite/locking |
| F-004 Linux can't run Windows collectors | **STILL OPEN** | no explicit mode split (cloud still combined build) |
| F-005 no tests | **PARTIAL** | AI tests added (`test:ai`); auth/storage/e2e coverage still absent |
| F-009/F-038 cloud on shared commerce VPS | **STILL OPEN — RELEASE BLOCK** | do not deploy/sync sensitive data there |

## Remaining BLOCKERS / CRITICALS (open)
- Fail-open auth on sensitive routes (F-002, F-008, F-010, F-011).
- Raw secrets still retained in clipboard/ask stores by design (F-003/F-029) — only contained, not re-architected.
- AI Ask context allowlist + pre-send secret scan absent (F-012) → **AI Ask stays disabled**.
- Durable storage (SQLite/locking/UUIDs) not implemented (F-013/14/15).
- Local-agent vs cloud-dashboard split not implemented (F-004); cloud still on shared VPS (F-009/038).
- Test breadth (auth/storage/e2e) absent (F-005).

## Deferred (with reason)
- `loadScenario()` in `App.tsx` — dead demo code (no callers; not rendered). Contains stale fake strings. Deferred: unreachable; removal scheduled with the Gate-1 UI cleanup.
