# Strong login — passphrase + TOTP, sealed on-device (Windows DPAPI)

Veridian's login is two-factor and its secret material is sealed to the device the
"proper Windows way" — the same primitive Chrome uses for its tokens.

## The two layers

**1. Login (who gets in) — 2FA**
- **Master passphrase** (something you know) — hashed with `scrypt` (random salt), timing-safe compare.
- **TOTP code** (something you have) — standard authenticator app (otplib), or a one-time **recovery code**.
- **Lockout**: 5 failed attempts → locked 5 minutes (applies even to correct creds during the window).
- **Session**: signed (HMAC-SHA256) `vsess` cookie — `HttpOnly`, `SameSite=Lax`, `Secure` over HTTPS, 7-day expiry.

**2. Key at rest (saved on the device, Chrome-style)**
- All secret material lives in **`veridian.cred`**, sealed with **Windows DPAPI (`CryptProtectData`, CurrentUser scope)** + app entropy.
- The OS binds the ciphertext to your **Windows account** — copy the file to another user or machine and it **cannot be decrypted** (verified: tampered/foreign blobs fail closed).
- Unsealed **once at startup** into memory; never re-typed, never written in plaintext.
- Holds: passphrase hash+salt, TOTP secret, session secret, recovery-code hashes, and the cross-device `syncKey`.
- The sealed `syncKey` is auto-loaded into the environment at boot, so cross-device clipboard "just works" without you setting an env var each launch.
- **Non-Windows fallback**: AES-256-GCM keyed from machine identity (clearly weaker; logged + surfaced in the UI as "fallback (not DPAPI)").

## Flow

```
First run (local only):
  set master passphrase  ─▶  vault generates TOTP secret + recovery codes + session secret
                              seals everything with DPAPI(CurrentUser) → veridian.cred
                              shows QR (scan in authenticator) + recovery codes ONCE → logged in

Every launch:
  startup unseals veridian.cred (your Windows account) → secrets in memory

Login:
  passphrase + TOTP code  ─▶  both verified  ─▶  signed session cookie (7 days)
  (or passphrase + recovery code; recovery codes are single-use)
```

## Enforcement
- Auth is enforced once the vault exists (a strong login was set up), or on any
  network-exposed bind (F-002), or with `VERIDIAN_AUTH=totp`.
- Setup is **local-only** — a network-exposed instance can't be claimed by a stranger.
- Dev bypass: `VERIDIAN_LOCAL_DEV=1` on a loopback bind (for development only).

## Endpoints
- `GET  /api/auth/status` → `{ required, authed, configured, needsSetup, sealing, locked, lockedMs }`
- `POST /api/auth/setup`  `{ passphrase, syncKey? }` (local, once) → QR + one-time recovery codes, logs in
- `POST /api/auth/login`  `{ passphrase, code }` or `{ passphrase, recovery }` → sets session cookie (429 when locked)
- `POST /api/auth/logout`

## Files
- `lib/dpapi.ts` — DPAPI(CurrentUser) seal/unseal via .NET ProtectedData (no native deps)
- `auth/vault.ts` — sealed credential vault (passphrase scrypt, TOTP/session/sync secrets, recovery hashes)
- `auth/totp.ts` — 2FA orchestration: factors, lockout, combined login, session tokens
- UI: `src/components/LoginGate.tsx` — first-run setup, unlock, lockout countdown, sealing indicator
- Tests: `tests/dpapi.test.ts`, `tests/auth-vault.test.ts`

## Recovery / caveats
- **Recovery codes** are shown once at setup — store them safely; each works once.
- Because the vault is bound to your Windows account, **a Windows profile reset / new
  machine means re-running setup** (the old `veridian.cred` can't be unsealed). Keep
  your recovery codes and re-scan the QR on the new profile. This binding is the point.
