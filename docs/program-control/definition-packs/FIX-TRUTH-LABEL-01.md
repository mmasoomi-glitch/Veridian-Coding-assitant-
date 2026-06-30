# Definition Pack — FIX-TRUTH-LABEL-01

**Package id:** FIX-TRUTH-LABEL-01
**Owner (writer):** Big-LLM author → Opus gate → controlled apply
**Blast radius:** L0 (read-only sentinel extension + ledger schema + tests; sentinel stays `exit 0`, writes only under `policy-sentinel/`)
**File scope:** `scripts/policy/veridian_policy_sentinel.mjs`, `docs/program-control/EVIDENCE_LEDGER.md`, new `scripts/policy/test_truth_label.mjs` — **disjoint from other waves**
**Status:** READY FOR veridian-develop

## Enforcement verdict (why this package is justified)
**Policy/doc alone CANNOT enforce this** — the label rule already existed as doc guidance
(`CLAUDE.md:15`, `.claude/skills/veridian-develop/SKILL.md:41`) and VC02 was over-labeled
anyway. The V00 sentinel does NOT currently parse truth labels (its checks are git boundary,
dirty/ahead/behind, tracked/staged secrets, unpushed commits, missing route manifests). So a
small **code+test** artifact is required. F11 is the backing policy; this is the mechanical
guard. (Per the user's rule "execute FIX-TRUTH-LABEL-01 only if the policy cannot enforce" —
it cannot, so this executes.)

## Business purpose
Veridian must never present partial failure-path proof as feature runtime success.

## Confirmed defect (file:line)
The over-claim lives in (none schema-validated):
- `reports/VERIDIAN-STATUS-REPORT.txt:38` — "Label: LOCAL TESTED + RUNTIME VERIFIED (error
  path) + INDEPENDENTLY REVIEWED."
- `docs/program-control/browser-evidence/VC02/runtime-result.md:8` — "VERDICT: VC02 = ...
  RUNTIME VERIFIED (error/negative path)."
- `docs/program-control/ai-evidence/VC02/runtime-result.md` (same VERDICT line).
Caught at `reports/PIPELINE-ASSESSMENT.txt:17`. The todo board (`VERIDIAN-TODO-LIST.txt:17`)
already says `[BLOCKED]` — board is consistent; the reports/runtime-result files are where the
false label survives.

## Label vocabulary (closed enum, from SKILL.md:41)
`SCOPED · SCAFFOLDED · IMPLEMENTED-UNTESTED · LOCAL TESTED · RUNTIME VERIFIED ·
INDEPENDENTLY REVIEWED · INTEGRATED · DEPLOYED · BLOCKED`

## Proposed ledger schema (replace free-text Verdict column)
```
| Date | Package | label | positive_path | negative_path | evidence_ref | blocked_by |
```
- `label` ∈ the 9-label enum (validated).
- `positive_path` ∈ { PROVEN | NOT_PROVEN | N/A } — real feature data rendered at runtime.
- `negative_path` ∈ { PROVEN | NOT_PROVEN | N/A } — honest error/unavailable state at runtime.
- `evidence_ref`, `blocked_by` (upstream blocker id).

**Core invariant:** `label = "RUNTIME VERIFIED"` is permitted ONLY if `positive_path = PROVEN`.
If only `negative_path = PROVEN`, the maximum label is `BLOCKED` (or `LOCAL TESTED`). The
string "RUNTIME VERIFIED" — even qualified "(error path)"/"(negative path)" — is FORBIDDEN
when `positive_path ≠ PROVEN`.

## Required outcome
1. Structured ledger record per package (the 7-field schema; or a sibling
   `evidence-ledger.json` the sentinel parses) with the closed enum + the RUNTIME VERIFIED rule.
2. New sentinel check `TRUTH_LABEL` in `veridian_policy_sentinel.mjs` (≈40 lines, read-only,
   reuses existing `git`/`OUT_DIR`/append-`POLICY BLOCKED` machinery): raises
   `POLICY BLOCKED · TRUTH_LABEL` when any record/report says `RUNTIME VERIFIED` (incl.
   "(error path)" variants) while `positive_path ≠ PROVEN`; raises
   `POLICY BLOCKED · LABEL_NOT_IN_VOCAB` for any label outside the enum.
3. VC02 record set to `label=BLOCKED, positive_path=NOT_PROVEN, blocked_by=FIX-TELEMETRY-PARSE`;
   the three over-claim lines corrected to drop "RUNTIME VERIFIED."
4. VC02 unblockable only after telemetry fix AND a live positive-path `evidence_ref`.

## Acceptance tests (`scripts/policy/test_truth_label.mjs`)
- T1 (VC02 regression): `{label:"RUNTIME VERIFIED", positive_path:"NOT_PROVEN",
  negative_path:"PROVEN"}` ⇒ `POLICY BLOCKED · TRUTH_LABEL`.
- T2: `{label:"RUNTIME VERIFIED", positive_path:"PROVEN"}` ⇒ OK.
- T3: `{label:"BLOCKED", positive_path:"NOT_PROVEN", negative_path:"PROVEN"}` ⇒ OK.
- T4 (qualifier loophole): report text `"RUNTIME VERIFIED (error path)"` + positive NOT_PROVEN
  ⇒ `POLICY BLOCKED`.
- T5: `{label:"WORKS"}` ⇒ `POLICY BLOCKED · LABEL_NOT_IN_VOCAB`.
- T6 (read-only contract): sentinel still `exit 0`, writes only under `policy-sentinel/`,
  touches no source.

## Files the writer may touch
`scripts/policy/veridian_policy_sentinel.mjs`, `docs/program-control/EVIDENCE_LEDGER.md`,
`scripts/policy/test_truth_label.mjs` (new). Sentinel must remain read-only (`process.exit(0)`).

## Hard stops
No edits to feature source, auth, or git ops. F11 mandatory before commit.
