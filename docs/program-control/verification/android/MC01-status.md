# MC01 Phone Home (Focus Now) — wave result (2026-06-29)

## Pipeline executed (routed, real)
veridian-debug Definition Pack -> DeepSeek V4 bundle via gateway (deepseek/deepseek-v4-pro;
evidence ai-evidence/MC01, raw local-only) -> Opus gate = APPROVED WITH REQUIRED PATCH
(basename gitRepo; minimal real-TabbedApp diff, NOT DeepSeek's skeleton) -> Haiku apply-only
(3 new files + 5 minimal TabbedApp edits, no clobber) -> tsc 0; focus-summary test 45/45 ->
committed d9d2eb8 (pushed) -> APK rebuilt WITH VITE_API_BASE=http://localhost:3000 (BUILD SUCCESSFUL).

## Truthful labels
- MC01 feature code: LOCAL TESTED (tsc + 45-check unit test). DeepSeek-authored, Opus-gated, Haiku-applied.
- APK: BUILT (backend base baked).
- Phone: NOT phone-runtime-verified — device disconnected during the ~90s build (adb: 0 devices).
  Physical USB drop, not a code failure.

## To finish (owner): reconnect+unlock phone, keep awake, then:
  adb reverse tcp:3000 tcp:3000
  adb install -r android/app/build/outputs/apk/debug/app-debug.apk
  adb shell am force-stop com.veridian.app
  adb shell monkey -p com.veridian.app -c android.intent.category.LAUNCHER 1
Expected: a default "Home" tab with live activeApp/window, gitRepo@branch, modified count,
latest commit, waiting list — or honest "telemetry unavailable". No screenshot captured.
