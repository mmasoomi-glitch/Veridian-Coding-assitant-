# MC01 Opus pre-write gate — VERDICT: APPROVED WITH REQUIRED PATCH

Author: deepseek/deepseek-v4-pro (verified via gateway; manifest+hash in this dir).
G1 intent ✅ · G2 practicality ✅ · G3 mobile value ✅ · G4 architecture ⚠️PATCH ·
G5 security ⚠️PATCH · G6 blast-radius ✅ (L0) · G7 UX ✅ · G8 tests ✅ · G9 model-compliance ✅.

## Required patches before apply (Haiku):
A. DO NOT apply DeepSeek's src/components/TabbedApp.tsx — it is a fabricated skeleton
   (imports non-existent ./Dashboard, omits Control Center/Access). Apply ONLY a minimal
   diff to the REAL TabbedApp.tsx: add Home import + FocusNow import; add {id:"home",
   label:"Home",Icon:Home} as FIRST TABS entry; useState("dashboard")->useState("home");
   add `{tab === "home" && <FocusNow apiBase={apiBase} />}` before the dashboard render.
B. focus-summary.ts: project must use the gitRepo BASENAME (strip absolute path) per the
   Definition Pack "no absolute paths". Align the test's fullState/expectation to basename.

Files accepted verbatim: src/components/FocusNow.tsx. Patched: focus-summary.ts, test.
