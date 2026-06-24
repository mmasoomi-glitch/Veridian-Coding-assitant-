# 05 — Risk Register

> Risks ranked within each class by likelihood × impact. Each maps to finding IDs in `03-findings.md`.

## Data-loss risks
| ID | Risk | Likelihood | Impact | Findings | Mitigation |
|---|---|---|---|---|---|
| DL-1 | Corrupt/truncated JSON read returns `[]` and next write overwrites the whole file → total loss of that store | High (any crash mid-write) | High | F-014 | SQLite or temp+fsync+rename + rolling backups + schema check |
| DL-2 | Concurrent writes (no locking) silently drop records | High (proven: 5 concurrent scratch → 1-2 survive) | High | F-013 | File lock / write queue / SQLite |
| DL-3 | ID collisions on same-millisecond create → silent overwrite | Medium | Medium-High | F-015 | UUID/nanoid |
| DL-4 | Server restart orphans in-flight fleet runs and loses UI drafts; no recovery | High | Medium | F-018 | Stale-run cleanup on boot; persist UI state |
| DL-5 | Backup silently fails / restore unverified → false sense of safety | Medium | High | F-022 | Verify SSH; manifest+checksum on restore |
| DL-6 | Orphaned screenshot/notebook files accumulate, fill disk | Medium | Medium | F-034 | Index-first write; startup orphan sweep |
| DL-7 | No-confirm destructive "Clear" wipes all history in one click | Medium | High | F-016 | Confirmation dialogs |

## Security risks
| ID | Risk | Likelihood | Impact | Findings | Mitigation |
|---|---|---|---|---|---|
| SEC-1 | All data endpoints open by default (auth opt-in, OFF) — clipboard/keystrokes/screenshots/telemetry readable by anyone on the network | High | Critical | F-002 | Require TOTP by default on non-localhost; gate every endpoint |
| SEC-2 | Real `sk-ant-*` key + creds stored plaintext on disk and echoed by AI Ask | Confirmed present | Critical | F-003, F-029 | Rotate key NOW; stop persisting raw values; scrub ask-history |
| SEC-3 | `/api/auth/setup` reachable behind proxy without `trust proxy` → attacker self-enrolls TOTP | Medium | Critical | F-008 | Lock setup post-login/provisioning token; set trust proxy |
| SEC-4 | Keystroke log readable via unauth'd `/api/keylog` (plaintext passwords/code) | High if recording on | Critical | F-010 | Auth/local-only on keylog endpoints |
| SEC-5 | Screenshots downloadable unauth'd via predictable IDs | High | High | F-011 | Auth + random UUIDs + encryption |
| SEC-6 | AI Ask ships private context to 3rd-party LLM (DeepSeek), unauth'd, provider may log | High | High | F-012, F-001 | Auth; prefer local Claude; disclose |
| SEC-7 | Clipboard/keystroke would sync raw to shared commerce VPS if CENTRAL_URL set | Low now (unset) / High if enabled | Critical | F-009, F-038 | Never sync secrets; dedicated VPS; encrypt |
| SEC-8 | CORS reflects any origin → malicious site reads local API while auth off | Medium | High | F-035 | Origin whitelist; require auth |
| SEC-9 | No encryption at rest; co-tenant/Hetzner-staff read | Medium | High | F-037, F-038 | DPAPI/SQLCipher; chmod 600; isolation |
| SEC-10 | TOTP silently disables if `VERIDIAN_AUTH` lost on VPS → cloud fully open | Medium | Critical | F-002 | Fail-closed; startup assertion on remote host |

## Operational risks
| ID | Risk | Likelihood | Impact | Findings | Mitigation |
|---|---|---|---|---|---|
| OPS-1 | Cloud cannot run Windows-only telemetry → "central command" is blind/empty | Certain on Linux | High | F-004 | Split collector/aggregator; document read-only cloud |
| OPS-2 | Wrong AI brain (DeepSeek) ships as default; PDR core requirement unmet | Certain (current state) | High | F-001 | Force `AI_PROVIDER=claude`; remove DeepSeek key |
| OPS-3 | No reproducible deploy (no systemd/nginx/certbot/scripts) | Certain | High | F-019 | Add deploy docs + IaC |
| OPS-4 | No tests / no acceptance plan → blind regressions, undefined readiness | Certain | High | F-005 | Test suite + smoke + acceptance plan (doc 06) |
| OPS-5 | Clean Electron .exe install has no AI/repo config → broken first run | High | Medium-High | F-021, F-020 | First-run wizard; ship template; doc CLI dep |
| OPS-6 | Core features inert by default (burnout/keystrokes/poller not auto-started) | Certain | Medium-High | F-007 | Auto-arm w/ consent or document opt-in clearly |
| OPS-7 | Fleet "overnight" promise impossible (no scheduler) | Certain | Medium | F-023 | Scheduler |
| OPS-8 | Accidental FULL (unsupervised) fleet mode runs | Medium | Medium-High | F-024 | Per-project mode default assess |
| OPS-9 | Offline/network failure invisible; stale UI; no retry | High | Medium | F-025 | Heartbeat/offline badge; backoff |
| OPS-10 | Multi-machine handoff incomplete; machine-id collisions | Low now | Medium | F-031, F-032 | Finish sync; strong UUIDs |
| OPS-11 | Disk growth unbounded (screenshots/clip/keystroke retention) | Medium | Medium | F-033, F-034 | Retention policy; cap-before-write |
