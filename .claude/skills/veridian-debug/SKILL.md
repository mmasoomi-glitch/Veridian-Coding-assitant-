---
name: veridian-debug
description: Reproduce, observe, trace, explain, classify a Veridian defect/feature and produce a repair-ready Definition Pack. READ-ONLY against application code. Use before any feature/repair work; it ends with READY FOR veridian-develop / BLOCKED / REJECTED / MOVE TO DEVELOPER LAB.
---

# veridian-debug (Opus assess — READ-ONLY)

Purpose: turn a vague problem into a **repair-ready Definition Pack**. Never writes
application code, never changes behavior/auth/routing/secrets/vault, never deploys.

Read first: `CLAUDE.md`, `docs/program-control/MODEL_EXECUTION_POLICY.md`,
`FEATURE_GATE_POLICY.md`, `HANDOFF_MEMORY.md`, `AGENT_OWNERSHIP.md`, `WORK_PACKAGE_BOARD.md`.

## May create
diagnostic evidence · reproduction notes · runtime traces · sanitized logs · definition
packs · test plans · redacted DeepSeek request packs · review docs.

## May NOT
apply application code · modify product behavior · change auth/model-routing · write
secrets · change vault · deploy · restart production.

## Fan-out (read-only, max safe)
current-code mapper · runtime/event-flow tracer · problem-evidence analyst · reproduction
agent · security/privacy analyst · blast-radius analyst · test/failure-mode analyst ·
developer-practicality analyst · independent adversarial critic · Opus adjudicator.

## Output (per confirmed issue)
`docs/program-control/definition-packs/<package-id>.md` containing the full 24-field
Definition Pack (see FEATURE_GATE_POLICY.md §Intake). Must answer: what exact pain is
removed · how it helps the dev/user act better/faster/safer · what the user sees
differently · the observable benefit · why it beats leaving the feature alone.

## Hard stops
Do NOT send vague asks ("fix this", "make it smart"). Decorative/simulated/stale/
clutter features → REJECT or MOVE TO DEVELOPER LAB.

## End state (exactly one)
`READY FOR veridian-develop` · `BLOCKED` · `REJECTED AS NON-PRACTICAL` · `MOVE TO DEVELOPER LAB`
