# Agent Ownership & Locks

Exclusive-writer model: every work package has ONE writer, ONE branch, and (for code) ONE
worktree. No two writers touch the same file concurrently. Research/review agents are
read-only and may run many-concurrent.

## Rules
- A package moves to a writer only after its deps are `VERIFIED`/`IN PROGRESS` and its files
  are not claimed by another active writer.
- Writer branch naming: `wp/<ID>-<slug>` (e.g. `wp/D06-feature-flags`).
- Writer worktree (when needed): `../veridian-wt/<ID>` to avoid clobbering the main tree.
- Claim = add a row below with status `LOCKED`; release on merge → `MERGED`.
- Files forbidden to a writer are listed in its Definition Pack.

## Track ownership
- **DESK** (this session): desktop backend, control-center API, vault integration, Git/repo
  intelligence, AI Debug Fabric, deploy/release logic, shared API contracts.
- **AND** (CLI B): Android app, API client, mobile security/UI, offline, Android tests/release.
- Android may NOT invent backend endpoints. DESK publishes versioned contracts in
  INTERFACE_CONTRACTS.md before AND integrates.
- Neither track overwrites the other's status file (`status/desktop-current.md` /
  `status/android-current.md`).

## Active claims
| Package | Writer | Branch | Worktree | Files (scope) | Status |
|---------|--------|--------|----------|---------------|--------|
| D01 | commander | fix/veridian-pretest-release-gates | main | docs/program-control/** | LOCKED |

(rows added as writers are dispatched)
