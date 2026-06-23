import React, { useEffect, useState, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Keyboard, Play, Pause, Trash2, Copy, Check, ShieldAlert, Loader2 } from "lucide-react";

// Transparent, LOCAL-ONLY keystroke recorder UI.
//
// The owner's keyboard randomly wipes typed text; this surfaces the recovery log
// captured by telemetry/keylog.ps1 (via autopilot/keylog-store.ts on the server).
// It is deliberately NOT stealthy: a prominent header, a red pulsing RECORDING
// badge, and an always-visible consent banner. Nothing is uploaded — all reads go
// to the local API which reads the local keystroke-log.txt.
//
// API: GET /api/keylog -> {text, recording, paused}
//      POST /api/keylog/start
//      POST /api/keylog/pause {paused}
//      POST /api/keylog/clear

interface KeylogState {
  text: string;
  recording: boolean;
  paused: boolean;
}

export default function KeyloggerTab({ apiBase }: { apiBase: string }) {
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState<null | "start" | "pause" | "clear">(null);
  const [copied, setCopied] = useState(false);
  const boxRef = useRef<HTMLPreElement | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Poll the local log every 3s. Only the meaningful fields drive re-render.
  const load = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/api/keylog`);
      if (!r.ok) return;
      const next: KeylogState = await r.json();
      if (typeof next?.text === "string") setText((p) => (p === next.text ? p : next.text));
      setRecording(!!next?.recording);
      setPaused(!!next?.paused);
    } catch {
      /* offline; ignore */
    }
  }, [apiBase]);

  useEffect(() => {
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [load]);

  // Keep the newest captured text in view (newest is at the bottom).
  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);

  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);

  const start = useCallback(async () => {
    setBusy("start");
    try {
      await fetch(`${apiBase}/api/keylog/start`, { method: "POST" });
      await load();
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  }, [apiBase, load]);

  const togglePause = useCallback(async () => {
    setBusy("pause");
    const nextPaused = !paused;
    try {
      await fetch(`${apiBase}/api/keylog/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: nextPaused })
      });
      setPaused(nextPaused);
      await load();
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  }, [apiBase, paused, load]);

  const clear = useCallback(async () => {
    setBusy("clear");
    try {
      await fetch(`${apiBase}/api/keylog/clear`, { method: "POST" });
      setText("");
      await load();
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  }, [apiBase, load]);

  const copyAll = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  }, [text]);

  // Status badge: red pulsing when actively recording, gray when paused, dim otherwise.
  const Badge = () => {
    if (paused) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-300 text-[11px] font-mono">
          <span className="h-2 w-2 rounded-full bg-slate-400" /> paused
        </span>
      );
    }
    if (recording) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 text-[11px] font-mono font-bold">
          <motion.span
            className="h-2 w-2 rounded-full bg-rose-500"
            animate={{ opacity: [1, 0.25, 1] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
          />
          ● RECORDING (local only)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-800 text-slate-500 text-[11px] font-mono">
        <span className="h-2 w-2 rounded-full bg-slate-600" /> idle
      </span>
    );
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl space-y-4">
      {/* Prominent header + live status */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-100">
          <Keyboard className="h-4 w-4 text-cyan-400" /> Keystroke Recorder
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={paused ? "paused" : recording ? "rec" : "idle"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Badge />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Privacy / consent banner — always visible (transparency is a hard requirement) */}
      <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
        <ShieldAlert className="h-4 w-4 text-amber-300 shrink-0 mt-0.5" />
        <p className="text-[11px] leading-relaxed text-amber-200 font-mono">
          Recording ALL keystrokes locally on this machine for your own recovery. Nothing is
          uploaded. PAUSE before typing passwords.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={start}
          disabled={busy !== null}
          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition-all disabled:opacity-50 flex items-center gap-1.5"
        >
          {busy === "start" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Start
        </button>
        <button
          onClick={togglePause}
          disabled={busy !== null}
          className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 bg-slate-950 text-slate-200 hover:border-amber-500/50 hover:text-amber-200 transition-all disabled:opacity-50 flex items-center gap-1.5"
        >
          {busy === "pause" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          {paused ? "Resume" : "Pause"}
        </button>
        <button
          onClick={clear}
          disabled={busy !== null}
          className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 bg-slate-950 text-slate-200 hover:border-rose-500/50 hover:text-rose-300 transition-all disabled:opacity-50 flex items-center gap-1.5"
        >
          {busy === "clear" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          Clear
        </button>
        <button
          onClick={copyAll}
          disabled={!text}
          className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 bg-slate-950 text-slate-200 hover:border-cyan-500/50 hover:text-cyan-300 transition-all disabled:opacity-40 flex items-center gap-1.5"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy all"}
        </button>
      </div>

      {/* Captured text — monospace, scrollable, newest at bottom */}
      <div>
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-2">
          <Keyboard className="h-3.5 w-3.5" /> Recovered Text ({text.length} ch)
        </div>
        <pre
          ref={boxRef}
          className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 leading-relaxed"
        >
          {text || <span className="text-slate-600">Nothing captured yet. Press Start to begin recording.</span>}
        </pre>
      </div>
    </div>
  );
}
