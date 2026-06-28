Draft returned by the model (reviewed before adoption). Adopted with edits:
- import `writeJsonAtomic` from `../lib/atomic` (repo helper) and use `node:` import specifiers.
- id generator switched to `crypto.randomUUID()` for collision-free ids.
- load existing locks from disk on module init so locks survive a restart.
- prune-then-act ordering kept; persistence after every mutation kept.

```ts
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

interface Lock { id: string; owner: string; paths: string[]; acquiredAt: number; ttlMs: number }

const DEFAULT_TTL_MS = 15 * 60 * 1000;
let locks: Lock[] = [];

function expired(l: Lock, now: number): boolean { return l.acquiredAt + l.ttlMs <= now; }
function prune(now = Date.now()): void { locks = locks.filter((l) => !expired(l, now)); }

function norm(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/g, "");
}
// equal OR one is a prefix DIRECTORY of the other ("a/b" overlaps "a/b/c", not "a/bc")
function overlaps(a: string, b: string): boolean {
  const x = norm(a), y = norm(b);
  if (x === y) return true;
  return x.startsWith(y + "/") || y.startsWith(x + "/");
}

export function acquire(owner: string, paths: string[], ttlMs = DEFAULT_TTL_MS) {
  prune();
  for (const l of locks) {
    if (l.owner === owner) continue;            // same owner never blocks
    for (const want of paths)
      for (const held of l.paths)
        if (overlaps(want, held)) return { ok: false, conflictWith: l.id };
  }
  const lock: Lock = { id: randomUUID(), owner, paths: paths.map(norm), acquiredAt: Date.now(), ttlMs };
  locks.push(lock);
  persist();
  return { ok: true, id: lock.id };
}

export function release(id: string): boolean {
  prune();
  const before = locks.length;
  locks = locks.filter((l) => l.id !== id);
  if (locks.length !== before) { persist(); return true; }
  return false;
}

export function listLocks(): Lock[] { prune(); return locks.slice(); }

export function isLocked(p: string): boolean {
  prune();
  return locks.some((l) => l.paths.some((held) => overlaps(p, held)));
}
```

Review notes: matches D07 spec (same-path + prefix-dir overlap, expired ignored/pruned,
same-owner re-acquire ok, conflictWith returns the blocking lock id). No secrets/PII present.
