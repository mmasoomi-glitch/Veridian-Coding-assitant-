# F11 Applied-Code Reality Check — Assessment-report commit 511397f (retrospective)

package: ASSESS (status report + todo board + pipeline self-assessment)
reviewer: Opus gate acting as F11 reviewer, on applied evidence (commit 511397f)
run_type: RETROSPECTIVE

## Inputs seen (applied state)
- scripts/ai/assess_reports.py (line 42 writes report `encoding="utf-8"`; line 44 `print(out)`),
  reports/PIPELINE-ASSESSMENT.txt (content full of em dashes / smart quotes),
  reports/VERIDIAN-STATUS-REPORT.txt, reports/VERIDIAN-TODO-LIST.txt.

## Checks
- diff_equals_approved: PASS (reports + assessment match intent).
- exit_code_truth: **FAIL** — `assess_reports.py` wrote a valid report (line 42) then raised
  `UnicodeEncodeError` at `print(out)` (line 44) on the Windows cp1252 console → **exit=1
  despite success**. A non-zero exit that lies about outcome is a real harness defect (F11
  mandatory check #2). It could (and did) mislead the pipeline about success/failure.
- tsc_clean: N/A (Python).
- path_of_claim: PASS (the report content/analysis is sound; the VC02 over-claim it surfaced is
  handled under VC02 F11 + FIX-TRUTH-LABEL-01).
- platform: **FAIL** — Windows console encoding assumption (cp1252) was not handled; no
  `sys.stdout.reconfigure(encoding="utf-8")`.
- no_secret_leak: PASS (redaction scan ran; no secret sent).
- evidence_real: PASS.

## VERDICT: F11 REPAIR REQUIRED

Not BLOCKED (the report content is valid and the analysis is sound) — a concrete, named repair.

### Required repair (exact) → routed as FIX-REPORT-UTF8-01
In `scripts/ai/assess_reports.py`, force UTF-8 stdout/stderr before any `print`
(`sys.stdout.reconfigure(encoding="utf-8", errors="replace")` + same for stderr; and/or
`PYTHONIOENCODING=utf-8` in the harness) so the trailing `print(out)` cannot raise on a cp1252
console and the exit code reflects the real outcome (report written ⇒ exit 0). Apply the same to
`openrouter_bigllm_bundle.py` (`:197` literal em dash). Add the regression fixtures (mock test
#1 + A1–A5) so exit-code truth is guarded. Only after the repair re-runs showing exit 0 may a
commit touching this script be authorized.
