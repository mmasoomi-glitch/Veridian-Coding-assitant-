# Cloud sign-in — Google OR TOTP (parallel), multi-platform ready

The cloud dashboard (`pr.afaq24.store`) accepts **either** of two login methods —
"this or that" — both of which issue the same session cookie:

1. **Sign in with Google** (email allowlist), and
2. **a TOTP code** (authenticator app) — a parallel/override method.

The **local desktop app is unaffected** — it keeps its DPAPI passphrase + TOTP
strong login (offline). These cloud methods only activate where their env vars are
set (i.e., on the cloud server), so they never appear on the local app.

## How each works

**Google:** the browser gets a Google ID token (JWT) → `POST /api/auth/google`
`{ credential }` → server verifies **RS256 signature** against Google's JWKS, then
`iss`, `aud` (must be an allowed client ID), `exp`, `email_verified`, and the
**email allowlist** → issues the `vsess` session cookie. No client secret needed.

**TOTP:** `POST /api/auth/login` `{ code }` → verified against
`VERIDIAN_CLOUD_TOTP_SECRET` → same session cookie. Rate-limited (5 fails → 5 min lock).

Sessions on the cloud are signed with `AUTH_SESSION_SECRET` (the cloud has no DPAPI vault).

## Cloud server env

```
# Google sign-in
GOOGLE_AUTH_CLIENT=<your Web OAuth client ID>.apps.googleusercontent.com
VERIDIAN_GOOGLE_ALLOWED_EMAILS=afaqsubs@gmail.com      # comma-separated allowlist

# Parallel TOTP login + session signing
VERIDIAN_CLOUD_TOTP_SECRET=<base32 secret>            # enroll in your authenticator
AUTH_SESSION_SECRET=<random 32-byte hex>              # signs cloud session cookies
```

These were generated and saved to `C:\Users\HI\Desktop\env\.env` (git-ignored) and
must be set on the cloud server at deploy. The TOTP QR is at
`C:\Users\HI\Desktop\env\veridian-cloud-totp.png`.

## MULTI-PLATFORM (Android / iOS / Linux) — already supported

Each platform needs **its own Google client ID** (Google's rule). The server trusts
a **list** of audiences, so adding a platform later is config-only — no code change:

```
GOOGLE_AUTH_CLIENT=<web client id>
GOOGLE_AUTH_CLIENTS=<android client id>,<ios client id>,<linux/desktop client id>
```

Every platform's native Google Sign-In SDK produces an ID token; the app sends it to
the same `POST /api/auth/google`, and the server accepts it if its `aud` is in the
list and the email is allowed. (Linux desktop can also fall back to the same TOTP
method; DPAPI sealing is Windows-only, with an AES machine-key fallback elsewhere.)

## Google Cloud Console (one-time, Web client)
- **APIs & Services → Credentials → OAuth client → Web application**
- **Authorized JavaScript origins:** `https://pr.afaq24.store`
- **Authorized redirect URIs:** `https://pr.afaq24.store`, `https://pr.afaq24.store/api/auth/google/callback`
- **OAuth consent screen:** External; scopes `openid email profile`; publish or add `afaqsubs@gmail.com` as a test user.
- (A separate "Dev" client with `http://localhost:3000` only if local testing is needed — kept out of the production client.)

## Endpoints
- `GET  /api/auth/status` → adds `google`, `googleClientId`, `cloudTotp`
- `POST /api/auth/google` `{ credential }` → verify ID token → session
- `POST /api/auth/login` `{ code }` (cloud) — TOTP-only parallel login
- (local `{ passphrase, code }` 2FA still served by the same endpoint when a vault exists)

## Files
- `auth/google.ts` — ID-token verification (JWKS RS256, audience list, email allowlist)
- `auth/totp.ts` — cloud TOTP + session-secret fallback + "vault 2FA or cloud TOTP" login
- `src/components/LoginGate.tsx` — Google button + parallel TOTP field (cloud), local 2FA unchanged
- `tests/google-auth.test.ts` — signature + claim + multi-audience verification (13 checks)
