// D22 + D23 — Branch registry + ancestry, and worktree registry. SCOPED TO VERIDIAN ONLY.
//
// Sources (no whole-disk scanning): the current repo (process.cwd()) and its
// `git worktree list`. Read-only git (for-each-ref/branch/rev-list/merge-base/worktree).
// Never mutates a repo. Every git call is wrapped to return "" on error (never throws).
//
// Worktree paths are reduced to basename for safety (absolute paths stay off the wire).
//
// Drafted via the OpenRouter (veridian) skill; reviewed + hardened (merged detection,
// ahead/behind parsing). Evidence: docs/program-control/ai-evidence/D22/.

import { execFileSync } from "node:child_process";
import path from "node:path";

export interface BranchEntry {
  name: string;
  upstream?: string;
  ahead: number;
  behind: number;
  lastCommitRel: string;
  merged: boolean; // merged into the default branch?
}

export interface WorktreeEntry {
  path: string; // basename only — never the absolute path
  branch: string;
  head: string;
  locked: boolean;
  prunable: boolean;
}

function git(repo: string | undefined, ...args: string[]): string {
  try {
    return execFileSync("git", ["-C", repo || process.cwd(), ...args], {
      encoding: "utf8",
      timeout: 10000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"], // swallow git's stderr; errors surface via catch
    }).trim();
  } catch {
    return "";
  }
}

/** Default branch: origin/HEAD short name, else main, else master, else current HEAD. */
export function defaultBranch(repo?: string): string {
  const originHead = git(repo, "symbolic-ref", "--short", "refs/remotes/origin/HEAD");
  if (originHead) return originHead.replace(/^origin\//, "");
  if (git(repo, "rev-parse", "--verify", "--quiet", "refs/heads/main")) return "main";
  if (git(repo, "rev-parse", "--verify", "--quiet", "refs/heads/master")) return "master";
  return git(repo, "rev-parse", "--abbrev-ref", "HEAD") || "HEAD";
}

// Parse git's `upstream:track` field, e.g. "[ahead 2, behind 1]", "[ahead 3]", "[gone]".
function parseTrack(track: string): { ahead: number; behind: number } {
  const ahead = /ahead (\d+)/.exec(track);
  const behind = /behind (\d+)/.exec(track);
  return {
    ahead: ahead ? parseInt(ahead[1], 10) : 0,
    behind: behind ? parseInt(behind[1], 10) : 0,
  };
}

/** D22: every LOCAL branch with upstream/ahead/behind/last-commit/merged-into-default. */
export function listBranches(repo?: string): BranchEntry[] {
  const SEP = "\x1f"; // ASCII unit separator (execFileSync forbids \0 in args)
  const format = ["%(refname:short)", "%(upstream:short)", "%(committerdate:relative)", "%(upstream:track)"].join(SEP);
  const data = git(repo, "for-each-ref", "--format=" + format, "refs/heads/");
  if (!data) return [];

  const def = defaultBranch(repo);
  // One cheap call: which local branches are merged into the default branch.
  const mergedSet = new Set(
    git(repo, "branch", "--format=%(refname:short)", "--merged", def)
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean),
  );

  return data
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [name, upstream, lastCommitRel, track] = line.split(SEP);
      const { ahead, behind } = parseTrack(track || "");
      return {
        name,
        upstream: upstream || undefined,
        ahead,
        behind,
        lastCommitRel: lastCommitRel || "unknown",
        merged: name === def || mergedSet.has(name),
      };
    });
}

/** D22 ancestry: commits on `branch` not on `base` (base defaults to the default branch). */
export function whatExistsOnlyHere(
  branch: string,
  base?: string,
  repo?: string,
): { count: number; subjects: string[] } {
  const baseRef = base || defaultBranch(repo);
  if (!branch || !baseRef) return { count: 0, subjects: [] };
  const data = git(repo, "rev-list", `${baseRef}..${branch}`, "--oneline");
  if (!data) return { count: 0, subjects: [] };
  const subjects = data
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => l.replace(/^[0-9a-f]+\s+/, ""));
  return { count: subjects.length, subjects };
}

/** D23: registered worktrees of this repo, parsed from porcelain. Path = basename only. */
export function listWorktrees(repo?: string): WorktreeEntry[] {
  const data = git(repo, "worktree", "list", "--porcelain");
  if (!data) return [];

  const entries: WorktreeEntry[] = [];
  let cur: Partial<WorktreeEntry> | null = null;
  const flush = () => {
    if (cur && cur.path) {
      entries.push({
        path: cur.path,
        branch: cur.branch || "(detached)",
        head: cur.head || "",
        locked: cur.locked ?? false,
        prunable: cur.prunable ?? false,
      });
    }
    cur = null;
  };

  for (const line of data.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      flush();
      cur = { path: path.basename(line.slice("worktree ".length).trim()), locked: false, prunable: false };
    } else if (!cur) {
      continue;
    } else if (line.startsWith("HEAD ")) {
      cur.head = line.slice("HEAD ".length).trim();
    } else if (line.startsWith("branch ")) {
      cur.branch = line.slice("branch ".length).trim().replace(/^refs\/heads\//, "");
    } else if (line === "detached") {
      cur.branch = "(detached)";
    } else if (line === "locked" || line.startsWith("locked ")) {
      cur.locked = true;
    } else if (line === "prunable" || line.startsWith("prunable ")) {
      cur.prunable = true;
    }
  }
  flush();
  return entries;
}
