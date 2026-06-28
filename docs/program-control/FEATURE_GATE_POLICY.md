# FEATURE GATE POLICY

No DeepSeek code-author request without: a complete Feature Intake Pack, a passed
Practicality Gate, and a passed Blast-Radius Gate.

## Feature Intake Pack — `docs/program-control/definition-packs/<package-id>.md`
24 fields: (1) package id+owner (2) feature name (3) current observed problem (4) exact
evidence (5) who is harmed (6) developer/user outcome (7) current impl + code paths
(8) runtime truth: live/simulated/stale/hardcoded/unavailable/unknown (9) architecture+
contracts to preserve (10) existing code to reuse (11) forbidden changes (12) data
sensitivity (13) security/privacy constraints (14) external-action class (15) blast-radius
level (16) what fails if this fails (17) acceptance criteria (18) negative cases (19) runtime
verification method (20) rollback impact (21) exclusive file ownership (22) branch+worktree
(23) required tests (24) independent reviewer.

Must answer: exact pain removed · how it helps act better/faster/safer/clearer · what the
user sees differently · the observable benefit · why better than leaving it alone.

## Practicality Gate (independent Opus) — verdicts:
APPROVE · APPROVE WITH REDUCTION · REWORK DEFINITION · REJECT AS NON-PRACTICAL · MOVE TO DEVELOPER LAB.
Approve only if it does ≥1 of: restores project/task context · guides a concrete next action ·
shows real agent/build/test progress · reduces repetitive work · prevents a risky/incorrect
action · recovers work after interruption · explains a real blocker · improves safe agent
collaboration · makes a real capability visible+controllable. **Never** build panels that
only show raw machine data, fake state, static labels, or simulation controls.

## Blast-Radius Gate
L0 read-only UI/docs · L1 local non-destructive state · L2 local operational behavior ·
L3 external/sync/device/notification/account effect · L4 credentials/vault/auth/system/
destructive/production. Rules: L0–1 proceed after practicality+architecture; L2 needs
security review + rollback plan; L3 needs side-effect controls + test doubles + runtime
evidence; **L4 = preview/design only unless separately authorized.** No package hides its
blast radius; no "quick fix" bypasses this.

## Opus gates after DeepSeek, before Haiku writes (all must = APPROVED FOR APPLY)
G1 intent fidelity · G2 developer usefulness · G3 practicality · G4 architecture · G5
security/privacy · G6 blast-radius · G7 test quality (would tests fail if broken?) · G8 UX/
cognitive-load · G9 model compliance (was it the approved DeepSeek V4 route?).

## No-report-only
Once intake+practicality+blast-radius pass and the route is verified, the SAME wave must
produce a DeepSeek bundle + an Opus verdict + a Haiku apply attempt + a test/runtime artifact
+ a commit (or an explicit evidence-backed BLOCK naming the exact gate + smallest decision).
