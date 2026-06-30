# F11 Applied-Code Reality Check — FIX-TELEMETRY-PARSE

package: FIX-TELEMETRY-PARSE
author_model: cohere/north-mini-code:free (returned snapshot cohere/north-mini-code-20260617:free)
reviewer: Opus gate adjudicating on REAL applied artifacts + REAL runtime evidence
note: the North free model AUTHORED the bundle (BUNDLE_OK, 3 files). It is not reliable as an
independent reviewer (it initially refused to author until handed self-contained inline source),
so the F11 reality check itself is adjudicated by the Opus gate on the actual applied diff and
captured runtime output — not on plans. Author-failure history is on record in
.ai-private/ + ai-evidence/FIX-TELEMETRY-PARSE/model-route-manifest.json.

## Inputs seen (applied state)
- Applied files: telemetry/parse.ts (new, accepted verbatim from bundle File 1),
  tests/telemetry-parse.test.ts (new, bundle File 3 with ASCII-normalized comments),
  server.ts (import + collectTelemetry parse-block replaced).
- The model's bundle File 2 (server.ts unified diff) was REJECTED — it fabricated its context
  (`import … "./server-helpers"`, bogus `@@ -1,5 @@`), which does not exist in the real file.
  The Opus gate applied the minimal real diff against the true anchors instead (same
  "APPROVED WITH REQUIRED PATCH" pattern as MC01/VC02).
- Commands + exit codes: `npx tsc --noEmit` EXIT 0; `npx tsx tests/telemetry-parse.test.ts`
  EXIT 0 (11/11 PASS).
- Runtime (my server, port 3942, loopback, new code — NOT the stale :3000 instance):
  `GET /api/telemetry/current` → 200 application/json, real gitRepo=veridian@branch;
  `GET /api/context/current` → 200 application/json, POPULATED snapshot
  (project veridian@fix/veridian-pretest-release-gates, modifiedCount 13, brief, topRisk MEDIUM,
  waiting[], clipboardSecret=false). Captured: browser-evidence/FIX-TELEMETRY-PARSE/context-runtime-positive.json.

## Checks
1. diff_equals_approved: PASS — only telemetry/parse.ts + tests/telemetry-parse.test.ts +
   the minimal server.ts edit; no real file clobbered (model's fabricated diff was not applied).
2. exit_code_truth: PASS — tsc 0, test 0; no exit-code masking.
3. tsc_clean: PASS (EXIT 0).
4. path_of_claim: PASS — the POSITIVE path actually ran on the new code: /api/context/current
   returned a real populated snapshot (200 JSON), captured to evidence. (First runtime attempt
   was correctly REJECTED as invalid: a stale :3000 server answered with old code / SPA HTML;
   re-run on 3942 proved the new code.)
5. label_reconciliation: PASS — FIX-TELEMETRY-PARSE = RUNTIME VERIFIED (positive path). VC02
   positive path now also PROVEN by the same evidence → VC02 relabel BLOCKED → RUNTIME VERIFIED
   (positive) applied this wave.
6. no_secret_leak: PASS — committed evidence is the context snapshot only (clipboardSecret
   boolean, basename@branch, no abs path). Raw /api/telemetry/current (clipboard + abs path) was
   NOT saved to the repo. Bundle request was redaction-scanned; no secret transmitted.
7. negative_cases: PASS — parseTelemetry returns the unavailable sentinel on empty/whitespace/
   PS-error-text/truncated/array (unit-proven 11/11); routes degrade to honest data, no throw.
8. platform: PASS — BOM strip + Unicode windowTitle handled (live windowTitle had a non-ASCII
   char and parsed fine); fix targets the Windows PowerShell-stdout hazard directly.
9. blast_radius: PASS — L1; one server function + one new pure module + one test. No auth/route/
   secret/git change.
10. evidence_real: PASS — manifest + raw artifact + runtime JSON + this record all exist.

positive_path: PROVEN (browser-evidence/FIX-TELEMETRY-PARSE/context-runtime-positive.json)
negative_path: PROVEN (unit: sentinel on garbage stdout; route try/catch intact)

## VERDICT: F11 PASS — READY TO COMMIT
Commit authorized. VC02 relabel (BLOCKED → RUNTIME VERIFIED positive path) applied in the same wave.
