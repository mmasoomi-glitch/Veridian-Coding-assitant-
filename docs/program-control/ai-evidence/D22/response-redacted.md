Here's the TypeScript implementation:

```typescript
import { execFileSync } from "node:child_process";
import path from "node:path";

export interface BranchEntry {
  name: string;
  upstream?: string;
  ahead: number;
  behind: number;
  lastCommitRel: string;
  merged: boolean;
}

export interface WorktreeEntry {
  path: string;
  branch: string;
  head: string;
  locked: boolean;
  prunable: boolean;
}

function git(repo: string | undefined, ...args: string[]): string {
  try {
    return execFileSync("git", ["-C", repo || process.cwd(), ...args], {
      encoding: "utf-8",
    }).trim();
  } catch {
    return "";
  }
}

function defaultBranch(repo?: string): string {
  const head = git(repo, "symbolic-ref", "--short", "origin/HEAD");
  if (head) return head.replace(/^origin\//, "");
  if (git(repo, "rev-parse", "--verify", "main")) return "main";
  if (git(repo, "rev-parse", "--verify", "master")) return "master";
  return git(repo, "rev-parse", "--abbrev-ref", "HEAD");
}

export function listBranches(repo?: string): BranchEntry[] {
  const format = "%(refname:short)%00%(upstream:short)%00%(committerdate:relative)%00%(upstream:track)";
  const data = git(repo, "for-each-ref", "--format=" + format, "refs/heads/");
  if (!data) return [];

  const defaultBr = defaultBranch(repo);
  return data.split("\n").map(line => {
    const [name, upstream, lastCommitRel, track] = line.split("\x00");
    const [ahead, behind] = (track?.match(/(\d+)/g) || ["0", "0"]).map(Number);
    const merged = !!git(repo, "branch", "--merged", defaultBr, name);
    return { name, upstream: upstream || undefined, ahead, behind, lastCommitRel, merged };
  });
}

export function whatExistsOnlyHere(branch: string, base?: string, repo?: string): { count: number; subjects: string[] } {
  const defaultBr = base || defaultBranch(repo);
  const data = git(repo, "rev-list", `${defaultBr}..${branch}`, "--oneline");
  if (!data) return { count: 0, subjects: [] };

  const subjects = data.split("\n").map(line => line.replace(/^[0-9a-f]+\s/, ""));
  return { count: subjects.length, subjects };
}

export function listWorktrees(repo?: string): WorktreeEntry[] {
  const data = git(repo, "worktree", "list", "--porcelain");
  if (!data) return [];

  const entries: WorktreeEntry[] = [];
  let current: Partial<WorktreeEntry> = {};

  for (const line of data.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current.path) entries.push(current as WorktreeEntry);
      current = {
        path: path.basename(line.slice(9)),
        locked: false,
        prunable: false,
      };
    } else if (line.startsWith("HEAD ")) {
      current.head = line.slice(5);
    } else if (line.startsWith("branch ")) {
      current.branch = line.slice(8).replace(/^refs\/heads\//, "");
    } else if (line === "detached") {
      current.branch = "(detached)";
    } else if (line === "locked") {
      current.locked = true;
    } else if (line === "prunable") {
      current.prunable = true;
    }
  }

  if (current.path) entries.push(current as WorktreeEntry);
  return entries;
}
```