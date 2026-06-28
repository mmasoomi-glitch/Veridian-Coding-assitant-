# Admin access control — who may log in

**Model:** whoever holds the cloud **TOTP** secret is the **admin**. The admin gets an
**"Access" panel** to manage the allowlist of people who may sign in with Google.
A Google login is accepted only if the email is on that list.

## Roles
- **admin** — the TOTP holder (and any Google user the admin marks as admin). Sees the
  Access panel; can add/remove people. The local desktop owner (vault passphrase+TOTP)
  is also admin.
- **user** — a Google account on the allowlist with normal access; no Access panel.

The role is carried inside the signed session cookie, so the server can gate admin
actions without a per-request lookup.

## The allowlist
- Stored in `auth-users.json` (atomic write, git-ignored).
- **Seeded once** from `VERIDIAN_GOOGLE_ALLOWED_EMAILS` — those emails become **admins**
  so the owner can get in before adding anyone by hand.
- Each entry: `{ email, role, note?, addedBy, addedAt }`.
- **Last-admin guard:** the system refuses to remove the final admin (no lockout).

## How a login resolves
```
TOTP code            -> session role = admin   (the admin credential)
Local vault (passphrase+TOTP) -> admin         (the desktop owner)
Sign in with Google  -> email must be on the allowlist
                        -> session role = that user's role (admin or user)
                        -> not on the list -> rejected
```

## Admin endpoints (require an admin session)
- `GET    /api/admin/users` → list
- `POST   /api/admin/users` `{ email, role?, note? }` → add/update
- `DELETE /api/admin/users/:email` → remove (blocked for the last admin)

`GET /api/auth/status` now also returns `role` and `email` for the current session;
the UI shows the **Access** tab only when `role === "admin"`.

## Using the panel
Sign in as admin (TOTP) → an **Access** tab appears → add a person's email, pick
**User** or **Admin**, click **Allow**. They can then sign in with Google. Remove anyone
with the inline Remove button (the last admin can't be removed).

## Files
- `auth/users.ts` — allowlist store (seed/list/add/remove/isAllowed/roleFor, last-admin guard)
- `auth/google.ts` — Google verify now checks the store + returns the role
- `auth/totp.ts` — `createSessionToken(role,email)` + `sessionClaims()`
- `server.ts` — `requireAdmin` gate + `/api/admin/users` routes + role in `/api/auth/status`
- `src/components/AdminPanel.tsx`, `TabbedApp.tsx` — the admin-only Access tab
- `tests/admin-users.test.ts` — seeding, add/remove, last-admin guard, role round-trip (16 checks)
