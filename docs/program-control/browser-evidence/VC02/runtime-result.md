# VC02 runtime evidence (2026-06-30, server :3942 loopback)
- /api/context/current → HTTP 500 {"error":"context unavailable"} = SPEC'D honest error state (no fake data).
- ROOT CAUSE (pre-existing, NOT VC02): /api/telemetry/current fails identically with
  "Telemetry parse failure" — server.ts collectTelemetry's JSON.parse(stdout) chokes on the
  PowerShell collector output (windowTitle had a non-ASCII char / stray output). VC02 is unchanged
  upstream; it correctly degrades to "context unavailable" when telemetry fails.
- buildContextSnapshot logic: unit-verified (tests/vc02-context.test.ts 10/10).
- VERDICT: VC02 = LOCAL TESTED + RUNTIME VERIFIED (error/negative path). Positive-data render
  BLOCKED by the pre-existing collector parse bug → new package: fix collectTelemetry JSON parse robustness.
