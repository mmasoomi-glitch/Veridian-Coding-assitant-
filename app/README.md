# Veridian Android Control Client (A01)

A **read-only secure control client** for the Veridian cloud dashboard. It is NOT a root
shell, secret viewer, raw SSH terminal, DB console, or direct AI-provider client.

## What it does
Shows project/repo/branch/risk status, agent progress, context memory, releases, incidents,
device registry, and Veridian voice controls — all by calling the Desktop-published
**versioned API contract** (see `../docs/program-control/INTERFACE_CONTRACTS.md`). It displays
truthful "unavailable" states when an endpoint isn't STABLE yet.

## Stack decision
Mobile client built on the existing Capacitor toolchain already in the Veridian repo
(`@capacitor/*`), so we ship a real APK without a second native toolchain. UI = React +
the shared `contract.ts` types. Auth = Google sign-in / cloud TOTP via the cloud API
(`/api/auth/*`) — the same session cookie; **no secrets stored in the app**.

## Layout
```
app/
  src/contract.ts     # versioned API types (mirror INTERFACE_CONTRACTS)
  src/api-client.ts   # A04 versioned client: error-normalized, truthful unavailable
  src/session.ts      # A02 device registration + session lifecycle (tokens only)
  src/storage.ts      # A03 encrypted local cache policy
  NAV.md              # A05 navigation shell + design system plan
```

## Continue in CLI B
See `../docs/program-control/status/android-current.md` for the launch command and rules.
Hard rules: integrate only against STABLE contracts; no embedded secrets; read-only.
