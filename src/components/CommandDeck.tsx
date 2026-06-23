import React, { useEffect, useState, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Inbox, Wand2, MonitorCheck, Check, X, Loader2, ArrowRightLeft } from "lucide-react";

// Fades a value out then the new one in when it changes — gentle, non-jarring.
function FadeValue({ value, className }: { value: React.ReactNode; className?: string }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={String(value)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4, ease: "easeInOut" }}
        className={className}
      >
        {value}
      </motion.span>
    </AnimatePresence>
  );
}

interface WaitingItem {
  source: string;
  title: string;
  detail: string;
  ageSec: number;
  status: "idle" | "finished";
  path: string;
}

interface Proposal {
  summary?: string;
  nextStep?: string;
  actionType?: string;
  params?: { target?: number; text?: string };
  confidence?: number;
  safety?: "safe" | "confirm";
  why?: string;
  learning?: { trusted: boolean; approved: number; rejected: number };
  autoRun?: boolean;
}

export default function CommandDeck({ apiBase, desktopCount = 4 }: { apiBase: string; desktopCount?: number }) {
  const [waiting, setWaiting] = useState<WaitingItem[]>([]);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [thinking, setThinking] = useState(false);
  const [desktopBusy, setDesktopBusy] = useState<number | null>(null);
  const [status, setStatus] = useState<string>("");
  const [hover, setHover] = useState<{ n: number; info: any } | null>(null);

  const loadDesktopInfo = async (n: number) => {
    setHover({ n, info: null });
    try {
      const r = await fetch(`${apiBase}/api/desktop/info?n=${n}`);
      if (r.ok) setHover({ n, info: await r.json() });
    } catch { /* ignore */ }
  };

  const loadWaiting = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/api/waiting`);
      if (!r.ok) return;
      const next: WaitingItem[] = await r.json();
      // Only update if the meaningful content changed — prevents flicker/re-render
      // when a poll returns the same items (ages alone don't trigger churn).
      setWaiting((prev) => {
        const sig = (xs: WaitingItem[]) => xs.map((x) => `${x.path}:${x.status}`).join("|");
        return sig(prev) === sig(next) ? prev : next;
      });
    } catch { /* offline; ignore */ }
  }, [apiBase]);

  useEffect(() => {
    loadWaiting();
    const id = setInterval(loadWaiting, 45000);
    return () => clearInterval(id);
  }, [loadWaiting]);

  const switchDesktop = async (target: number) => {
    setDesktopBusy(target);
    setStatus(`Switching to Desktop ${target}…`);
    try {
      const r = await fetch(`${apiBase}/api/desktop/switch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target })
      });
      const data = await r.json();
      if (data.switched) {
        setStatus(`On Desktop ${target}.` + (data.brief?.nextStep ? ` Next: ${data.brief.nextStep}` : ""));
      } else if (data.error) {
        setStatus(`Couldn't switch: ${data.error}`);
      } else {
        setStatus(`Already on Desktop ${target}.`);
      }
    } catch (e: any) {
      setStatus("Switch failed (is the server running?).");
    } finally {
      setDesktopBusy(null);
    }
  };

  const askAutopilot = async () => {
    setThinking(true);
    setProposal(null);
    setStatus("Autopilot thinking…");
    try {
      // Pull live telemetry first, then the waiting list, then propose.
      const tele = await (await fetch(`${apiBase}/api/telemetry/current`)).json().catch(() => ({}));
      const r = await fetch(`${apiBase}/api/autopilot/next`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentState: tele.currentState, timeline: tele.timeline, waiting })
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${r.status}`);
      }
      const p: Proposal = await r.json();
      setProposal(p);
      setStatus("");
      // Trusted, safe, high-confidence → run automatically.
      if (p.autoRun) {
        await executeProposal(p, true);
      }
    } catch (e: any) {
      setStatus(`Autopilot error: ${e?.message || e}`);
    } finally {
      setThinking(false);
    }
  };

  const executeProposal = async (p: Proposal, auto = false) => {
    if (p.actionType === "switch-desktop" && p.params?.target) {
      await switchDesktop(p.params.target);
    } else if (p.actionType === "none") {
      setStatus("Nothing to do — you're on track.");
    } else {
      // Non-auto actions are surfaced for the human; we don't perform
      // side-effectful work from the client.
      setStatus(auto ? "Prepared — review below." : `Marked done: ${p.nextStep}`);
    }
    await sendFeedback(p, true);
    if (!auto) setProposal(null);
  };

  const sendFeedback = async (p: Proposal, approved: boolean) => {
    try {
      await fetch(`${apiBase}/api/autopilot/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionKey: p.actionType || "manual", approved })
      });
    } catch { /* ignore */ }
  };

  const dismiss = async () => {
    if (proposal) await sendFeedback(proposal, false);
    setProposal(null);
    setStatus("Dismissed.");
  };

  const fmtAge = (s: number) => (s < 90 ? `${Math.round(s)}s` : `${Math.round(s / 60)}m`);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl space-y-4">
      {/* Desktop switcher */}
      <div>
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-cyan-400 mb-2">
          <MonitorCheck className="h-3.5 w-3.5" /> Jump to Desktop
        </div>
        <div className="flex flex-wrap gap-2 relative">
          {Array.from({ length: desktopCount }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => switchDesktop(n)}
              onMouseEnter={() => loadDesktopInfo(n)}
              onMouseLeave={() => setHover((h) => (h?.n === n ? null : h))}
              disabled={desktopBusy !== null}
              className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 bg-slate-950 text-slate-200 hover:border-cyan-500/50 hover:text-cyan-300 transition-all disabled:opacity-50 flex items-center gap-1"
            >
              {desktopBusy === n ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRightLeft className="h-3 w-3" />}
              Desktop {n}
            </button>
          ))}
        </div>
        <AnimatePresence>
          {hover && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-2 bg-slate-950 border border-cyan-500/30 rounded-lg p-2.5 text-[11px] space-y-1"
            >
              <div className="font-bold text-cyan-300">Desktop {hover.n}{hover.info?.project ? ` · ${hover.info.project}` : ""}</div>
              {!hover.info && <div className="text-slate-500 font-mono">loading…</div>}
              {hover.info?.projectPath && <div className="text-slate-400 font-mono truncate">{hover.info.projectPath}</div>}
              {hover.info?.wasDoing && <div className="text-slate-300"><span className="text-slate-500">was doing: </span>{hover.info.wasDoing}</div>}
              {hover.info?.nextStep && <div className="text-slate-300"><span className="text-slate-500">next: </span>{hover.info.nextStep}</div>}
              {hover.info?.sessionId && <div className="text-purple-300 font-mono truncate"><span className="text-slate-500">claude session: </span>{hover.info.sessionId}</div>}
              {hover.info?.sessionSummary && <div className="text-slate-400 line-clamp-2">{hover.info.sessionSummary}</div>}
              {hover.info && !hover.info.project && !hover.info.wasDoing && !hover.info.sessionId && (
                <div className="text-slate-500">No project/activity recorded for this desktop yet. Add it in the Fleet panel.</div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Autopilot */}
      <div className="border-t border-slate-800 pt-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-purple-400">
            <Wand2 className="h-3.5 w-3.5" /> Autopilot — One Next Step
          </div>
          <button
            onClick={askAutopilot}
            disabled={thinking}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-500 text-white hover:bg-purple-400 transition-all disabled:opacity-60 flex items-center gap-1.5"
          >
            {thinking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            {thinking ? "Thinking…" : "What now?"}
          </button>
        </div>

        {proposal && (
          <div className="bg-slate-950 border border-purple-500/30 rounded-lg p-3 space-y-2">
            <p className="text-sm text-slate-100 font-semibold">{proposal.nextStep}</p>
            {proposal.summary && <p className="text-xs text-slate-400">{proposal.summary}</p>}
            <div className="flex items-center gap-2 text-[10px] font-mono">
              <span className={`px-1.5 py-0.5 rounded ${proposal.safety === "safe" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
                {proposal.safety === "safe" ? "SAFE / REVERSIBLE" : "NEEDS YOUR OK"}
              </span>
              <span className="text-slate-500">conf {Math.round((proposal.confidence || 0) * 100)}%</span>
              {proposal.learning && (
                <span className="text-slate-500">· trusted {proposal.learning.approved}× {proposal.learning.trusted ? "✓" : ""}</span>
              )}
              {proposal.autoRun && <span className="text-cyan-300">· auto-ran</span>}
            </div>
            {!proposal.autoRun && (
              <div className="flex gap-2 pt-1">
                <button onClick={() => executeProposal(proposal)} className="flex-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 text-slate-950 hover:bg-emerald-400 flex items-center justify-center gap-1">
                  <Check className="h-3.5 w-3.5" /> {proposal.safety === "safe" ? "Run it" : "Approve & run"}
                </button>
                <button onClick={dismiss} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 text-slate-300 hover:text-slate-100 flex items-center gap-1">
                  <X className="h-3.5 w-3.5" /> Dismiss
                </button>
              </div>
            )}
          </div>
        )}
        {status && <p className="text-[11px] text-slate-400 font-mono mt-2">{status}</p>}
      </div>

      {/* Waiting on you */}
      <div className="border-t border-slate-800 pt-3">
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-amber-400 mb-2">
          <Inbox className="h-3.5 w-3.5" /> Waiting On You (<FadeValue value={waiting.length} />)
        </div>
        {waiting.length === 0 ? (
          <p className="text-[11px] text-slate-500 font-mono">Nothing idle/finished right now.</p>
        ) : (
          <div className="space-y-1.5 max-h-44 overflow-y-auto">
            <AnimatePresence initial={false}>
              {waiting.slice(0, 8).map((w) => (
                <motion.div
                  key={w.path}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: "easeInOut" }}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-200 font-semibold truncate">{w.title}</span>
                    <span className={`text-[10px] font-mono ${w.status === "finished" ? "text-emerald-400" : "text-amber-400"}`}>
                      <FadeValue value={`${w.status} · ${fmtAge(w.ageSec)}`} />
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono truncate">{w.detail}</p>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
