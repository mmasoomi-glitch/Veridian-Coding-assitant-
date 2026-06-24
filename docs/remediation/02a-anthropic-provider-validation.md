# 02a — Anthropic Provider Validation (sanitized)

## Variable names detected (NO values shown)
- `ANTHROPIC_BASE_URL` — present (via env / `VERIDIAN_ENV_FILE` = `C:\Users\HI\Desktop\env\.env`)
- `ANTHROPIC_API_KEY` — present (local only; never displayed/committed)
- `ANTHROPIC_MODEL` — resolved to `claude-opus-4-8` (default if unset)

## Implementation
- `ai/providers.ts` rewritten to be **Anthropic-compatible ONLY**. Removed: DeepSeek, OpenAI, Gemini, local-model, and the Claude-CLI shell-out from the application's `chatJSON` path.
- Direct HTTP client → `POST {ANTHROPIC_BASE_URL}/v1/messages` with `x-api-key` + `anthropic-version: 2023-06-01`.
- Provider error bodies are **never echoed** (category only) to avoid leaking sent context.
- `aiConfigured()` / `activeProvider()` gate all AI features; missing config ⇒ AI **DISABLED** (honest), no fallback, no fake heuristic posing as AI.

## Safe synthetic validation result (no personal/business/clipboard/repo content sent)
Probe prompt: `"Reply with the single token: OK"` (system: "connectivity probe"). Endpoint `GET /api/ai/diag`:

```
{ "configured": true, "reachable": true, "modelAccepted": true, "errorCategory": null }
```

Grounding check — `POST /api/ai/summarize` with EMPTY telemetry returned an **honest** brief:
> currentProject: "unknown"; focus: "No active task could be determined — all telemetry fields are empty or unknown"; pending: "No telemetry captured; trigger a fresh state capture"; risks: "Capture returned no signal…"

No fabricated "auth.service.ts"/project content. (Contrast with pre-remediation behavior.)

## Exact sanitized test commands
```
curl http://localhost:3000/api/db-config        # apiKeyConfigured:true, aiProvider:"anthropic"
curl http://localhost:3000/api/ai/diag          # configured/reachable/modelAccepted
curl -X POST http://localhost:3000/api/ai/summarize -H "content-type: application/json" -d "{\"currentState\":{},\"timelineLog\":[]}"
```

## Secret exposure check
- No key value printed in code, logs, UI, diagnostics, or this document. `db-config` returns only a boolean + provider name. `diag` returns only status/category.

## State
**AVAILABLE** — Anthropic-compatible Opus endpoint accepted a safe synthetic request and returns grounded output.

## Remaining (not done this pass)
- `autopilot/fleet.ts` and `autopilot/sessions.ts` still shell out to the `claude` CLI — must be migrated to this provider or disabled (F-001 autopilot leg).
- AI Ask context **allowlist + pre-send secret scan** not yet implemented (Gate 4) — AI Ask should remain **disabled** until that lands.
