import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Network, Server, ChevronRight, Inbox, Activity } from "lucide-react";

// CENTRAL COMMAND view of every local Veridian instance reporting into this central
// server. Polls /api/sync/machines every 10s and only re-renders when the meaningful
// content changes (the owner is sensitive to flicker — see CommandDeck).

interface MachineSnapshot {
  machineId: string;
  hostname: string;
  lastSeen: string;
  currentState: any;
  sessions: any[];
  waiting: any[];
  ts: string;
}

// Relative age + freshness dot colour from a lastSeen ISO string.
function freshness(lastSeen: string): { label: string; dot: string } {
  const ageMs = Date.now() - new Date(lastSeen).getTime();
  const ageSec = Math.max(0, Math.round(ageMs / 1000));
  let label: string;
  if (ageSec < 90) label = `${ageSec}s ago`;
  else if (ageSec < 3600) label = `${Math.round(ageSec / 60)}m ago`;
  else if (ageSec < 86400) label = `${Math.round(ageSec / 3600)}h ago`;
  else label = `${Math.round(ageSec / 86400)}d ago`;

  let dot = "bg-rose-500";
  if (ageMs < 120000) dot = "bg-emerald-400"; // < 2 min
  else if (ageMs < 600000) dot = "bg-amber-400"; // < 10 min
  return { label, dot };
}

// One-line "what's happening" summary from a machine's currentState.
function stateSummary(cs: any): string {
  if (!cs || typeof cs !== "object") return "no state reported";
  const app = cs.activeApp || cs.app || "";
  const desktop =
    typeof cs.virtualDesktop === "string"
      ? cs.virtualDesktop.split("(")[0].trim()
      : cs.desktop || "";
  const project = cs.gitRepo || cs.project || cs.workspacePath || "";
  const parts = [
    app && `${app}`,
    desktop && `desktop ${desktop}`,
    project && `${project}`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "idle";
}

function sessionSummary(s: any): string {
  if (!s || typeof s !== "object") return "";
  return (
    s.title ||
    s.summary ||
    s.nextStep ||
    s.folderPath ||
    s.sessionId ||
    "session"
  );
}

export default function MachineSelector({ apiBase }: { apiBase: string }) {
  const [machines, setMachines] = useState<MachineSnapshot[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Re-tick so relative ages/dots refresh even when content is unchanged.
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/api/sync/machines`);
      if (!r.ok) return;
      const next: MachineSnapshot[] = await r.json();
      if (!Array.isArray(next)) return;
      // Only update state when meaningful content changed — prevents flicker when a
      // poll returns the same fleet (lastSeen-only changes are handled by the tick).
      setMachines((prev) => {
        const sig = (xs: MachineSnapshot[]) =>
          xs
            .map(
              (x) =>
                `${x.machineId}:${x.ts}:${(x.sessions || []).length}:${(x.waiting || []).length}`
            )
            .join("|");
        return sig(prev) === sig(next) ? prev : next;
      });
    } catch {
      /* central offline / bad response — ignore */
    }
  }, [apiBase]);

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    const tickId = setInterval(() => setTick((t) => t + 1), 15000);
    return () => {
      clearInterval(id);
      clearInterval(tickId);
    };
  }, [load]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl space-y-3">
      <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-cyan-400">
        <Network className="h-3.5 w-3.5" /> Central Command — Machines
        <span className="text-slate-500">({machines.length})</span>
      </div>

      {machines.length === 0 ? (
        <p className="text-[11px] text-slate-500 font-mono">
          No machines reporting yet. Set CENTRAL_URL on a local instance to sync.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-[28rem] overflow-y-auto">
          <AnimatePresence initial={false}>
            {machines.map((m) => {
              const f = freshness(m.lastSeen);
              const isOpen = expanded === m.machineId;
              return (
                <motion.div
                  key={m.machineId}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: "easeInOut" }}
                  className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden"
                >
                  <button
                    onClick={() =>
                      setExpanded((e) => (e === m.machineId ? null : m.machineId))
                    }
                    className="w-full text-left px-2.5 py-2 hover:border-cyan-500/40 transition-all"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`h-2 w-2 rounded-full shrink-0 ${f.dot}`}
                          title={f.label}
                        />
                        <Server className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="text-xs text-slate-100 font-semibold truncate">
                          {m.hostname}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500 shrink-0">
                        {f.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1 pl-[1.1rem]">
                      <span className="text-[10px] text-slate-500 font-mono truncate">
                        {m.machineId}
                      </span>
                      <ChevronRight
                        className={`h-3 w-3 text-slate-600 shrink-0 transition-transform ${
                          isOpen ? "rotate-90" : ""
                        }`}
                      />
                    </div>
                    <p className="text-[11px] text-cyan-300/80 font-mono truncate mt-1 pl-[1.1rem]">
                      {stateSummary(m.currentState)}
                    </p>
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="border-t border-slate-800 px-2.5 py-2 space-y-2"
                      >
                        <div>
                          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-purple-400 mb-1">
                            <Activity className="h-3 w-3" /> Sessions (
                            {(m.sessions || []).length})
                          </div>
                          {(m.sessions || []).length === 0 ? (
                            <p className="text-[10px] text-slate-600 font-mono">
                              none
                            </p>
                          ) : (
                            <p className="text-[10px] text-slate-400 font-mono truncate">
                              latest: {sessionSummary(m.sessions[m.sessions.length - 1])}
                            </p>
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-amber-400 mb-1">
                            <Inbox className="h-3 w-3" /> Waiting (
                            {(m.waiting || []).length})
                          </div>
                          {(m.waiting || []).length === 0 ? (
                            <p className="text-[10px] text-slate-600 font-mono">
                              nothing idle/finished
                            </p>
                          ) : (
                            <div className="space-y-1">
                              {(m.waiting || []).slice(0, 5).map((w: any, i: number) => (
                                <div
                                  key={w?.path || i}
                                  className="flex items-center justify-between gap-2"
                                >
                                  <span className="text-[10px] text-slate-300 font-mono truncate">
                                    {w?.title || w?.detail || "item"}
                                  </span>
                                  {w?.status && (
                                    <span
                                      className={`text-[9px] font-mono shrink-0 ${
                                        w.status === "finished"
                                          ? "text-emerald-400"
                                          : "text-amber-400"
                                      }`}
                                    >
                                      {w.status}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
