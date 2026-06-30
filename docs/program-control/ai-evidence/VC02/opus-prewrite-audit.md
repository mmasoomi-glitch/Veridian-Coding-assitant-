# VC02 Opus pre-write gate — APPROVED WITH REQUIRED PATCH

Author: cohere/north-mini-code:free → returned cohere/north-mini-code-20260617:free (documented snapshot).
Gateway verdict: BUNDLE_INVALID (regex flagged "..." ) — Opus review: the "..." are DIFF-ELISION in the
File 2/3 patches, NOT code stubs; lib + test + route handler are COMPLETE. Override recorded here.

G1 intent ✅ · G2/G3 practicality+mobile ✅ · G4 architecture ⚠️PATCH · G5 security ✅ (no path/secret;
test asserts no abs path) · G6 blast-radius ✅ (L0) · G7 UX ✅ · G8 tests ✅ (present, type-fix needed) ·
G9 model-compliance ✅ (north-mini-code:free, snapshot documented).

REAL DEFECT: File 3 (src/components/FocusNow.tsx) is a FABRICATED SKELETON (imports Clock/Coffee,
invented structure) — MUST NOT be applied verbatim (would clobber the real MC01 FocusNow). Writer
applies its CONCEPT as a minimal diff to the REAL file.

Apply plan (Sonnet, apply-only):
- lib/context-engine.ts: verbatim from bundle File 1.
- tests/vc02-context.test.ts: from File 4, with `as any` casts on the type-invalid fixtures (activeApp:null,
  gitBranch:undefined, clipboardIsSecret:1, timeline:null, waiting:null) so tsc passes.
- server.ts: add import + the /api/context/current route AFTER the existing /api/telemetry/current handler.
- src/components/FocusNow.tsx: MINIMAL add to the REAL file — ctx state + prevCtxRef + a 10s polling
  useEffect for /api/context/current (credentials include, flicker-guard) + render brief/risk/recent blocks
  above the existing focus card, matching the real dark-cockpit style. Do NOT replace the file.
