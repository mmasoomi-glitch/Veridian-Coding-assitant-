# Android baseline — LAUNCH (2026-06-29) — PHONE RUNTIME VERIFIED (boot + first screen)

## Device (serial redacted)
model A059 · Android 16 (SDK 36) · 1080x2392 @ 420dpi · 1 authorized device

## Result
- adb install -r → **Success** (non-destructive update install; no -g, no uninstall, no data clear)
- launch (monkey LAUNCHER) → app running (pid present)
- backend: server up on PC :3000 + `adb reverse tcp:3000 tcp:3000` set → phone can reach PC loopback
- first screen captured (local only): .android-verify/first-screen.png

## What actually rendered (the truth)
- The **legacy "Veridian Workspace Memory" Dashboard** (App.tsx): tabs Dashboard/Clipboard/AI Ask,
  a "VERIDIAN HEADS-UP HUD" overlay, ⌘K command palette.
- NO login gate shown (PC server has no vault configured + loopback → auth not enforced in this config).
- HUD live values are largely **"unknown"/empty**: ACTIVE PROJECT —, DESKTOP INDEX unknown,
  STAGE CHANGES 0, RAM/CPU/UPTIME blank, ACTIVE: UNKNOWN.

## Verdicts (truthful labels)
- Capacitor APK: **PHONE RUNTIME VERIFIED — BOOT + FIRST SCREEN** (renders, no crash).
- Backend connectivity: **LOCAL BACKEND CONNECTED (via adb reverse)** but dashboard shows mostly
  unknown/empty live data → this is the **legacy simulator-style dashboard**, not the rebuilt assistant.
- Native control client A01–A05: still **SCAFFOLDED ONLY** (this APK is the web wrapper, not that client).
- Crash: none observed in focused logcat.

## What this proves vs. what it doesn't
PROVES: the app builds, installs, launches, and renders on a real phone with a reachable backend.
DOES NOT prove: that the dashboard is a useful assistant — it is the legacy HUD with unknown values.
This is exactly the gap the VC recovery packages (VC02 context engine, VC06 one-next-step,
VC07 live agent cards, VC10 Home rebuild, VC11 Android parity) must close — routed through
veridian-debug → DeepSeek V4 → Opus gates → Haiku apply.

## Privacy: no serial, screenshot, token, or device data committed. Screenshot is in .android-verify/ (git-ignored).
