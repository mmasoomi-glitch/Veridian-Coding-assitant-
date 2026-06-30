# Definition Pack — FIX-AI-PROVIDER-PIPELINE

**Package id:** FIX-AI-PROVIDER-PIPELINE
**Owner:** Big-LLM author (North Mini → DeepSeek fallback) → Opus gate → controlled apply
**Blast radius:** L1 (single module ai/providers.ts + test; in-product runtime AI only)
**Status:** READY FOR veridian-develop

## Business purpose
Make the in-product AI (AI Ask, autopilot, PDR, fleet summaries) follow the owner's routing:
**North Mini (cohere/north-mini-code:free) primary → silent fallback to DeepSeek (deepseek/deepseek-chat)
on failure/empty → optional Opus verification (Anthropic claude-opus-4-8) → deliver.** Key comes from
the OpenRouter key in the desktop .env (VERIDIAN_ENV via VERIDIAN_ENV_FILE). Proven live: the key
works, DeepSeek works, North Mini free is intermittently empty (hence the silent fallback).

## Required outcome (ai/providers.ts)
1. Config adds: `aiPrimary` (VERIDIAN_AI_PRIMARY_MODEL or OPENROUTER_PRIMARY_MODEL, default
   "cohere/north-mini-code:free"), `aiFallback` (VERIDIAN_AI_FALLBACK_MODEL or
   OPENROUTER_FALLBACK_MODEL, default "deepseek/deepseek-chat"), `verify` (VERIDIAN_AI_VERIFY === "1").
   Keep OPENROUTER_MODEL as a primary override for back-compat.
2. `callLLM` flow (OpenRouter path): try PRIMARY; if it throws OR returns empty content → silently try
   FALLBACK. Whichever yields non-empty text is the candidate. If both fail → throw category error.
3. Opus verification: if `verify` AND Anthropic is configured (anthBase+anthKey), send the user prompt
   + the candidate answer to the Anthropic model asking it to correct/improve and return the FINAL
   answer; deliver Opus's output. If the Opus call fails → deliver the candidate (never block delivery).
4. Preserve: HTTP-only, keys never logged/returned, error categories only, extractJson for JSON mode,
   activeProvider/aiConfigured/validateProvider semantics.

## Acceptance tests (tests/ai-pipeline.test.ts, tsx, monkeypatched fetch — NO network)
- primary returns text → used, fallback NOT called.
- primary throws → fallback called → fallback text delivered.
- primary returns empty → fallback called.
- both fail → throws.
- verify on + anthropic configured → anthropic called with candidate, its output delivered.
- verify on but anthropic verify throws → candidate still delivered (no throw).
- keys never appear in any thrown message.

## Files the writer may touch
ai/providers.ts (rewrite loadConfig + callLLM only; keep exports/signatures), tests/ai-pipeline.test.ts (new).

## Hard stops
No change to auth/routing/secrets handling. Keys stay in env/.env, never committed. tsc clean. F11 before commit.
