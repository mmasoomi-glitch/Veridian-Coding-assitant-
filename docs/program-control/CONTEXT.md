# CONTEXT — Veridian Program

**Read this + HANDOFF_MEMORY.md before working.** Architecture lives in repo `CLAUDE.md`.

## What Veridian is
A single-owner, Windows-first workspace-memory + command-center + dev orchestrator, plus a
read-only cloud dashboard and an Android control client. "Veridian" is also the assistant
identity: proactive/talkative on trusted private devices, always with a visible mute, and it
NEVER speaks/shows secrets, TOTP codes, passwords, customer PII, payments, or vault contents.

## Owner
afaqsubs@gmail.com — permanent admin/owner. Moves fast, cost-conscious (use the OpenRouter
debug skill for codegen), wants commit-per-unit + memory kept current.

## Primary objective (orchestrator)
Prevent loss/repeat/forgotten/uncommitted work, hidden credentials, orphan branches,
implementation drift, prompt/context loss, repo fragmentation, and AI code that never ships.

## Reuse map (verified — do not duplicate)
vault `auth/vault.ts`+`lib/dpapi.ts` · AI router `ai/providers.ts` + skill
`~/.claude/skills/veridian` · storage `lib/atomic.ts` · sync allowlist
`autopilot/sync-sanitize.ts` · auth/roles `auth/users.ts`/`auth/totp.ts` · clipboard E2E
`lib/sync-crypto.ts`. Memory: `~/.claude/projects/C--Users-HI/memory/`.

## Control-plane files (this dir)
WORK_PACKAGE_BOARD · AGENT_OWNERSHIP · HANDOFF_MEMORY · DECISIONS · INTERFACE_CONTRACTS ·
RELEASE_LOG · INCIDENT_LOG · status/desktop-current.md · status/android-current.md ·
ai-evidence/ (redacted metadata only).
