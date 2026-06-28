# Android (AND) status — CLI B track

Updated: 2026-06-29

## Worktree / branch
- Worktree: `C:\Users\HI\veridian-android`  (created via `git worktree add`)
- Branch: `wp/android-control`
- Client root: `C:\Users\HI\veridian-android\app\`

## ▶ Launch CLI B (run this in a new terminal to continue the Android track)
```powershell
cd C:\Users\HI\veridian-android ; claude
```
Then in CLI B, first message: "Read docs/program-control/CONTEXT.md, HANDOFF_MEMORY.md,
INTERFACE_CONTRACTS.md, AGENT_OWNERSHIP.md, status/android-current.md. You own the Android
track (A01–A20). Integrate ONLY against STABLE contracts. Continue from the app/ scaffold."

## Scaffolded by commander (this session) — ready for CLI B to extend
- A01 bootstrap: `app/README.md`, `app/package.json`
- A04 API client: `app/src/contract.ts` (mirrors INTERFACE_CONTRACTS v0.1) + `app/src/api-client.ts` (versioned, error-normalized, truthful unavailable states, NO embedded secrets)
- A02 session: `app/src/session.ts` (device-registration/session lifecycle skeleton; tokens only, no secrets)
- A03 storage: `app/src/storage.ts` (encrypted-local-cache policy interface)
- A05 nav/design: `app/NAV.md`

## Hard rules
- Integrate only against STABLE contracts in INTERFACE_CONTRACTS.md. Do not invent endpoints.
- No embedded provider/vault/SSH/GitHub secrets. Display truthful "unavailable" states.
- Read-only control client (not a root shell / secret viewer / raw DB console).

## Active packages: A01–A05 scaffolded (LOCKED to AND-w1). A06+ BLOCKED on STABLE /api/orch/* contracts.
## Blocker: none to scaffold; native APK build continues in CLI B.
