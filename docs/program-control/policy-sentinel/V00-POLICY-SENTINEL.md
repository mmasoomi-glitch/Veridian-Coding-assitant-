# V00 — Policy Sentinel & Release Commander

Read-only against application feature code. Enforces project truth, model policy, ownership,
Git safety, secrets safety, and release boundaries (VERIDIAN CONSTITUTION §3).

## ⚠️ Schedule status: POLICY SENTINEL SCHEDULE UNAVAILABLE
There is **no continuous background scheduler** running V00 every 10 minutes. This Claude Code
session runs V00 **manually as a gate at the required points** (session start, before each
model request / writer / apply / test / commit / push / branch switch / handoff). The "every
10 minutes while active" cadence is NOT in effect — do not claim continuous watching. To make
it real, a local scheduler/`/loop` must be wired; until then V00 is checkpoint-driven.

## Checks (run at each gate)
project boundary (Veridian only) · active repo+branch · git status · untracked files ·
ahead/behind · worktree ownership · file/dir locks · Definition Pack existence · Big-LLM route
status · model evidence · secret-exposure scan · out-of-scope path edits · test status ·
runtime evidence · truth labels in reports · production-touch risk · handoff-memory freshness ·
stale/duplicate task detection.

## Writes only metadata/evidence to
docs/program-control/policy-sentinel/ · ai-evidence/ · WORK_PACKAGE_BOARD.md · AGENT_OWNERSHIP.md ·
HANDOFF_MEMORY.md.

## Halt verdict: `POLICY BLOCKED`
wrong boundary · missing purpose · missing Definition Pack · unverified route · unapproved
fallback · writer lacks ownership · secret-like data · unsafe git op · unauthorized production
action · stale replay · progress-claim-without-evidence · test misrepresentation · unreviewed
integration point.

## Gate log
| ts | gate | verdict | note |
|----|------|---------|------|
| 2026-06-30 | session start / W00 | PASS | boundary=Veridian; branch=fix/veridian-pretest-release-gates clean; route cohere/north-mini-code:free ROUTE_OK + preflight PASS; rejections OK; safe-stage OK |
