# F11 — APPLIED-CODE REALITY CHECK POLICY (mandatory)

> Gate node **F11** is the LAST gate before any commit/push. It is run by the North /
> Big-LLM reviewer model acting as an independent reality checker. F11 reviews the
> **ACTUAL applied result** — the staged diff, the real file contents, the real command
> exit codes, the real runtime/evidence, and the truth-labels — **NOT plans, NOT
> proposals, NOT intentions**. F11 can REJECT. **No commit or push may occur unless F11
> returns `PASS` or `PASS WITH RELABEL`.**

## Why F11 exists (incident origin)
The pipeline let two defects through to commit:
1. `scripts/ai/assess_reports.py` exited `1` on a Windows cp1252 `UnicodeEncodeError`
   in a trailing `print()` even though it had already written a valid report — an
   exit code that **lied about success**.
2. VC02 was labeled `RUNTIME VERIFIED` when only its error/negative path
   (HTTP 500 "context unavailable") had run; the positive-data render was never
   runtime-proven (blocked by the telemetry parse bug) and was only unit-tested.

These prove that **passing tests + a reviewer opinion are insufficient** without a final
applied-code, platform, and evidence-consistency check. F11 reconciles claimed labels
against real evidence, and treats a non-zero exit as a real failure unless evidence
proves the work succeeded regardless.

## Position in the pipeline

```
purpose discovery
→ Definition Pack
→ Big-LLM author bundle
→ adversarial critique
→ practicality / security / blast-radius gates
→ controlled apply
→ targeted tests
→ runtime / browser / phone proof
→ independent review
→ ▶ F11 Big-LLM Applied-Code Reality Check ◀
→ safe-stage commit
→ push feature branch
```

F11 is mandatory for **every** wave that produces a diff, including "reports-only" and
"assessment-only" commits.

## EXACT inputs F11 MAY inspect (applied state only)
- The **staged diff** (`scripts/git/safe-stage` output — exactly what will be committed).
- **Current on-disk contents** of every modified integration file (e.g. the `server.ts`
  route block, `lib/context-engine.ts`, the test file) — to confirm the diff was applied
  as approved and did not clobber a real file with a skeleton.
- The exact **test/build commands run + their real exit codes** (tsc, tests, runtime).
- **stdout/stderr summaries** of those commands (redacted).
- **TypeScript / build results** (`npx tsc --noEmit` output + exit code).
- **Runtime / API / browser / ADB evidence** — HTTP status + body, which PATH was
  exercised (**positive vs negative**), browser console, adb launch logs.
- **Truth labels** across the board, reports, handoff, and evidence ledger — checked for
  mutual consistency and consistency with the evidence.
- **Platform assumptions**: Windows console encoding (cp1252/UTF-8), PowerShell behavior,
  path handling, newline/BOM behavior, packaged-app behavior (data-dir, signing).

## F11 MUST NOT inspect (hard exclusion)
Secrets, `.env` / `VERIDIAN_ENV` files, vault contents, API tokens/keys, raw clipboard
content, private/un-redacted logs, the git-ignored `.ai-private/` raw artifacts, and any
telemetry data files. F11 receives only redacted summaries. If any input it is handed
contains secret-shaped content, F11 returns **F11 BLOCKED** (redaction failure) and the
wave does not commit.

## F11 mandatory checks
1. **Diff-equals-approved** — staged diff matches the approved apply plan; no extra files,
   no real file clobbered by a skeleton.
2. **Exit-code truth** — every command's REAL exit code is recorded. A non-zero exit is a
   FAIL **unless** evidence proves the artifact succeeded and only a side-effect failed
   (e.g. a trailing console `print` crash after the file was written) — in which case the
   harness bug is filed and the verdict is **REPAIR REQUIRED**, never a silent PASS.
3. **tsc/build clean** — `npx tsc --noEmit` exit 0, output shown.
4. **Path-of-claim proven** — for every acceptance criterion, evidence shows the ACTUAL
   path that ran. If only the negative/error path ran, the positive path is UNPROVEN and
   the label cannot say `RUNTIME VERIFIED`.
5. **Label reconciliation** — labels on board/reports/handoff/ledger match the evidence on
   the strict ladder `LOCAL TESTED < RUNTIME VERIFIED (positive path) < INTEGRATED <
   DEPLOYED`. Any mismatch ⇒ **RELABEL-REQUIRED**.
6. **No secret/path leak** — diff/output carry no absolute paths, no secret values, no
   tokens; clipboard as boolean only.
7. **Negative cases honored** — degrade honestly (no fake data; honest "unavailable").
8. **Platform assumptions checked** — Windows console encoding, PowerShell parsing,
   CRLF/BOM, Windows path basename, packaged-app data-dir — each proven safe or flagged.
9. **Blast-radius unchanged** — applied diff stays within the declared level.
10. **Evidence is real and redacted** — every cited artifact exists, is redacted, and is
    appended to `EVIDENCE_LEDGER.md`.

## F11 verdicts (returns exactly one)
- **F11 PASS — READY TO COMMIT** — all checks pass; every label fully supported. ⇒ commit.
- **F11 PASS WITH RELABEL — DOCUMENTATION/TRUTH LABEL CORRECTION REQUIRED** — code is
  correct/safe but a label over-claims; F11 names the exact corrected label, which is
  applied **in the same commit**. ⇒ commit only with the corrected labels.
- **F11 REPAIR REQUIRED — RETURN TO REPAIR LOOP** — concrete defect (false exit code,
  clobbered file, broken positive path, missing test). Names the repair. ⇒ NO commit;
  create a focused failure pack and route ONE repair through the approved Big-LLM model
  (the controlled writer does not invent the repair).
- **F11 BLOCKED — EVIDENCE OR PLATFORM PROOF MISSING** — cannot certify reality. ⇒ NO commit.

**COMMIT RULE (hard):** commit/push permitted only on `PASS` or `PASS WITH RELABEL`.

## F11 must itself run truthfully on Windows
Any harness step that prints F11's verdict/evidence MUST force UTF-8
(`sys.stdout.reconfigure(encoding="utf-8")` / `PYTHONIOENCODING=utf-8`) and MUST NOT let a
console-encoding error mask a real result. F11 distinguishes "the work failed" from "the
harness failed to print."

## Schema (F11 evidence record)
Written to `docs/program-control/ai-evidence/<package-id>/f11-reality-check.md`:

```
package: <id>
reviewer_model: <north/big-llm model id>
inputs_seen: [staged-diff, file-contents, test-exit-codes, tsc, runtime-evidence, labels, platform]
checks: { diff_equals_approved, exit_code_truth, tsc_clean, path_of_claim,
          label_reconciliation, no_secret_leak, negative_cases, platform, blast_radius, evidence_real }
verdict: F11 PASS | PASS WITH RELABEL | REPAIR REQUIRED | BLOCKED
required_relabel: <exact label string or N/A>
required_repair: <exact repair or N/A>
positive_path: PROVEN | NOT_PROVEN | N/A
negative_path: PROVEN | NOT_PROVEN | N/A
```

## Mock-test plan (`scripts/ai/test_f11_reality_check.py`, mock-only — canned bundles)
1. **Exit-1-but-file-written** → must NOT PASS; expect REPAIR REQUIRED (file harness bug).
2. **Negative-path-only runtime + "RUNTIME VERIFIED" label** → PASS WITH RELABEL forcing
   the label down to BLOCKED/LOCAL TESTED; assert verdict ≠ plain PASS.
3. **Clobbered real file (skeleton diff)** → REPAIR REQUIRED.
4. **Secret in evidence input** → F11 BLOCKED; commit forbidden.
5. **Clean fixture** (diff matches plan, tsc 0, positive path proven, labels accurate) →
   PASS — READY TO COMMIT.
6. **Commit-gate assertion** → commit allowed ONLY on PASS / PASS WITH RELABEL; the latter
   refuses to commit until the relabel is applied.
7. **Platform fixture** (non-ASCII windowTitle crashing a cp1252 print/JSON.parse) → flags
   the Windows-encoding assumption.

See `FEATURE_GATE_POLICY.md`, `MODEL_EXECUTION_POLICY.md`, `SKILL_ROUTING_POLICY.md`,
`EVIDENCE_LEDGER.md`.
