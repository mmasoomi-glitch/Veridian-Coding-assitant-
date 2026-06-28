// D07 lock-manager verification. Run: npx tsx tests/d07-locks.test.ts
//
// Exercises: acquire ok, conflicting overlap denied, prefix-dir overlap denied,
// release frees, expired lock ignored, same-owner re-acquire ok.
// Backs up and restores orchestrator-locks.json; leaves no stray tmp files.

import fs from "node:fs";
import path from "node:path";

const LOCKS_FILE = path.join(process.cwd(), "orchestrator-locks.json");

// Snapshot any real lock file so we can restore the dev machine afterwards.
const backup = fs.existsSync(LOCKS_FILE) ? fs.readFileSync(LOCKS_FILE, "utf8") : null;
// Start from a clean slate BEFORE importing (the module loads locks on init).
try { fs.unlinkSync(LOCKS_FILE); } catch { /* none */ }

let fail = 0;
const ok = (n: string, c: boolean) => { console.log((c ? "  ok   " : "  FAIL ") + n); if (!c) fail++; };

function restore() {
  try {
    if (backup !== null) fs.writeFileSync(LOCKS_FILE, backup);
    else if (fs.existsSync(LOCKS_FILE)) fs.unlinkSync(LOCKS_FILE);
  } catch { /* best effort */ }
  // no stray atomic tmp files in cwd
  const strays = fs.readdirSync(process.cwd()).filter((n) => n.includes("orchestrator-locks.json.") && n.includes(".tmp"));
  if (strays.length) { console.error("FAIL stray tmp files:", strays); fail++; }
}

const lm = await import("../orchestrator/lock-manager");

// 1) acquire ok
const a = lm.acquire("alice", ["src/app.ts"]);
ok("acquire ok returns id", a.ok === true && typeof a.id === "string");
ok("isLocked sees the acquired path", lm.isLocked("src/app.ts") === true);
ok("listLocks has one lock", lm.listLocks().length === 1);

// 2) conflicting overlap denied (same exact path, different owner)
const b = lm.acquire("bob", ["src/app.ts"]);
ok("conflicting overlap denied", b.ok === false);
ok("conflict reports the blocking lock id", b.conflictWith === a.id);

// 3) prefix-dir overlap denied (held file under a requested dir, different owner)
const c = lm.acquire("carol", ["src"]);
ok("prefix-dir overlap denied (dir over held file)", c.ok === false && c.conflictWith === a.id);
// and the reverse direction: held dir, requested deeper file
const d1 = lm.acquire("dave", ["lib"]); // dave holds the lib/ dir
ok("dave acquires lib/ dir", d1.ok === true);
const d2 = lm.acquire("erin", ["lib/atomic.ts"]); // erin wants a file inside it
ok("file under held dir denied", d2.ok === false && d2.conflictWith === d1.id);
// sibling-prefix string must NOT collide: "lib" should not block "library/x"
const d3 = lm.acquire("frank", ["library/x.ts"]);
ok("non-dir prefix does NOT collide (lib vs library)", d3.ok === true);

// 4) release frees the path
ok("release returns true", lm.release(a.id!) === true);
ok("path free after release", lm.isLocked("src/app.ts") === false);
const reb = lm.acquire("bob", ["src/app.ts"]);
ok("bob can now acquire freed path", reb.ok === true);
ok("release of unknown id returns false", lm.release("no-such-id") === false);

// 5) expired lock ignored / pruned
const exp = lm.acquire("ghost", ["temp/expired.ts"], 5); // 5ms ttl
ok("short-ttl lock acquired", exp.ok === true);
const wait = Date.now() + 20; while (Date.now() < wait) { /* busy-wait past ttl */ }
ok("expired lock not reported by isLocked", lm.isLocked("temp/expired.ts") === false);
ok("expired lock pruned from listLocks", lm.listLocks().every((l) => l.id !== exp.id));
const after = lm.acquire("hugo", ["temp/expired.ts"]);
ok("another owner can acquire the expired path", after.ok === true);

// 6) re-acquire by the SAME owner over its own path is allowed (idempotent retry)
const own1 = lm.acquire("ivy", ["proj/x"]);
ok("ivy acquires proj/x", own1.ok === true);
const own2 = lm.acquire("ivy", ["proj/x"]); // exact same path, same owner
ok("same owner re-acquire (same path) ok", own2.ok === true);
const own3 = lm.acquire("ivy", ["proj/x/deeper.ts"]); // overlapping, same owner
ok("same owner re-acquire (overlapping) ok", own3.ok === true);

restore();

if (fail) { console.error(`\nd07-locks: ${fail} FAILED`); process.exit(1); }
console.log("\nd07-locks: acquire/overlap/prefix/release/expiry/same-owner all verified");
