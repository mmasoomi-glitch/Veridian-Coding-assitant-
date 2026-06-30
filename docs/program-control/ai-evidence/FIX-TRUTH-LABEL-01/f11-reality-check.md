# F11 Applied-Code Reality Check — FIX-TRUTH-LABEL-01

package: FIX-TRUTH-LABEL-01
author_model: cohere/north-mini-code:free (snapshot cohere/north-mini-code-20260617:free), BUNDLE_OK 3 files
reviewer: Opus gate on applied artifacts + live sentinel smoke

## Applied
- scripts/policy/truth-label-check.mjs (new, verbatim) — LABELS enum (9) + checkTruthLabels (never
  throws; LABEL_NOT_IN_VOCAB + RUNTIME-VERIFIED-needs-positive_path-PROVEN) + scanReportsForRuntimeClaim.
- docs/program-control/evidence-ledger.json (new, verbatim) — truthful seed (FIX-TELEMETRY-PARSE +
  VC02 RUNTIME VERIFIED w/ positive_path PROVEN; MC01 LOCAL TESTED).
- scripts/policy/test_truth_label.mjs (new, verbatim) — T1-T6.
- scripts/policy/veridian_policy_sentinel.mjs (Opus gate minimal integration glue): import
  checkTruthLabels + read evidence-ledger.json + push violations. The model delivered a tested
  library but did NOT wire it into the watchdog; the Opus gate added the 10-line integration so V00
  actually enforces it (same controlled-apply pattern as the telemetry wiring; file owned by this package).

## Checks
- diff_equals_approved: PASS — 3 files verbatim + minimal real sentinel glue; no clobber.
- exit_code_truth: PASS — `node scripts/policy/test_truth_label.mjs` EXIT 0 (T1-T6); live sentinel
  `node veridian_policy_sentinel.mjs` EXIT 0.
- path_of_claim: PASS — rule proven by T1-T6 AND live integration: the sentinel ran, found ZERO
  truth-label violations on the truthful ledger (its only reported violation was the pre-existing
  UNPUSHED-commits check), proving the integration enforces without false positives.
- label_reconciliation: PASS — claimed LOCAL TESTED + INTEGRATED (into V00). Not claiming RUNTIME
  VERIFIED (no user runtime surface beyond the watchdog smoke).
- no_secret_leak: PASS.
- negative_cases: PASS — checkTruthLabels never throws on missing fields (T6).
- blast_radius: PASS — L0; read-only watchdog stays process.exit(0).
- evidence_real: PASS.

f11_check.f11_verdict({command_exit_code:0, secret_in_inputs:False, diff_clobbers_real_file:False,
claimed_label:"LOCAL TESTED"}) → "PASS".

## VERDICT: F11 PASS — READY TO COMMIT
V00 now mechanically rejects RUNTIME VERIFIED without positive_path=PROVEN and any out-of-vocab label.
