# Work Package Board — Veridian Orchestrator + Desktop + Android

70 packages (50 Desktop/Backend/Control-Center + 20 Android). Status legend:
`VERIFIED` · `IN PROGRESS` · `BLOCKED` · `UNVERIFIED` (registered, not started) ·
`NOT FOUND` · `DEFERRED(reason)`.

Owner tracks: **DESK** (this session — desktop/backend/control-center) · **AND** (CLI B — Android).
Each writer gets an exclusive branch/worktree (see AGENT_OWNERSHIP.md). No two writers share a file.

## DESKTOP / BACKEND / CONTROL CENTER (D01–D50)

### Foundation & governance
| ID | Title | Status | Deps |
|----|-------|--------|------|
| D01 | Program-control bootstrap + durable shared context | IN PROGRESS | — |
| D02 | Existing architecture & module-reuse map | UNVERIFIED | D01 |
| D03 | Existing encrypted vault capability verification | VERIFIED (auth/vault.ts + lib/dpapi.ts present, DPAPI round-trip + 25-check test pass) | — |
| D04 | Vault threat model & safe-extension plan | UNVERIFIED | D03 |
| D05 | Settings/policy registry data model | UNVERIFIED | D01 |
| D06 | Feature-flag engine + effective-policy resolution | UNVERIFIED | D05 |
| D07 | Agent ownership lock manager | UNVERIFIED | D01 |
| D08 | Work-package board + dependency graph (machine-readable) | UNVERIFIED | D01 |
| D09 | Evidence registry + AI evidence ledger | UNVERIFIED | D01 |
| D10 | Release gate + rollback registry foundation | UNVERIFIED | D08 |

### Vault & secret-reference system
| ID | Title | Status | Deps |
|----|-------|--------|------|
| D11 | Secret-reference registry (metadata only) | UNVERIFIED | D03,D04 |
| D12 | Approved .env discovery WITHOUT executing files | UNVERIFIED | D11 |
| D13 | Secret classification + display-name proposal engine | UNVERIFIED | D12 |
| D14 | Vault import preview + owner approval workflow | UNVERIFIED | D11,D13 |
| D15 | Vault lock/unlock integration boundary | UNVERIFIED | D03 |
| D16 | Runtime injection reference design + impl | UNVERIFIED | D11,D15 |
| D17 | Rotation-state + expiry reminder system | UNVERIFIED | D11 |
| D18 | Vault audit trail, revoke, recovery controls | UNVERIFIED | D15 |
| D19 | Secret leak scanner (source/Git/logs) | UNVERIFIED | D11 |
| D20 | Vault security + authorization negative tests | UNVERIFIED | D14,D15,D18 |

### Git, repository & device intelligence
| ID | Title | Status | Deps |
|----|-------|--------|------|
| D21 | Repository registry | UNVERIFIED | D01 |
| D22 | Branch registry + ancestry mapping | UNVERIFIED | D21 |
| D23 | Worktree registry | UNVERIFIED | D21 |
| D24 | Uncommitted-work scanner + risk classifier | UNVERIFIED | D21 |
| D25 | Unpushed/local-only commit scanner | UNVERIFIED | D21 |
| D26 | Branch-forensics "what exists only here?" analyzer | UNVERIFIED | D22 |
| D27 | Safe sync recommendation engine | UNVERIFIED | D22,D25 |
| D28 | Safe PowerShell sync script design + impl | UNVERIFIED | D27 |
| D29 | Device registry + trusted-device enrollment | UNVERIFIED | D01 |
| D30 | Device-to-project/repo status collector | UNVERIFIED | D21,D29 |

### Context, skills, workflows, agents
| ID | Title | Status | Deps |
|----|-------|--------|------|
| D31 | Context-extraction pipeline (prompts/OCR/chat/docs) | UNVERIFIED | D01 |
| D32 | Context ledger + durable snapshot system | UNVERIFIED | D31 |
| D33 | Skill-discovery candidate engine | UNVERIFIED | D32 |
| D34 | Workflow/template/automation registry | UNVERIFIED | D01 |
| D35 | Skill promotion workflow + versioning | UNVERIFIED | D33,D34 |
| D36 | Agent registry + task lifecycle | UNVERIFIED | D07 |
| D37 | Agent conflict detection + shared-file lock enforcement | UNVERIFIED | D07,D36 |
| D38 | Incident registry + incident→workflow handoff | UNVERIFIED | D01 |
| D39 | Notification policy + risk-alert engine | UNVERIFIED | D24,D38 |
| D40 | Searchable non-secret evidence index | UNVERIFIED | D09 |

### AI Debug Fabric, external tools, control center
| ID | Title | Status | Deps |
|----|-------|--------|------|
| D41 | OpenRouter Debug Skill integration adapter | IN PROGRESS (skill located+live: ~/.claude/skills/veridian) | — |
| D42 | Provider/model routing + policy controls | UNVERIFIED | D41 |
| D43 | Redaction + PII/secret scan + prompt-injection guard | UNVERIFIED | D41 |
| D44 | Budget/rate-limit/timeout/circuit-breaker controls | UNVERIFIED | D42 |
| D45 | External search/tool gateway + permission scopes | UNVERIFIED | D43 |
| D46 | Control Center API + health/readiness endpoints | UNVERIFIED | D01 |
| D47 | Desktop Control Center shell + navigation | UNVERIFIED | D46 |
| D48 | Repository/branch/risk dashboard | UNVERIFIED | D24,D47 |
| D49 | Settings/devices/agents/incident/release UI | UNVERIFIED | D47 |
| D50 | Desktop integration test + security review + release readiness | UNVERIFIED | many |

## ANDROID CLIENT (A01–A20) — owner track AND (CLI B)
| ID | Title | Status | Deps |
|----|-------|--------|------|
| A01 | Android repo/bootstrap + module architecture | UNVERIFIED | — |
| A02 | Secure auth, device registration, session lifecycle | UNVERIFIED | D46,A01 |
| A03 | Encrypted local storage + offline cache policy | UNVERIFIED | A01 |
| A04 | API client + contract versioning + retry + error norm | UNVERIFIED | D46(contract) |
| A05 | Android design system + navigation shell | UNVERIFIED | A01 |
| A06 | Project dashboard + current-priority view | UNVERIFIED | A04,A05 |
| A07 | Repo/branch/worktree/ahead-behind view | UNVERIFIED | A04,D22 |
| A08 | Uncommitted/unpushed risk alerts | UNVERIFIED | A04,D24 |
| A09 | Agent registry/progress/ownership/conflict view | UNVERIFIED | A04,D36 |
| A10 | Context memory/decisions/blockers/next-actions view | UNVERIFIED | A04,D32 |
| A11 | Release center + rollback ref + smoke evidence + approvals | UNVERIFIED | A04,D10 |
| A12 | Incident center + safe recovery visibility | UNVERIFIED | A04,D38 |
| A13 | Settings center (scoped policy visibility) | UNVERIFIED | A04,D05 |
| A14 | Vault status view (configured/missing/stale/rotation only) | UNVERIFIED | A04,D17 |
| A15 | Device registry + trusted devices + current-device | UNVERIFIED | A04,D29 |
| A16 | Veridian voice/mute/proactive controls | UNVERIFIED | A05 |
| A17 | Notifications + urgency + DND + privacy-safe text | UNVERIFIED | A05 |
| A18 | Accessibility + responsive + multilingual readiness | UNVERIFIED | A05 |
| A19 | Android security/offline/contract tests | UNVERIFIED | A02,A03,A04 |
| A20 | Android release evidence + APK build + handoff + rollback | UNVERIFIED | A19 |

## Waves (dispatch order)
- **Wave 0 (now):** D01 D02 D03 D04 D21 D29 D31 D41 D43 D46 · A01 A02 A04 A05
- **Wave 1:** D05 D06 D07 D08 D09 D10 D11 D22 D23 D24 D36 D47 · A03 A06
- **Wave 2:** D12–D20 D25 D26 D27 D28 D30 D32 D33 D34 D35 D37 D38 D39 D40 D42 D44 D45 D48 D49 · A07–A12
- **Wave 3:** D50 · A13–A20
- **Wave 4:** cross-platform contract/security/vault/sync/device/AI-evidence/load tests + release gate
