---
name: veridian-develop
description: Take an APPROVED Definition Pack → DeepSeek V4 complete code bundle (via the central gateway) → Opus gates → Haiku apply → tests → independent Opus review → commit & push. Refuses to start unless the pack, practicality+blast-radius approvals, exclusive ownership, branch/worktree, and the verified DeepSeek V4 route all exist.
---

# veridian-develop (the routed implementation pipeline)

Read first: `CLAUDE.md`, `docs/program-control/MODEL_EXECUTION_POLICY.md`,
`FEATURE_GATE_POLICY.md`, `SKILL_ROUTING_POLICY.md`, `AGENT_OWNERSHIP.md`.

## Preconditions (ALL required, else BLOCKED)
definition pack exists · problem evidence exists · practicality gate PASS · blast-radius
gate PASS · exclusive file ownership assigned · branch + worktree exist · DeepSeek V4 route
verified (`python scripts/ai/openrouter_deepseek_bundle.py --validate-only` → ROUTE_OK).

## Pipeline (model routing is mandatory — see MODEL_EXECUTION_POLICY.md)
1. **Opus** adjudicates the pack + runs practicality + blast-radius gates.
2. **DeepSeek V4** (ONLY via `scripts/ai/openrouter_deepseek_bundle.py`) authors the
   COMPLETE code bundle. No ad-hoc OpenRouter calls. No Qwen/fallback/substitution.
3. **Opus** runs gates G1–G9 (intent, usefulness, practicality, architecture, security,
   blast-radius, test-quality, UX, model-compliance). All must say APPROVED FOR APPLY.
4. **Haiku** applies the approved bundle ONLY (apply-only contract): create/modify the
   approved files, format, fix trivial syntax, run lint/tsc/tests/safe runtime, commit,
   push the feature branch. Haiku may NOT invent logic, change architecture/routing/auth,
   add deps, silence tests, or touch unrelated files. Non-trivial defect → STOP, return to
   DeepSeek via the gateway, re-gate.
5. **Independent Opus** reviewer (not the author) + runtime verifier confirm.

## Evidence (per package, redacted only)
`docs/program-control/ai-evidence/<package-id>/`: definition-pack.md, model-route-manifest.json,
deepseek-request-redacted.md, deepseek-response-hash.txt, deepseek-proposed-files.md,
deepseek-risk-summary.md, opus-*-gate.md, opus-prewrite-audit.md, haiku-apply-log.md,
test-results.md, runtime-evidence.md, independent-review.md, decision.md. Never raw secrets.

## Git
Isolated worktree + feature branch + exclusive ownership + explicit file list (use
`scripts/git/safe-stage`) + targeted tests + independent review + logical commit + push +
rollback note. Forbidden: `git add -A/.`, reset --hard, clean -fd, stash pop, push --force, --no-verify.

## Truthful labels only
SCOPED · SCAFFOLDED · IMPLEMENTED—UNTESTED · LOCAL TESTED · RUNTIME VERIFIED ·
INDEPENDENTLY REVIEWED · INTEGRATED · DEPLOYED · BLOCKED.
