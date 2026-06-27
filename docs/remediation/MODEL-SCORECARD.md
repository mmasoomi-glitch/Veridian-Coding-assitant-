# Model fix-loop scorecard — quality vs speed vs accuracy

Bookmark of how each model in the fix chain performs on real Veridian fixes.
Chain order (first to escalate): **owl-alpha (free)** → deepseek-chat → qwen3-coder → claude-sonnet-4.

Scoring (1–5):
- **Speed** — wall-clock for the draft (5 = fastest).
- **Accuracy** — did the output meet the literal spec / compile / pass the runtime check on the FIRST try? (5 = passed verbatim, 0 = wrong).
- **Quality** — code cleanliness, no scope creep, matched house style, no weakened security, returned ONLY code as asked (5 = excellent).
- **Verdict** — APPLIED (passed verify) / ESCALATED (failed, moved to next model) / N/A.

| Date | Issue | Model | Speed (s) | Accuracy /5 | Quality /5 | Followed "code-only" | Verdict | Notes |
|------|-------|-------|-----------|-------------|------------|----------------------|---------|-------|
| 2026-06-22 | F-002 fail-closed auth | deepseek/deepseek-chat | ~ | 5 | 5 | yes | APPLIED | Correct fail-closed middleware on first try; no escalation needed. (pre-owl baseline) |
| 2026-06-28 | F-012 sanitizer | openrouter/owl-alpha | n/a | n/a | n/a | n/a | BLOCKED | HTTP 404 "no endpoints matching your data policy." Owl Alpha is a FREE STEALTH model that logs/trains on prompts; account privacy settings block training-on-data providers. To evaluate it, owner must allow training at openrouter.ai/settings/privacy (one toggle). NOT changed (account setting + privacy stance). Auto-escalated to deepseek. |

| 2026-06-28 | F-012 sanitizer | deepseek/deepseek-chat | 9 | 2 | 3 | yes | ESCALATED | Fast + clean shape, but URL-query rule used `$&` (re-inserted the whole URL incl. token — real leak) and rigid length anchors (sk-{48}, fixed github_pat) miss real keys. Security-critical → escalated to Opus authorship. The loop did its job: review caught the leak. |
| 2026-06-28 | F-012 sanitizer | Opus (reviewer/author) | n/a | 5 | 5 | n/a | APPLIED | Corrected: query actually stripped; flexible anchors; ordered most-specific-first; unit-tested. |

> **Owl Alpha verdict:** can't be evaluated until the owner opts into data-logging in OpenRouter privacy settings. It's free and ~1M ctx, but using it means prompts are logged/trained on — a conscious privacy trade-off for this app. Left to the owner.
