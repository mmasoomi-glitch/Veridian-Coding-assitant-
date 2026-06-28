// src/components/ControlCenter.tsx — admin-only "Control Center" tab.
//
// A single-pane cockpit over the Veridian orchestrator. Three panels, each
// polled every ~10s. State only updates when content actually changes (stable
// signatures), because the owner is flicker-sensitive.
//
// API contracts (admin session cookie required, sent with credentials):
//   GET  /api/orch/health -> { ok, version, uptimeMs, checks:{vault,ai,flags,git} }
//   GET  /api/orch/risk   -> RepoEntry[] (cloud-safe, no local path) sorted worst-first
//   GET  /api/flags       -> FeatureFlag[]
//   POST /api/flags { id, enabled } (admin) -> { ok, flags }
//
// Everything is truthful: an unavailable endpoint shows an honest "unavailable"
// state — it never fabricates health, repos, or flags.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  LayoutDashboard,
  Activity,
  GitBranch,
  Flag,
  Check,
  X,
  Loader2,
  AlertTriangle,
} from "lucide-react";

const POLL_MS = 10_000;

// ----- types (mirror server contracts) -----
type Risk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface Health {
  ok: boolean;
  version: string;
  uptimeMs: number;
  checks: { vault: boolean; ai: boolean; flags: boolean; git: boolean };
}

interface RepoRisk {
  name: string;
  branch: string;
  ahead: number;
  behind: number;
  dirty: number;
  untracked: number;
  unpushed: number;
  hasUpstream: boolean;
  staleDays: number;
  lastCommit: string;
  risk: Risk;
}

interface FeatureFlag {
  id: string;
  enabled: boolean;
  description: string;
  updatedAt: string;
}

// ----- helpers -----
function fmtUptime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

const RISK_ORDER: Record<Risk, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

const RISK_STYLE: Record<Risk, string> = {
  LOW: "bg-slate-700/40 text-slate-300 border-slate-600/40",
  MEDIUM: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  HIGH: "bg-orange-500/15 text-orange-300 border-orange-500/40",
  CRITICAL: "bg-rose-500/15 text-rose-300 border-rose-500/40",
};

// Stable signatures so polls only re-render on real change (anti-flicker).
const healthSig = (h: Health | null) =>
  h ? `${h.ok}:${h.version}:${h.checks.vault}:${h.checks.ai}:${h.checks.flags}:${h.checks.git}` : "";
const riskSig = (xs: RepoRisk[]) =>
  xs
    .map(
      (r) =>
        `${r.name}:${r.branch}:${r.ahead}:${r.behind}:${r.dirty}:${r.untracked}:${r.unpushed}:${r.hasUpstream}:${r.staleDays}:${r.lastCommit}:${r.risk}`,
    )
    .join("|");
const flagsSig = (xs: FeatureFlag[]) =>
  xs.map((f) => `${f.id}:${f.enabled}:${f.description}:${f.updatedAt}`).join("|");

// ----- status pill -----
function StatusPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-mono uppercase tracking-wider border ${
        ok
          ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
          : "bg-rose-500/15 text-rose-300 border-rose-500/40"
      }`}
    >
      {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      {label}
    </span>
  );
}

function RiskBadge({ risk }: { risk: Risk }) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border ${RISK_STYLE[risk]}`}
    >
      {risk}
    </span>
  );
}

export default function ControlCenter({ apiBase }: { apiBase: string }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [healthDown, setHealthDown] = useState(false);

  const [risk, setRisk] = useState<RepoRisk[]>([]);
  const [riskDown, setRiskDown] = useState(false);

  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [flagsDown, setFlagsDown] = useState(false);

  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  // Track whether the component is still mounted, to avoid setState after unmount.
  const aliveRef = useRef(true);

  const loadHealth = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/api/orch/health`, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as Health;
      if (!aliveRef.current) return;
      setHealthDown(false);
      setHealth((prev) => (healthSig(prev) === healthSig(j) ? prev : j));
    } catch {
      if (!aliveRef.current) return;
      setHealthDown(true);
    }
  }, [apiBase]);

  const loadRisk = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/api/orch/risk`, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as RepoRisk[];
      if (!aliveRef.current) return;
      const next = Array.isArray(j)
        ? [...j].sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk])
        : [];
      setRiskDown(false);
      setRisk((prev) => (riskSig(prev) === riskSig(next) ? prev : next));
    } catch {
      if (!aliveRef.current) return;
      setRiskDown(true);
    }
  }, [apiBase]);

  const loadFlags = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/api/flags`, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as FeatureFlag[];
      if (!aliveRef.current) return;
      const next = Array.isArray(j) ? j : [];
      setFlagsDown(false);
      setFlags((prev) => (flagsSig(prev) === flagsSig(next) ? prev : next));
    } catch {
      if (!aliveRef.current) return;
      setFlagsDown(true);
    }
  }, [apiBase]);

  const loadAll = useCallback(async () => {
    await Promise.all([loadHealth(), loadRisk(), loadFlags()]);
    if (aliveRef.current) setLoading(false);
  }, [loadHealth, loadRisk, loadFlags]);

  useEffect(() => {
    aliveRef.current = true;
    loadAll();
    const id = window.setInterval(loadAll, POLL_MS);
    return () => {
      aliveRef.current = false;
      window.clearInterval(id);
    };
  }, [loadAll]);

  const toggleFlag = async (f: FeatureFlag) => {
    setToggling(f.id);
    try {
      const r = await fetch(`${apiBase}/api/flags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: f.id, enabled: !f.enabled }),
      });
      // Refresh regardless; the server is the source of truth for flag state.
      if (r.ok) await loadFlags();
    } catch {
      /* network error — leave state untouched; next poll reconciles */
    } finally {
      if (aliveRef.current) setToggling(null);
    }
  };

  const panel = "bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl space-y-3";
  const panelHead = "flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeInOut" }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center gap-2 text-slate-200">
        <LayoutDashboard className="h-4 w-4 text-cyan-400" />
        <h2 className="text-sm font-bold tracking-wide">Control Center</h2>
      </div>

      {/* 1. Health */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className={panel}
      >
        <div className={`${panelHead} text-emerald-400`}>
          <Activity className="h-3.5 w-3.5" /> Health
        </div>

        {loading && !health && !healthDown ? (
          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> loading…
          </div>
        ) : healthDown || !health ? (
          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
            <AlertTriangle className="h-3.5 w-3.5 text-slate-600" /> unavailable
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <StatusPill label="vault" ok={health.checks.vault} />
              <StatusPill label="ai" ok={health.checks.ai} />
              <StatusPill label="flags" ok={health.checks.flags} />
              <StatusPill label="git" ok={health.checks.git} />
            </div>
            <div className="flex items-center gap-4 text-[11px] font-mono text-slate-500">
              <span>
                version <span className="text-slate-200">{health.version || "—"}</span>
              </span>
              <span>
                uptime <span className="text-slate-200">{fmtUptime(health.uptimeMs)}</span>
              </span>
            </div>
          </div>
        )}
      </motion.div>

      {/* 2. Repository risk */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className={panel}
      >
        <div className={`${panelHead} text-orange-400`}>
          <GitBranch className="h-3.5 w-3.5" /> Repository risk
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Veridian-scoped only — the Veridian repo, its worktrees, and repos added in Settings. Not a
          whole-disk scan.
        </p>

        {loading && risk.length === 0 && !riskDown ? (
          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> loading…
          </div>
        ) : riskDown ? (
          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
            <AlertTriangle className="h-3.5 w-3.5 text-slate-600" /> unavailable
          </div>
        ) : risk.length === 0 ? (
          <p className="text-[11px] text-slate-500 font-mono">No repositories at risk</p>
        ) : (
          <div className="space-y-1.5">
            <AnimatePresence initial={false}>
              {risk.map((r) => (
                <motion.div
                  key={r.name}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <RiskBadge risk={r.risk} />
                    <span className="text-xs font-mono text-slate-100 truncate">{r.name}</span>
                    <span className="text-[11px] font-mono text-slate-500">· {r.branch}</span>
                  </div>
                  <div className="mt-1 text-[10px] font-mono text-slate-500 flex items-center gap-x-3 gap-y-0.5 flex-wrap">
                    <span>
                      ahead <span className="text-slate-300">{r.ahead}</span> · behind{" "}
                      <span className="text-slate-300">{r.behind}</span>
                    </span>
                    <span>
                      dirty <span className="text-slate-300">{r.dirty}</span> · untracked{" "}
                      <span className="text-slate-300">{r.untracked}</span>
                    </span>
                    <span>
                      unpushed <span className="text-slate-300">{r.unpushed}</span>
                      {!r.hasUpstream && <span className="text-rose-400/80"> · no upstream</span>}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] font-mono text-slate-600 truncate">
                    {r.lastCommit}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      {/* 3. Feature flags */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        className={panel}
      >
        <div className={`${panelHead} text-cyan-400`}>
          <Flag className="h-3.5 w-3.5" /> Feature flags
        </div>

        {loading && flags.length === 0 && !flagsDown ? (
          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> loading…
          </div>
        ) : flagsDown ? (
          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
            <AlertTriangle className="h-3.5 w-3.5 text-slate-600" /> unavailable
          </div>
        ) : flags.length === 0 ? (
          <p className="text-[11px] text-slate-500 font-mono">No feature flags defined.</p>
        ) : (
          <div className="space-y-1.5">
            {flags.map((f) => (
              <div
                key={f.id}
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 flex items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono text-slate-100 truncate">{f.id}</div>
                  {f.description && (
                    <p className="mt-0.5 text-[11px] text-slate-500 leading-relaxed">
                      {f.description}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={f.enabled}
                  aria-label={`Toggle ${f.id}`}
                  onClick={() => toggleFlag(f)}
                  disabled={toggling === f.id}
                  className={`relative shrink-0 mt-0.5 inline-flex h-5 w-9 items-center rounded-full border transition-colors disabled:opacity-50 ${
                    f.enabled
                      ? "bg-emerald-500/30 border-emerald-500/50"
                      : "bg-slate-800 border-slate-700"
                  }`}
                >
                  <motion.span
                    layout
                    transition={{ type: "spring", stiffness: 500, damping: 32 }}
                    className={`inline-block h-3.5 w-3.5 rounded-full ${
                      f.enabled ? "ml-auto mr-0.5 bg-emerald-300" : "ml-0.5 bg-slate-400"
                    }`}
                  />
                  {toggling === f.id && (
                    <Loader2 className="absolute inset-0 m-auto h-3 w-3 animate-spin text-slate-300" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
