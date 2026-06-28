# Release Log

Each release: date · version · slice · rollback ref · gate result · evidence path.
Release gates (spec §12 Gate D): no critical dirty worktree, no critical unpushed commit,
rollback ref exists, targeted tests pass, independent review of the changed slice, health
passes, release notes + evidence exist. Do NOT block a safe feature on unrelated unfinished
modules; DO block on broken auth, secret leak, data-loss risk, destructive migration,
missing rollback, or a failed core test.

| Date | Version | Slice | Rollback ref | Gate | Evidence |
|------|---------|-------|--------------|------|----------|
| 2026-06-28 | pre-orch baseline | auth/clip-sync/remediation | 444b1bd | n/a (baseline) | docs/remediation/* |
