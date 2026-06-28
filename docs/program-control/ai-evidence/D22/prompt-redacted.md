Return ONLY TypeScript, no prose, no fences. Write a Veridian-scoped, READ-ONLY git
branch + worktree registry module. Constraints:
- Use execFileSync("git", ["-C", repo, ...args]) wrapped in try/catch returning "" on error. Never throw.
- Scope = current repo (process.cwd()) only. No whole-disk scanning.
- import { execFileSync } from "node:child_process"; import path from "node:path";

Export these (D22):
export interface BranchEntry { name: string; upstream?: string; ahead: number; behind: number; lastCommitRel: string; merged: boolean; }
export function listBranches(repo?: string): BranchEntry[]
  - for each LOCAL branch via `git for-each-ref --format=... refs/heads`
  - fields: name; upstream (if any); ahead/behind vs upstream (0 when no upstream); lastCommitRel (committer relative date);
    merged = whether the branch is merged into the default branch (origin/HEAD short, fallback main, fallback master).
export function whatExistsOnlyHere(branch: string, base?: string, repo?: string): { count: number; subjects: string[] }
  - commits on `branch` not on `base` (base defaults to the default branch).
  - use `git rev-list base..branch --oneline`; parse count + subjects (strip leading hash). Empty/error => {count:0, subjects:[]}.

Export these (D23):
export interface WorktreeEntry { path: string; branch: string; head: string; locked: boolean; prunable: boolean; }
export function listWorktrees(repo?: string): WorktreeEntry[]
  - parse `git worktree list --porcelain`. path = basename only (security). branch = short branch name (strip refs/heads/) or "(detached)". head = the HEAD sha. locked/prunable booleans from porcelain flags.

Helpers: a defaultBranch(repo) resolving origin/HEAD short name, else main, else master, else current branch.
Keep it small, total, defensive. ES module. Two-space indent.
