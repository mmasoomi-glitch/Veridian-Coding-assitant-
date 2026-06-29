# CLOUD.md — Veridian cloud / deployment policy (read with CLAUDE.md)

The cloud dashboard (`pr.afaq24.store`) is a READ-ONLY aggregation + control surface. It
never receives raw clipboard, keystrokes, screenshots, file contents, absolute paths, or
secrets (F-004 allowlist; cross-device clipboard is E2E ciphertext only).

## Cloud auth
Google sign-in OR cloud TOTP (parallel), admin allowlist (owner = afaqsubs@gmail.com,
permanent). Sessions signed by `AUTH_SESSION_SECRET`. See docs/GOOGLE-SIGNIN.md,
docs/ADMIN-ACCESS.md, docs/STRONG-LOGIN.md.

## Deploy gates (do not deploy unless ALL pass)
no critical dirty worktree · no critical unpushed commit · rollback ref recorded · targeted
tests pass · independent review of the changed slice · health/readiness passes
(`/api/orch/health`) · release notes + evidence exist (RELEASE_LOG.md). Block on broken auth,
secret leakage, data-loss risk, destructive migration, missing rollback, or a failed core test.

## Blast radius L4 (deploy, vault, credentials, production) = preview/design only unless the
owner separately authorizes that exact action. The DeepSeek gateway and any agent may NOT
deploy, rotate credentials, touch the vault, run destructive git, or message customers.

## Cloud env (set at deploy; staged in the git-ignored Desktop env, never committed)
GOOGLE_AUTH_CLIENT · VERIDIAN_GOOGLE_ALLOWED_EMAILS · VERIDIAN_CLOUD_TOTP_SECRET ·
AUTH_SESSION_SECRET · OPENROUTER_API_KEY · VERIDIAN_DEEPSEEK_CODE_MODEL.
