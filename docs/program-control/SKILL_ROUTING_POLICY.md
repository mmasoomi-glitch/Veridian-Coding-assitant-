# SKILL ROUTING POLICY

Exactly TWO project skills gate all feature/repair work. No duplicate debug/builder/agent/
autopilot/hidden-fallback skills may bypass them.

- **`.claude/skills/veridian-debug`** — read-only assess: reproduce → trace → classify →
  produce a Definition Pack. Ends with READY FOR veridian-develop / BLOCKED / REJECTED /
  MOVE TO DEVELOPER LAB.
- **`.claude/skills/veridian-develop`** — routed implementation: approved pack → DeepSeek V4
  bundle (via the gateway) → Opus gates → Haiku apply → tests → independent review → commit/push.

Flow: every change starts in `veridian-debug`. Only an APPROVED pack enters `veridian-develop`.
`veridian-develop` refuses to start unless all preconditions (pack, practicality+blast-radius
PASS, exclusive ownership, branch/worktree, verified DeepSeek V4 route) exist.

The legacy `~/.claude/skills/veridian` OpenRouter helper remains for ad-hoc Opus assess
queries ONLY; it must NOT be used as the code-author path — code authoring goes through
`scripts/ai/openrouter_deepseek_bundle.py` (the single gateway).

See MODEL_EXECUTION_POLICY.md and FEATURE_GATE_POLICY.md.
