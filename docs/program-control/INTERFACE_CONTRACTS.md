# Interface Contracts (versioned) — DESK publishes, AND consumes

Android (AND) integrates ONLY against contracts published here. DESK must bump the version
on any breaking change. No endpoint is "live for Android" until it appears here as `STABLE`.

## Convention
- Version: `v<major>.<minor>`; breaking = major bump.
- Each contract: method, path, auth, request, response, errors, status (DRAFT/STABLE/DEPRECATED).

## Existing auth/status surface (already implemented — baseline v0.1, STABLE)
- `GET /api/auth/status` → `{ required, authed, role, email, configured, needsSetup, sealing, google, googleClientId, cloudTotp, locked, lockedMs }`
- `POST /api/auth/login` `{ passphrase?, code, recovery? }` → `{ ok }` | 401/429 `{ error, lockedMs }`
- `POST /api/auth/google` `{ credential }` → `{ ok, email, role }`
- `GET /api/admin/users` · `POST /api/admin/users` · `DELETE /api/admin/users/:email` (admin)
- `GET /api/admin/team` → `{ owner, members, total, solo }`

## Orchestrator contracts (to be published as packages land)
- `GET /api/orch/health` (D46) — DRAFT
- `GET /api/orch/repos` (D21) — DRAFT
- `GET /api/orch/risk` (D24) — DRAFT
- `GET /api/orch/devices` (D29/D30) — DRAFT
- `GET /api/orch/agents` (D36) — DRAFT
- `GET /api/orch/context` (D32) — DRAFT
- `GET /api/flags` · `POST /api/flags` (D06, admin) — DRAFT
- `GET /api/orch/secrets` (D11, reference metadata only) — DRAFT

Android packages A06–A15 each name the contract(s) they depend on; they stay BLOCKED until
the contract is STABLE here.
