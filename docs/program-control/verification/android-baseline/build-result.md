# Android baseline — build + install attempt (2026-06-29)

## Build (REAL, succeeded)
- Build system: Capacitor 6 (web UI wrapped). Project: `veridian/android/` (gradlew).
- Package ID: com.veridian.app  ·  appName "Veridian Companion"  ·  webDir dist
- Command: `npm run build` (vite) → `npx cap sync android` → `gradlew assembleDebug`
- Result: **BUILD SUCCESSFUL in 1m45s**
- Artifact: android/app/build/outputs/apk/debug/app-debug.apk (6,561,239 bytes)
- APK sha256: 102ed824e2d06e2fa1c9c1f449d4a7d61ab901951c9c2511d7cb03bc190dd318
- Branch/commit: fix/veridian-pretest-release-gates @ ff838eb

## Install / launch (BLOCKED — not a software failure)
- ADB: present (v1.0.41 / 37.0.0).
- `adb devices -l`: **0 devices attached.** No phone connected/authorized.
- Verdict: cannot install or launch — PHONE NOT CONNECTED.

## Exact phone action required (owner)
1. Connect the Android phone by USB.
2. On the phone: enable Developer Options → USB debugging.
3. Approve the "Allow USB debugging?" prompt when it appears.
4. Confirm: `adb devices -l` shows exactly one `device` (not `unauthorized`).
Then the (non-destructive) install + launch is one step each:
   adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   adb shell monkey -p com.veridian.app -c android.intent.category.LAUNCHER 1

## Truth labels
- Capacitor APK: **BUILDABLE — LOCAL TESTED (build only)**. NOT phone-runtime-verified (no device).
- Native control client (veridian-android A01–A05): **SCAFFOLDED ONLY** — 4 .ts files + 2 docs;
  NOT a buildable Android project. The installable app is the Capacitor wrapper above.
- Backend connectivity (when launched): will be **CONFIG MISMATCH / BACKEND UNAVAILABLE** until
  VITE_API_BASE points at a reachable host or `adb reverse tcp:3000 tcp:3000` is set with the phone connected.

## No serials, screenshots, tokens, or device data committed (none captured — no device).
