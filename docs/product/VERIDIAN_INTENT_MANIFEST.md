# VERIDIAN INTENT MANIFEST

Veridian exists to tell the owner, truthfully and calmly: where was I · what project am I in ·
what changed · what is running · what is blocked · what needs my decision · what is at risk ·
the ONE best next step. It must be evidence-backed reality, not simulator UI.

Every package must map to ≥1 intent below or be rejected / moved to Developer Lab.

| ID | Intent | Current status |
|----|--------|----------------|
| V-INTENT-01 | Where was I + what project is active | ⬜ NOT BUILT (legacy HUD shows unknowns; MC01 "Focus Now" is a first slice, phone-unverified) |
| V-INTENT-02 | What changed / running / blocked / needs attention | 🟡 data sources exist (telemetry, /api/orch/risk, /api/waiting); no real surface |
| V-INTENT-03 | ONE evidence-backed next step (not a generic list) | ⬜ NOT BUILT |
| V-INTENT-04 | Live agent/job truth + stale/abandoned detection | ⬜ NOT BUILT (fleet is plan-only) |
| V-INTENT-05 | Explainable AI answers (show the safe context used) | ⬜ NOT BUILT (AI-Ask exists; no evidence surfacing) |
| V-INTENT-06 | Calm notifications + voice with visible mute | ⬜ NOT BUILT |
| V-INTENT-07 | Phone as a real command center, no secrets/dangerous controls | 🟡 APK boots; shows legacy dashboard; no command-center surface |
| V-INTENT-08 | Project/Git/branch/worktree/deploy/risk truth visible | 🟡 orchestrator registries exist (LOCAL TESTED); no surfaced UI |
| V-INTENT-09 | Privacy: no raw secret/OTP/clipboard/keystroke/screen/log leakage | ✅ enforced (sanitizers, sealed vault, allowlist sync) |
| V-INTENT-10 | Never fabricate live state / completion / activity / success | ✅ policy active (truthful labels, V00) |

Priority build order: V-INTENT-01/02 (context engine, VC02/MC04) → V-INTENT-03 (one next step,
VC06/MC02) → V-INTENT-04 (live agent truth, VC07/MC03) → V-INTENT-05 (explainable chat) →
V-INTENT-06 (voice/notifications) → V-INTENT-08 (project/git surface) → V-INTENT-07 (phone parity).
