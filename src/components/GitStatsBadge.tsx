import React from "react";
import { GitBranch, GitCommit, ArrowUp, ArrowDown, ExternalLink, GitFork, Lightbulb } from "lucide-react";

// Derive a short, human repo name from a remote URL or a filesystem path.
function repoName(stats: any): string {
  const url = String(stats?.remoteUrl || "");
  if (url) {
    const cleaned = url.replace(/\.git$/i, "").replace(/[/\\]+$/, "");
    const last = cleaned.split(/[/\\:]/).filter(Boolean).pop();
    if (last) return last;
  }
  const p = String(stats?.repoPath || "");
  const seg = p.replace(/[/\\]+$/, "").split(/[/\\]/).filter(Boolean).pop();
  return seg || "repo";
}

// A small count chip — amber/red when there's work pending, slate when zero.
function Chip({ label, count, tone }: { label: string; count: number; tone: "amber" | "red" }) {
  const active = count > 0;
  const activeCls =
    tone === "red"
      ? "bg-red-500/15 text-red-300 border-red-500/30"
      : "bg-amber-500/15 text-amber-300 border-amber-500/30";
  const cls = active ? activeCls : "bg-slate-950 text-slate-500 border-slate-800";
  return (
    <span className={`px-1.5 py-0.5 rounded border text-[10px] font-mono ${cls}`}>
      {count} {label}
    </span>
  );
}

export default function GitStatsBadge({ stats }: { stats: any }) {
  if (!stats?.isRepo) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl">
        <p className="text-[11px] text-slate-500 font-mono">Not a git repo.</p>
      </div>
    );
  }

  const name = repoName(stats);
  const url = String(stats.remoteUrl || "");
  const branch = String(stats.currentBranch || "");
  const branchCount = Number(stats.branchCount || 0);
  const ahead = Number(stats.ahead || 0);
  const behind = Number(stats.behind || 0);
  const uncommitted = Number(stats.uncommitted || 0);
  const unstaged = Number(stats.unstaged || 0);
  const untracked = Number(stats.untracked || 0);
  const lastCommit = stats.lastCommit || null;
  const tips: string[] = Array.isArray(stats.hygieneTips) ? stats.hygieneTips : [];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl space-y-3">
      {/* Repo name + branch */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <GitFork className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-bold text-cyan-300 hover:text-cyan-200 truncate flex items-center gap-1"
            >
              {name}
              <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
            </a>
          ) : (
            <span className="text-sm font-bold text-slate-200 truncate">{name}</span>
          )}
        </div>
        <span className="flex items-center gap-1 text-[11px] font-mono text-slate-400 shrink-0">
          <GitBranch className="h-3 w-3" />
          {branch || "—"}
          <span className="text-slate-600">· {branchCount}</span>
        </span>
      </div>

      {/* Status chips + ahead/behind */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip label="staged" count={uncommitted} tone="amber" />
        <Chip label="modified" count={unstaged} tone="red" />
        <Chip label="untracked" count={untracked} tone="amber" />
        {ahead > 0 && (
          <span className="px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/15 text-emerald-300 text-[10px] font-mono flex items-center gap-0.5">
            <ArrowUp className="h-3 w-3" />
            {ahead}
          </span>
        )}
        {behind > 0 && (
          <span className="px-1.5 py-0.5 rounded border border-sky-500/30 bg-sky-500/15 text-sky-300 text-[10px] font-mono flex items-center gap-0.5">
            <ArrowDown className="h-3 w-3" />
            {behind}
          </span>
        )}
      </div>

      {/* Last commit */}
      {lastCommit && (
        <div className="flex items-start gap-2 border-t border-slate-800 pt-2.5">
          <GitCommit className="h-3.5 w-3.5 text-slate-500 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-slate-200 truncate">{String(lastCommit.subject || "")}</p>
            <p className="text-[10px] text-slate-500 font-mono">
              {String(lastCommit.hash || "")} · {String(lastCommit.relativeDate || "")}
            </p>
          </div>
        </div>
      )}

      {/* Top hygiene tips (1–2) */}
      {tips.length > 0 && (
        <div className="flex items-start gap-2 border-t border-slate-800 pt-2.5">
          <Lightbulb className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
          <ul className="space-y-0.5">
            {tips.slice(0, 2).map((t, i) => (
              <li key={i} className="text-[11px] text-slate-400 font-mono">
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
