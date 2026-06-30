# F11 Applied-Code Reality Check — FIX-AI-PROVIDER-PIPELINE

package: FIX-AI-PROVIDER-PIPELINE
author_model: cohere/north-mini-code:free (snapshot cohere/north-mini-code-20260617:free), BUNDLE_OK 2 files
reviewer: Opus gate on applied artifacts + LIVE runtime

## Applied
- ai/providers.ts (rewrite, accepted VERBATIM) — Cfg gains aiPrimary/aiFallback/verify; orCall/anthCall
  helpers; callLLM: openrouter path tries PRIMARY (cohere/north-mini-code:free) then SILENTLY falls back
  to FALLBACK (deepseek/deepseek-chat) on throw OR empty; optional Opus verify (Anthropic) when
  VERIDIAN_AI_VERIFY=1 and anth configured, delivering the candidate if verify fails (never blocks).
  All exports/signatures preserved; keys never put in error messages.
- tests/ai-pipeline.test.ts (accepted, with ONE gate repair) — 6 mock-fetch cases.

## Gate repair (F11 platform/correctness catch)
The model's test helpers withEnv() and withFetchMock() were NON-async and did `return fn()` inside a
try/finally, so `finally` restored env/fetch SYNCHRONOUSLY before the awaited body ran → the mock was
removed before chatJSON fetched → the first run hit the REAL network (red throw). Fixed by making both
helpers `async` and `await fn()`. PRODUCTION code (providers.ts) was untouched by the repair.

## Checks
- diff_equals_approved: PASS — providers.ts verbatim; test verbatim + the async-helper repair; no other file.
- exit_code_truth: PASS — `npx tsc --noEmit` EXIT 0; `tests/ai-pipeline.test.ts` "Failures: 0" EXIT 0;
  regression `tests/ai-provider.test.ts` 3/3 EXIT 0.
- path_of_claim (POSITIVE RUNTIME): PASS — live: validateProvider reachable+modelAccepted true; a real
  chatJSON("capital of Japan") DELIVERED "Tokyo." through North-Mini-primary → DeepSeek-fallback against
  the real OpenRouter key from the desktop .env. RUNTIME VERIFIED (positive).
- no_secret_leak: PASS — orCall/anthCall never include the key in thrown errors (category only); tests use
  "test-key"; the live probe printed no key and was deleted (.ai-private, git-ignored).
- negative_cases: PASS — both-fail throws the last provider error; empty primary → fallback; verify-throws
  → candidate delivered.
- blast_radius: PASS — L1, single module + test; no auth/route/secret change.
- evidence_real: PASS.

f11_check.f11_verdict({command_exit_code:0, tsc_exit:0, secret_in_inputs:False, diff_clobbers_real_file:False,
claimed_label:"RUNTIME VERIFIED", positive_path:"PROVEN"}) → "PASS".

## VERDICT: F11 PASS — READY TO COMMIT
In-product AI now follows the owner pipeline: North Mini → silent DeepSeek fallback → optional Opus verify
→ deliver. Enable Opus verify at runtime with VERIDIAN_AI_VERIFY=1 (+ Anthropic env present).
