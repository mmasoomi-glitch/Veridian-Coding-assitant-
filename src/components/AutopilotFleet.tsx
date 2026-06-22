import React, { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Rocket, Cpu, Loader2, Play, Plus, Save, Eye, Wrench, Zap, Check, X } from "lucide-react";

type FleetMode = "assess" | "build" | "full";

interface FleetProject {
  desktop: number;
  name: string;
  path: string;
  goal: string;
  mode?: FleetMode;
}

interface ProgressEntry {
  ts: string;
  project: string;
  desktop: number;
  mode: FleetMode;
  ok: boolean;
  summary: string;
  durationMs: number;
}

interface FleetStatus {
  running: boolean;
  lastRunStartedAt: string | null;
  projects: FleetProject[];
  progress: ProgressEntry[];
}

const MODES: { id: FleetMode; label: string; caption: string; icon: React.ReactNode; risk: boolean }[] = [
  { id: "assess", label: "Assess", caption: "reads & plans, no changes", icon: <Eye className="h-3.5 w-3.5" />, risk: false },
  { id: "build", label: "Build", caption: "edits files, gates risky/outward actions", icon: <Wrench className="h-3.5 w-3.5" />, risk: false },
  { id: "full", label: "Full", caption: "unsupervised — only if you mean it", icon: <Zap className="h-3.5 w-3.5" />, risk: true },
];

function fmtAge(ts: string): string {
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function modeChipClass(mode: FleetMode): string {
  if (mode === "full") return "bg-red-500/15 text-red-300 border border-red-500/30";
  if (mode === "build") return "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30";
  return "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
}

export default function AutopilotFleet({ apiBase }: { apiBase: string }) {
  const [projects, setProjects] = useState<FleetProject[]>([]);
  const [status, setStatus] = useState<FleetStatus | null>(null);
  const [mode, setMode] = useState<FleetMode>("assess");
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string>("");

  // Draft for the "add project" row.
  const [draft, setDraft] = useState<FleetProject>({ desktop: 1, name: "", path: "", goal: "", mode: "assess" });

  // Stable signatures so we only setState when content actually changes (no flicker).
  const statusSig = useRef<string>("");
  const running = status?.running ?? false;

  const loadProjects = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/api/fleet/projects`);
      if (!r.ok) return;
      const next: FleetProject[] = await r.json();
      if (Array.isArray(next)) setProjects(next);
    } catch {
      /* offline; ignore */
    }
  }, [apiBase]);

  const loadStatus = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/api/fleet/status`);
      if (!r.ok) return;
      const next: FleetStatus = await r.json();
      const sig =
        `${next.running}|${next.lastRunStartedAt ?? ""}|` +
        (next.progress || []).map((p) => `${p.ts}:${p.project}:${p.ok}`).join(",");
      if (sig !== statusSig.current) {
        statusSig.current = sig;
        setStatus(next);
      }
    } catch {
      /* offline; ignore */
    }
  }, [apiBase]);

  // Fetch projects once on mount.
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Poll status: every 4s while running, every 10s otherwise.
  useEffect(() => {
    loadStatus();
    const id = setInterval(loadStatus, running ? 4000 : 10000);
    return () => clearInterval(id);
  }, [loadStatus, running]);

  const runFleet = async () => {
    if (running || starting) return;
    setStarting(true);
    setNote("");
    try {
      const r = await fetch(`${apiBase}/api/fleet/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.status === 202 && data.started) {
        setNote(`Fleet launched in ${mode.toUpperCase()} mode.`);
        // Refresh status promptly so the running indicator appears.
        loadStatus();
      } else {
        setNote(data.reason ? `Couldn't start: ${data.reason}` : "Couldn't start the fleet.");
      }
    } catch {
      setNote("Run failed (is the server running?).");
    } finally {
      setStarting(false);
    }
  };

  const saveProjects = async (next: FleetProject[]) => {
    setSaving(true);
    setNote("");
    try {
      const r = await fetch(`${apiBase}/api/fleet/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.ok) {
        if (Array.isArray(data.projects)) setProjects(data.projects);
        else setProjects(next);
        setNote("Saved.");
      } else {
        setNote("Save failed.");
      }
    } catch {
      setNote("Save failed (is the server running?).");
    } finally {
      setSaving(false);
    }
  };

  const updateProject = (idx: number, patch: Partial<FleetProject>) => {
    setProjects((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  const removeProject = (idx: number) => {
    setProjects((prev) => prev.filter((_, i) => i !== idx));
  };

  const addDraft = () => {
    if (!draft.name.trim() && !draft.path.trim()) return;
    const next = [...projects, { ...draft, name: draft.name.trim(), path: draft.path.trim(), goal: draft.goal.trim() }];
    setProjects(next);
    setDraft({ desktop: (draft.desktop || 0) + 1, name: "", path: "", goal: "", mode: draft.mode || "assess" });
  };

  const progress = (status?.progress || []).slice(0, 12);

  const inputCls =
    "bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50";

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-cyan-400">
          <Rocket className="h-3.5 w-3.5" />
          <Cpu className="h-3.5 w-3.5" />
          Autopilot Fleet
        </div>
        <AnimatePresence initial={false}>
          {running && (
            <motion.div
              key="running"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-300"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              running…
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Mode selector */}
      <div>
        <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-2">Mode</div>
        <div className="grid grid-cols-3 gap-2">
          {MODES.map((m) => {
            const active = mode === m.id;
            const base = "rounded-lg px-2 py-2 text-left border transition-all";
            let cls: string;
            if (active && m.risk) cls = "bg-amber-500/15 border-amber-500 text-amber-200";
            else if (active) cls = "bg-cyan-500/15 border-cyan-500 text-cyan-200";
            else if (m.risk) cls = "bg-slate-950 border-amber-500/30 text-amber-400/80 hover:border-amber-500/60";
            else cls = "bg-slate-950 border-slate-700 text-slate-300 hover:border-cyan-500/40";
            return (
              <button key={m.id} onClick={() => setMode(m.id)} className={`${base} ${cls}`}>
                <div className="flex items-center gap-1.5 text-xs font-bold">
                  {m.icon}
                  {m.label}
                </div>
                <div className="text-[10px] font-mono mt-1 leading-tight opacity-80">{m.caption}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Run button */}
      <button
        onClick={runFleet}
        disabled={running || starting}
        className={`w-full px-3 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-60 ${
          mode === "full"
            ? "bg-amber-500 text-slate-950 hover:bg-amber-400"
            : "bg-cyan-500 text-slate-950 hover:bg-cyan-400"
        }`}
      >
        {running || starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        {running ? "Fleet running…" : starting ? "Launching…" : `Run Fleet — ${mode.toUpperCase()}`}
      </button>
      {note && <p className="text-[11px] text-slate-400 font-mono">{note}</p>}

      {/* Projects */}
      <div className="border-t border-slate-800 pt-3">
        <div className="text-[11px] font-mono uppercase tracking-wider text-purple-400 mb-2">
          Projects ({projects.length})
        </div>

        {projects.length === 0 ? (
          <p className="text-[11px] text-slate-500 font-mono mb-2">No projects yet — add one below.</p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {projects.map((p, idx) => (
              <div key={`${p.desktop}-${idx}`} className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-cyan-300 shrink-0">
                    D{p.desktop}
                  </span>
                  <input
                    value={p.name}
                    onChange={(e) => updateProject(idx, { name: e.target.value })}
                    placeholder="name"
                    className={`${inputCls} flex-1 font-semibold`}
                  />
                  <select
                    value={p.mode || "assess"}
                    onChange={(e) => updateProject(idx, { mode: e.target.value as FleetMode })}
                    className={`${inputCls} ${modeChipClass(p.mode || "assess")} font-mono uppercase`}
                  >
                    <option value="assess">assess</option>
                    <option value="build">build</option>
                    <option value="full">full</option>
                  </select>
                  <button
                    onClick={() => removeProject(idx)}
                    className="text-slate-500 hover:text-red-400 transition-colors shrink-0"
                    title="Remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <input
                  value={p.goal}
                  onChange={(e) => updateProject(idx, { goal: e.target.value })}
                  placeholder="goal"
                  className={`${inputCls} w-full`}
                />
                <input
                  value={p.path}
                  onChange={(e) => updateProject(idx, { path: e.target.value })}
                  placeholder="path"
                  className={`${inputCls} w-full text-[10px] font-mono text-slate-400`}
                />
              </div>
            ))}
          </div>
        )}

        {/* Add project row */}
        <div className="mt-2 bg-slate-950 border border-dashed border-slate-700 rounded-lg p-2.5 space-y-1.5">
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={draft.desktop}
              onChange={(e) => setDraft((d) => ({ ...d, desktop: Number(e.target.value) || 0 }))}
              placeholder="#"
              className={`${inputCls} w-14`}
            />
            <input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="name"
              className={`${inputCls} flex-1`}
            />
          </div>
          <input
            value={draft.path}
            onChange={(e) => setDraft((d) => ({ ...d, path: e.target.value }))}
            placeholder="path"
            className={`${inputCls} w-full font-mono text-[10px]`}
          />
          <input
            value={draft.goal}
            onChange={(e) => setDraft((d) => ({ ...d, goal: e.target.value }))}
            placeholder="goal"
            className={`${inputCls} w-full`}
          />
          <div className="flex gap-2">
            <button
              onClick={addDraft}
              className="flex-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 text-slate-200 hover:border-cyan-500/50 hover:text-cyan-300 transition-all flex items-center justify-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> Add project
            </button>
            <button
              onClick={() => saveProjects(projects)}
              disabled={saving}
              className="flex-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-500 text-white hover:bg-purple-400 transition-all disabled:opacity-60 flex items-center justify-center gap-1.5"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </button>
          </div>
        </div>
      </div>

      {/* Progress feed */}
      <div className="border-t border-slate-800 pt-3">
        <div className="text-[11px] font-mono uppercase tracking-wider text-amber-400 mb-2">Progress</div>
        {progress.length === 0 ? (
          <p className="text-[11px] text-slate-500 font-mono">No runs yet.</p>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            <AnimatePresence initial={false}>
              {progress.map((e) => (
                <motion.div
                  key={`${e.ts}:${e.project}`}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: "easeInOut" }}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full shrink-0 ${e.ok ? "bg-emerald-400" : "bg-red-400"}`}
                      title={e.ok ? "ok" : "failed"}
                    />
                    <span className="text-xs text-slate-200 font-semibold truncate">{e.project}</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-cyan-300 shrink-0">
                      D{e.desktop}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase shrink-0 ${modeChipClass(e.mode)}`}>
                      {e.mode}
                    </span>
                    <span className="ml-auto text-[10px] text-slate-500 font-mono shrink-0">{fmtAge(e.ts)}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 line-clamp-3 break-words">{e.summary}</p>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
