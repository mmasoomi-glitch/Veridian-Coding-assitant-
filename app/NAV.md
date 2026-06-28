# A05 — Android navigation shell + design system plan

Bottom-nav, dark-cockpit theme matching the desktop (slate-950 base, emerald/cyan accents,
mono labels). Every screen carries the Veridian voice/mute control (A16) and shows truthful
availability states (loading / unavailable / unauthorized / stale-offline).

## Tabs (map to contracts; BLOCKED until each contract is STABLE)
1. **Home** — current project + priority (A06) ← /api/orch/* + context
2. **Repos** — repo/branch/ahead-behind + risk alerts (A07/A08) ← /api/orch/repos, /api/orch/risk
3. **Agents** — registry/progress/ownership (A09) ← /api/orch/agents
4. **Memory** — decisions/blockers/next-actions (A10) ← /api/orch/context
5. **Ops** — releases (A11), incidents (A12), devices (A15), vault status (A14, status-only)
6. **Settings** — scoped policy (A13), voice/mute/DND (A16/A17)

## Design tokens
- color: bg `#020617`, card `#0f172a`, accent `#34d399`/`#22d3ee`, danger `#f43f5e`, warn `#f59e0b`
- risk badges: LOW slate · MEDIUM amber · HIGH orange · CRITICAL rose
- never render a secret/OTP/vault value; vault tab shows only configured/missing/stale/rotation-due

## Auth
Google sign-in / cloud TOTP via cloud `/api/auth/*`; session cookie only; no embedded secrets.
