Return ONLY TypeScript, no prose, no fences. Write a Veridian agent-ownership
lock manager that prevents two writers from editing the same file/dir.

Persistence: atomic JSON to `orchestrator-locks.json` via an injected/imported
`writeJsonAtomic(file, data)` helper. A lock is:

  interface Lock { id: string; owner: string; paths: string[]; acquiredAt: number; ttlMs: number }

API:
- acquire(owner: string, paths: string[], ttlMs?: number): { ok: boolean; id?: string; conflictWith?: string }
    Fails (ok:false, conflictWith = conflicting lock id) if any requested path overlaps an
    UNEXPIRED lock owned by SOMEONE ELSE. A lock owned by the SAME owner never blocks (re-acquire ok).
- release(id: string): boolean
- listLocks(): Lock[]   (only unexpired; expired are cleaned on access)
- isLocked(path: string): boolean   (true iff covered by an unexpired lock)

Path overlap rule: two paths overlap if they are equal OR one is a prefix DIRECTORY of the
other (normalize separators; "a/b" overlaps "a/b/c" but NOT "a/bc").

Requirements: expired locks (acquiredAt + ttlMs <= now) are ignored everywhere and pruned
on every mutating/reading call before logic runs. Default ttlMs if omitted. Generate unique ids.
Keep it small, total, and crash-safe (persist after every mutation).
