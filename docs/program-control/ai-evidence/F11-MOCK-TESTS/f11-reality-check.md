# F11 Applied-Code Reality Check — F11-MOCK-TESTS (self-audit)

package: F11-MOCK-TESTS
author_model: cohere/north-mini-code:free (snapshot cohere/north-mini-code-20260617:free), BUNDLE_OK 2 files
reviewer: Opus gate on applied artifacts (meta: the F11 guard auditing its own delivery)

## Applied
- scripts/ai/f11_check.py (new) — accepted VERBATIM from bundle (all 6 rules + correct precedence
  + safe .get defaults + never-throws; commit_allowed correct).
- scripts/ai/test_f11_reality_check.py (new) — accepted VERBATIM (6 canonical fixtures).

## Checks (applied state)
- diff_equals_approved: PASS — both new files, no real file clobbered.
- exit_code_truth: PASS — `python scripts/ai/test_f11_reality_check.py` → "TOTAL FAILS: 0", EXIT 0.
- tsc: N/A (Python).
- path_of_claim: PASS — the guard is unit-proven on all 6 fixtures including the two incident cases
  (exit1-but-file-written → NOT PASS; negative-only RUNTIME VERIFIED → PASS WITH RELABEL→BLOCKED).
- no_secret_leak: PASS — pure logic, no secrets; evidence redacted.
- blast_radius: PASS — L0, two new standalone files; no app/runtime/auth/git change.
- evidence_real: PASS — manifest + hash + this record exist.

claimed_label for THIS package: LOCAL TESTED (pure deterministic logic; no runtime surface).
f11_verdict on this package's evidence ({command_exit_code:0, secret_in_inputs:False,
diff_clobbers_real_file:False}) → "PASS".

## VERDICT: F11 PASS — READY TO COMMIT
F11 is now mechanically enforceable: f11_check.f11_verdict() encodes the hard rules; the holistic
North/Big-LLM review remains a separate step per F11-REALITY-CHECK-POLICY.md.
