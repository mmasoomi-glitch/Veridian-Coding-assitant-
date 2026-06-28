// D21 + D24 — Repository registry + risk scanner, SCOPED TO VERIDIAN ONLY.
//
// Sources (no whole-disk scanning): the current repo (process.cwd()), its registered
// `git worktree list`, and any repos explicitly added via Settings (registered-repos.json).
// For each, compute branch/ahead/behind/dirty/unpushed/staleDays and classify risk.
//
// Read-only git (status/branch/rev-list/worktree/log). Never mutates a repo. Absolute paths
// stay local (the synced/cloud copy must drop `path` per the F-004 allowlist).

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { writeJsonAtomic } from "../lib/atomic";

const REGISTERED_FILE = path.join(process.cwd(), "registered-repos.json");

export type Risk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface RepoEntry {
  name: string;
  path: string;        // local only — strip before syncing
  branch: string;
  ahead: number;
  behind: number;
  dirty: number;       // modified/staged
  untracked: number;
  unpushed: number;    // local commits with no upstream/ahead of upstream
  hasUpstream: boolean;
  staleDays: number;
  lastCommit: string;
  risk: Risk;
}

// Adopted from the OpenRouter draft (reviewed, matches the D24 spec table).
export function classifyRisk(r: { dirty: number; untracked: number; unpushed: number; hasUpstream: boolean; staleDays: number }): Risk {
  const hasChanges = r.dirty + r.untracked > 0;
  if ((hasChanges && !r.hasUpstream) || (r.unpushed > 0 && !r.hasUpstream)) return "CRITICAL";
  if (r.unpushed > 0) return "HIGH";
  if (hasChanges || r.staleDays > 7) return "MEDIUM";
  return "LOW";
}

function git(repo: string, args: string[]): string {
  try {
    return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", timeout: 10000, windowsHide: true }).trim();
  } catch {
    return "";
  }
}

function registeredRepos(): string[] {
  try {
    const raw = JSON.parse(fs.readFileSync(REGISTERED_FILE, "utf8"));
    return Array.isArray(raw) ? raw.filter((p) => typeof p === "string") : [];
  } catch {
    return [];
  }
}

/** Add a repo to the registry (Settings). Veridian-scoped extension point. */
export function registerRepo(p: string): string[] {
  const list = new Set(registeredRepos());
  if (p && fs.existsSync(path.join(p, ".git"))) list.add(p);
  const arr = Array.from(list);
  writeJsonAtomic(REGISTERED_FILE, arr);
  return arr;
}

// The Veridian-only scope: this repo + its worktrees + explicitly-registered repos.
function scopedRepoPaths(): string[] {
  const root = process.cwd();
  const paths = new Set<string>([root]);
  const wt = git(root, ["worktree", "list", "--porcelain"]);
  for (const line of wt.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) paths.add(line.slice("worktree ".length).trim());
  }
  for (const r of registeredRepos()) if (fs.existsSync(path.join(r, ".git"))) paths.add(r);
  return Array.from(paths);
}

function scanOne(repo: string): RepoEntry {
  const branch = git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]) || "(detached)";
  const porcelain = git(repo, ["status", "--porcelain"]).split(/\r?\n/).filter(Boolean);
  const dirty = porcelain.filter((l) => !l.startsWith("??")).length;
  const untracked = porcelain.filter((l) => l.startsWith("??")).length;
  const upstream = git(repo, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  const hasUpstream = !!upstream;
  let ahead = 0, behind = 0;
  if (hasUpstream) {
    const lr = git(repo, ["rev-list", "--left-right", "--count", "@{u}...HEAD"]).split(/\s+/);
    behind = parseInt(lr[0] || "0", 10) || 0;
    ahead = parseInt(lr[1] || "0", 10) || 0;
  }
  // unpushed = commits not in any remote (covers "no upstream but commits exist").
  const unpushedRaw = git(repo, ["log", "--branches", "--not", "--remotes", "--oneline"]);
  const unpushed = hasUpstream ? ahead : (unpushedRaw ? unpushedRaw.split(/\r?\n/).filter(Boolean).length : 0);
  const lastCommit = git(repo, ["log", "-1", "--format=%cr|%h %s"]) || "never";
  const lastIso = git(repo, ["log", "-1", "--format=%cI"]);
  const staleDays = lastIso ? Math.floor((Date.now() - new Date(lastIso).getTime()) / 86400000) : 9999;
  const risk = classifyRisk({ dirty, untracked, unpushed, hasUpstream, staleDays });
  return { name: path.basename(repo), path: repo, branch, ahead, behind, dirty, untracked, unpushed, hasUpstream, staleDays, lastCommit, risk };
}

/** Full Veridian-scoped registry with risk. */
export function scanRepos(): RepoEntry[] {
  return scopedRepoPaths().map(scanOne).sort((a, b) => {
    const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return order[a.risk] - order[b.risk];
  });
}

/** Cloud-safe view: drop absolute paths (F-004). */
export function scanReposSafe(): Omit<RepoEntry, "path">[] {
  return scanRepos().map(({ path: _p, ...rest }) => rest);
}
