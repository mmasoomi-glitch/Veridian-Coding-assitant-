import { execFile } from "child_process";
import fs from "fs";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface GitStats {
  repoPath: string;
  isRepo: boolean;
  remoteUrl: string;
  currentBranch: string;
  branchCount: number;
  ahead: number;
  behind: number;
  uncommitted: number;
  unstaged: number;
  untracked: number;
  lastCommit: { hash: string; subject: string; relativeDate: string } | null;
  lastTouchedMs: number;
  hygieneTips: string[];
}

// Run a git subcommand in the given repo. Returns trimmed stdout, or "" on any
// failure (missing upstream, no remote, not a repo, git not installed, etc.).
// We never let git's non-zero exits bubble up as thrown errors.
async function git(repoPath: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd: repoPath,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });
    return String(stdout || "").trim();
  } catch {
    return "";
  }
}

// Coerce anything to a clean integer (0 on failure) — guards against the
// occasional empty string / NaN / undefined that git output can produce.
function num(v: unknown): number {
  const n = parseInt(String(v ?? "").trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

function emptyStats(repoPath: string, isRepo: boolean): GitStats {
  return {
    repoPath: String(repoPath || ""),
    isRepo,
    remoteUrl: "",
    currentBranch: "",
    branchCount: 0,
    ahead: 0,
    behind: 0,
    uncommitted: 0,
    unstaged: 0,
    untracked: 0,
    lastCommit: null,
    lastTouchedMs: 0,
    hygieneTips: [],
  };
}

export async function getGitStats(repoPath: string): Promise<GitStats> {
  try {
    if (!repoPath || !fs.existsSync(repoPath)) {
      return emptyStats(repoPath, false);
    }

    const insideWorkTree = await git(repoPath, ["rev-parse", "--is-inside-work-tree"]);
    if (insideWorkTree !== "true") {
      return emptyStats(repoPath, false);
    }

    const stats = emptyStats(repoPath, true);

    // Remote URL (empty string if there is no `origin`).
    stats.remoteUrl = String(await git(repoPath, ["remote", "get-url", "origin"]));

    // Current branch (e.g. "main"; "HEAD" when detached).
    stats.currentBranch = String(await git(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]));

    // Branch count: number of non-empty lines from `git branch --list`.
    const branchList = await git(repoPath, ["branch", "--list"]);
    stats.branchCount = branchList
      ? branchList.split(/\r?\n/).filter((l) => l.trim().length > 0).length
      : 0;

    // Ahead/behind relative to the configured upstream (@{u}). If no upstream
    // is configured the command yields "" and we leave both at 0.
    // `--left-right --count A...B` prints "<left>\t<right>" = "<behind>\t<ahead>"
    // for the spec `@{u}...HEAD` (left = upstream-only, right = HEAD-only).
    const lr = await git(repoPath, ["rev-list", "--left-right", "--count", "@{u}...HEAD"]);
    if (lr) {
      const parts = lr.split(/\s+/);
      stats.behind = num(parts[0]);
      stats.ahead = num(parts[1]);
    }

    // Status counting via porcelain v1. Each line is "XY <path>" where X is the
    // index (staged) column and Y is the worktree (unstaged) column.
    // Mapping (as requested):
    //   uncommitted = files with a staged change in the index (X is not ' ' and not '?')
    //   unstaged    = files modified in the worktree but not staged (Y is not ' ' and not '?')
    //   untracked   = lines beginning with "??"
    // A single file can count toward both uncommitted and unstaged if it has
    // staged changes AND further worktree edits — that's intentional and honest.
    const porcelain = await git(repoPath, ["status", "--porcelain=v1"]);
    if (porcelain) {
      for (const raw of porcelain.split(/\r?\n/)) {
        if (!raw) continue;
        if (raw.startsWith("??")) {
          stats.untracked += 1;
          continue;
        }
        const x = raw.charAt(0); // index / staged column
        const y = raw.charAt(1); // worktree / unstaged column
        if (x !== " " && x !== "?") stats.uncommitted += 1;
        if (y !== " " && y !== "?") stats.unstaged += 1;
      }
    }

    // Last commit: hash <US> subject <US> relative-date (split on \x1f).
    const log = await git(repoPath, ["log", "-1", "--pretty=format:%h%x1f%s%x1f%cr"]);
    if (log) {
      const [hash, subject, relativeDate] = log.split("\x1f");
      stats.lastCommit = {
        hash: String(hash || ""),
        subject: String(subject || ""),
        relativeDate: String(relativeDate || ""),
      };
    }

    // Last touched: commit time (seconds) * 1000; fall back to repo dir mtime.
    const ct = await git(repoPath, ["log", "-1", "--format=%ct"]);
    if (ct) {
      stats.lastTouchedMs = num(ct) * 1000;
    } else {
      try {
        stats.lastTouchedMs = fs.statSync(repoPath).mtimeMs;
      } catch {
        stats.lastTouchedMs = 0;
      }
    }

    // Derive hygiene tips from the state collected above.
    const tips: string[] = [];
    if (stats.uncommitted > 0) tips.push(`Commit ${stats.uncommitted} staged change(s)`);
    if (stats.unstaged > 0) tips.push(`Stage/commit ${stats.unstaged} modified file(s)`);
    if (stats.untracked > 0) tips.push(`${stats.untracked} untracked file(s) — add or ignore`);
    if (stats.ahead > 0) tips.push(`Push ${stats.ahead} commit(s)`);
    if (stats.behind > 0) tips.push(`Pull ${stats.behind} commit(s)`);
    if (tips.length === 0) tips.push("Working tree clean ✓");
    stats.hygieneTips = tips;

    return stats;
  } catch {
    // Absolute backstop — never throw, always return best-effort.
    return emptyStats(repoPath, false);
  }
}
