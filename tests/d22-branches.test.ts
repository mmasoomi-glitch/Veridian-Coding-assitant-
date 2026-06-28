// D22 (branch registry + ancestry) + D23 (worktree registry) verification.
// Run: npx tsx tests/d22-branches.test.ts
// Read-only, Veridian-scoped: exercises the real current repo + its worktrees. Never mutates.

let fail = 0;
const ok = (n: string, c: boolean) => { console.log((c ? "  ok   " : "  FAIL ") + n); if (!c) fail++; };

const { listBranches, listWorktrees, whatExistsOnlyHere, defaultBranch } = await import("../orchestrator/branch-registry");

// ---- D22: branch registry ----
const branches = listBranches();
ok("listBranches returns >=1 branch", branches.length >= 1);

const current = (await import("node:child_process")).execFileSync(
  "git", ["-C", process.cwd(), "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" },
).trim();
ok("registry includes the current branch", branches.some((b) => b.name === current));
ok("every branch has numeric ahead/behind", branches.every((b) => typeof b.ahead === "number" && typeof b.behind === "number"));
ok("every branch has a name + lastCommitRel", branches.every((b) => !!b.name && typeof b.lastCommitRel === "string"));
ok("every branch has a boolean merged flag", branches.every((b) => typeof b.merged === "boolean"));
ok("upstream is string-or-undefined", branches.every((b) => b.upstream === undefined || typeof b.upstream === "string"));

// ---- D22: ancestry (whatExistsOnlyHere) — must not throw, returns count + subjects ----
const def = defaultBranch();
ok("defaultBranch resolves to a non-empty name", typeof def === "string" && def.length > 0);
let ancestry: { count: number; subjects: string[] } = { count: -1, subjects: [] };
ok("whatExistsOnlyHere does not throw", (() => { try { ancestry = whatExistsOnlyHere(current); return true; } catch { return false; } })());
ok("ancestry.count is a number", typeof ancestry.count === "number" && ancestry.count >= 0);
ok("ancestry.subjects is an array of length count", Array.isArray(ancestry.subjects) && ancestry.subjects.length === ancestry.count);
ok("whatExistsOnlyHere(bogus base) is safe", (() => { try { const r = whatExistsOnlyHere(current, "no-such-base-xyz"); return r.count === 0; } catch { return false; } })());

// ---- D23: worktree registry ----
const worktrees = listWorktrees();
ok("listWorktrees returns >=1 worktree", worktrees.length >= 1);
ok("every worktree has a branch", worktrees.every((w) => typeof w.branch === "string" && w.branch.length > 0));
ok("every worktree path is basename only (no separators)", worktrees.every((w) => !w.path.includes("/") && !w.path.includes("\\")));
ok("every worktree has locked/prunable booleans", worktrees.every((w) => typeof w.locked === "boolean" && typeof w.prunable === "boolean"));
// The android worktree (wp/android-control) is registered against this repo when present.
const android = worktrees.find((w) => w.path.toLowerCase().includes("android") || w.branch.includes("android"));
ok("android worktree present with a branch (if registered)", !android || (!!android.branch && android.branch !== "(detached)"));

if (fail) { console.error(`\nd22-branches: ${fail} FAILED`); process.exit(1); }
console.log("\nd22-branches: D22 branch registry + ancestry + D23 worktree registry verified");
