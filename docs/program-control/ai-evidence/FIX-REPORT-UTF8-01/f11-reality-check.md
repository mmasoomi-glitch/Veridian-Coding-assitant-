# F11 Applied-Code Reality Check — FIX-REPORT-UTF8-01

package: FIX-REPORT-UTF8-01
author_model: cohere/north-mini-code:free (snapshot cohere/north-mini-code-20260617:free)
reviewer: Opus gate on applied artifacts + regression proof

## Author attempts (model-route honesty)
- North Mini attempt 1 (self-contained): INVALID — File 1 (assess_reports.py) correct, but File 2
  (gateway unified diff) FABRICATED context (broke the import line, invented a wrong load_key);
  validate_bundle exit 6.
- North Mini attempt 2 (refined self-contained, gateway-diff removed from the ask): files CLEAN and
  correct, BUT validate_bundle still returned exit 6 = "contains TODO/pseudo-code/ellipsis stub".
  ROOT CAUSE = gateway validator FALSE POSITIVE: the regex `\bTODO\b` matched the literal filename
  "VERIDIAN-TODO-LIST.txt" that assess_reports.py must reference (line 23). The bundle is genuinely
  clean. → Opus gate ACCEPT on documented override (same basis as VC02's earlier "..." override).
  DeepSeek fallback NOT triggered (North Mini did produce a valid bundle; only the validator
  over-matched a real filename). Follow-up micro-fix noted: tighten validate_bundle's `\bTODO\b` so a
  filename token does not trip it.

## Applied
- scripts/ai/assess_reports.py — File 1 VERBATIM: reconfigure(utf-8, errors=replace) snippet after
  imports; hash uses content.encode("utf-8"); sys.exit(2)/(4) failure paths preserved.
- scripts/ai/test_report_utf8.py — File 2 VERBATIM, with ONE gate repair: the model's
  `.rstrip('\n')` left a trailing `\r` on Windows (CRLF) causing a false mismatch; changed to
  `.rstrip()` (safe — the test string ends in U+2011, not whitespace). A platform defect F11 exists
  to catch.
- scripts/ai/openrouter_bigllm_bundle.py — controlled apply of the SAME approved reconfigure block
  after the import line (covers the :197 em-dash stderr hazard). Identical to File 1's block; not new logic.

## Checks
- diff_equals_approved: PASS — File 1 + File 2 verbatim (one platform repair); gateway snippet is the
  identical approved block; no real file clobbered.
- exit_code_truth: PASS — `python scripts/ai/test_report_utf8.py` → "test_report_utf8: 2 passed" EXIT 0.
- path_of_claim: PASS (POSITIVE + NEGATIVE both proven at runtime) — script1 (WITH reconfigure) under
  PYTHONIOENCODING=cp1252 → returncode 0, output matches; script2 (WITHOUT) → returncode != 0
  (UnicodeEncodeError), proving the fix is necessary AND sufficient.
- regression: PASS — gateway mock tests `test_bigllm_gateway.py` still pass; `--verify-route` ROUTE_OK
  after my edit; `py_compile assess_reports.py` exit 0.
- no_secret_leak: PASS.
- blast_radius: PASS — L0 dev/evidence scripts only.
- evidence_real: PASS.

f11_check.f11_verdict({command_exit_code:0, secret_in_inputs:False, diff_clobbers_real_file:False}) → "PASS".

## VERDICT: F11 PASS — READY TO COMMIT
A successful report run now exits 0 on cp1252; the cp1252 crash that made exit=1 look like failure is
removed; the failed-output paths (sys.exit 2/4) still exit non-zero (cannot be mistaken for success).
