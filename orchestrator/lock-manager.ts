// D07 — Agent ownership lock manager.
//
// Prevents two writers (autopilot fleet sessions, sync, the user) from editing the
// same file/dir at once. A lock claims one or more paths for an owner with a TTL;
// any later acquire that overlaps an UNEXPIRED lock owned by SOMEONE ELSE is denied.
// The same owner re-acquiring its own paths is always allowed (idempotent retries).
//
// Path overlap = the paths are equal OR one is a prefix DIRECTORY of the other
// ("a/b" overlaps "a/b/c" but NOT "a/bc"). Expired locks (acquiredAt + ttlMs <= now)
// are ignored everywhere and pruned on every call before any logic runs.
//
// State is atomically persisted to `orchestrator-locks.json` via writeJsonAtomic
// (tmp + fsync + rename) so a crash never leaves a corrupt lock file, and locks
// survive a server restart (loaded on module init).
//
// Drafted via the OpenRouter prevention-first step; reviewed evidence lives under
// docs/program-control/ai-evidence/D07/.

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { writeJsonAtomic } from "../lib/atomic";

export interface Lock {
  id: string;
  owner: string;
  paths: string[];
  acquiredAt: number;
  ttlMs: number;
}

export interface AcquireResult {
  ok: boolean;
  id?: string;
  conflictWith?: string; // id of the unexpired lock that blocked the acquire
}

const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 min — long enough for an edit, short enough to self-heal
const LOCKS_FILE = path.join(process.cwd(), "orchestrator-locks.json");

function loadLocks(): Lock[] {
  try {
    const raw = JSON.parse(fs.readFileSync(LOCKS_FILE, "utf8"));
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (l): l is Lock =>
        l && typeof l.id === "string" && typeof l.owner === "string" &&
        Array.isArray(l.paths) && typeof l.acquiredAt === "number" && typeof l.ttlMs === "number",
    );
  } catch {
    return [];
  }
}

let locks: Lock[] = loadLocks();

function persist(): void {
  writeJsonAtomic(LOCKS_FILE, locks);
}

function isExpired(l: Lock, now: number): boolean {
  return l.acquiredAt + l.ttlMs <= now;
}

// Remove expired locks before any read/write logic. Persists only if something changed
// (avoid rewriting the file on every read).
function prune(now = Date.now()): void {
  const kept = locks.filter((l) => !isExpired(l, now));
  if (kept.length !== locks.length) {
    locks = kept;
    persist();
  }
}

// Normalize for comparison: forward slashes, no trailing slash. Does not resolve `..`
// (callers pass repo-relative or absolute paths consistently; we compare structurally).
function norm(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/g, "");
}

// equal OR one is a prefix DIRECTORY of the other. The "/" guard stops "a/b" from
// matching "a/bc" while still matching "a/b/c".
function overlaps(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (x === y) return true;
  return x.startsWith(y + "/") || y.startsWith(x + "/");
}

/**
 * Claim `paths` for `owner`. Denied (ok:false, conflictWith=blocking lock id) if any
 * requested path overlaps an unexpired lock held by a DIFFERENT owner. The same owner
 * never blocks itself, so retries are idempotent.
 */
export function acquire(owner: string, paths: string[], ttlMs: number = DEFAULT_TTL_MS): AcquireResult {
  prune();
  for (const lock of locks) {
    if (lock.owner === owner) continue; // same owner never blocks
    for (const want of paths) {
      for (const held of lock.paths) {
        if (overlaps(want, held)) return { ok: false, conflictWith: lock.id };
      }
    }
  }
  const lock: Lock = {
    id: randomUUID(),
    owner,
    paths: paths.map(norm),
    acquiredAt: Date.now(),
    ttlMs,
  };
  locks.push(lock);
  persist();
  return { ok: true, id: lock.id };
}

/** Release a lock by id. Returns true if a lock was removed. */
export function release(id: string): boolean {
  prune();
  const before = locks.length;
  locks = locks.filter((l) => l.id !== id);
  if (locks.length !== before) {
    persist();
    return true;
  }
  return false;
}

/** All currently-held (unexpired) locks. */
export function listLocks(): Lock[] {
  prune();
  return locks.map((l) => ({ ...l, paths: l.paths.slice() }));
}

/** True iff `p` is covered by an unexpired lock (same path or a prefix-dir relationship). */
export function isLocked(p: string): boolean {
  prune();
  return locks.some((l) => l.paths.some((held) => overlaps(p, held)));
}
