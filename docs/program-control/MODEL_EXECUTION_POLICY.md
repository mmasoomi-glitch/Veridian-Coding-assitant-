# MODEL EXECUTION POLICY (mandatory)

> ## ⛔ UPDATE 2026-06-30 — SUPERSEDES the DeepSeek primary below
> - **Primary Big-LLM code author = `cohere/north-mini-code:free`** (OpenRouter), via the
>   config-driven gateway **`scripts/ai/openrouter_bigllm_bundle.py`** (env `VERIDIAN_BIG_CODE_MODEL`,
>   allowlist `VERIDIAN_BIG_CODE_ALLOWLIST`). The old `openrouter_deepseek_bundle.py` is PRESERVED
>   (backward-compat) but is no longer the primary route.
> - **Verified live 2026-06-30:** `--verify-route` ROUTE_OK; `--preflight` PASS (native json). The
>   alias resolves to the **documented immutable snapshot `cohere/north-mini-code-20260617:free`**
>   (set `VERIDIAN_BIG_CODE_SNAPSHOT` to that; the gateway BLOCKS any other returned model).
> - **Writer = Claude Sonnet OR Haiku** (apply-only; minimal integration diff; never invents logic).
> - **V00 Policy Sentinel** active (docs/program-control/policy-sentinel/). No fallback, no Qwen,
>   no substitution → `MODEL ROUTE BLOCKED`. Commands: `--verify-route`, `--preflight`,
>   `--package-id <ID> --definition-pack <PATH>`. Tests: `scripts/ai/test_bigllm_gateway.py`.

Every feature, repair, redesign, or Android package follows this routing. No exceptions
without explicit owner authorization recorded in DECISIONS.md.

## Roles
- **Claude Opus** — planning, architecture audit, problem adjudication, the practicality /
  security / blast-radius gates, DeepSeek-bundle audit (G1–G9), independent review, release
  decision. Opus does NOT author feature implementation.
- **DeepSeek V4 (via OpenRouter)** — the SOLE code author: complete implementation bundles,
  repair bundles, complete tests, negative tests, exact changed-file list. Reached ONLY
  through `scripts/ai/openrouter_deepseek_bundle.py`.
- **Claude Haiku** — controlled disk writer (apply-only). Applies Opus-approved DeepSeek
  bundles, runs formatter/lint/tsc/tests/safe runtime, makes trivial syntax fixes, commits,
  pushes the feature branch. No architecture/feature invention.
- **Anthropic HTTP provider** — ASSESS ONLY (planning/explanation). Cannot modify files,
  cannot be shown as a build/writing agent, cannot claim a build started.

## Forbidden
Qwen · silent fallback models · unapproved OpenRouter models · Opus-authored feature
implementation · Haiku-invented architecture/business logic · DeepSeek code applied before
Opus gates · model substitution without explicit owner authorization · ad-hoc OpenRouter
calls outside the gateway.

## The route MUST be proven before any code-author call
Gateway: `scripts/ai/openrouter_deepseek_bundle.py`. Before each request it:
- reads the key from env / vault reference (never printed/logged),
- requires `VERIDIAN_DEEPSEEK_CODE_MODEL` (no guessing),
- validates it via live OpenRouter `/models` metadata: must exist, must start with
  `deepseek/`, must match `VERIDIAN_DEEPSEEK_APPROVED_PREFIX` (default `deepseek/deepseek-v4`),
- rejects Qwen / non-DeepSeek / unknown / fallback lists / `route:"fallback"`,
- redaction-scans the outbound request (aborts if it carries a secret),
- sends exactly ONE explicit model (no fallback list),
- verifies the RESPONSE model matches the approved route (substitution → BLOCK),
- writes raw output to a git-ignored private dir; redacted metadata+hash to
  `docs/program-control/ai-evidence/<package-id>/`.

If the route cannot be proven: **MODEL_ROUTE_BLOCKED. No fallback. No Qwen. No substitute. No code writing.**

## Verified routes (live OpenRouter, 2026-06-29)
Approved DeepSeek V4: `deepseek/deepseek-v4-pro` (default code author), `deepseek/deepseek-v4-flash`.
Set `VERIDIAN_DEEPSEEK_CODE_MODEL=deepseek/deepseek-v4-pro`. Tests: `scripts/ai/test_gateway.py`
(mock-only: validates V4, blocks qwen/non-v4/unknown/missing/substitution, redaction abort).

## Config (env / vault reference only — never hardcode keys)
`OPENROUTER_API_KEY` (or `VERIDIAN_ENV`) · `VERIDIAN_DEEPSEEK_CODE_MODEL` ·
`VERIDIAN_OPENROUTER_BASE_URL` · `VERIDIAN_DEEPSEEK_APPROVED_PREFIX` ·
`VERIDIAN_AI_PRIVATE_ARTIFACT_DIR`.

## Note on this session
This Claude Code session is Opus. Haiku-apply and Opus-review are run as subagents with the
matching model. DeepSeek is reachable ONLY via the gateway (it is not a Claude Code subagent
model). Anthropic-HTTP `ai/providers.ts` stays assess-only inside the product.
