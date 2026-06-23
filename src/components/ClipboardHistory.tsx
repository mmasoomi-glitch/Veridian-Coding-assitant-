import React, { useEffect, useState, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ClipboardList, Copy, Check, Loader2 } from "lucide-react";

interface ClipEntry {
  id: string;
  ts: string;
  preview: string;
  isSecret: boolean;
  length: number;
}

// Signature of the meaningful content — used to skip setState when a poll
// returns identical data, so the list doesn't flicker/re-animate (the owner is
// sensitive to jarring refreshes).
function sig(xs: ClipEntry[]): string {
  return xs.map((x) => `${x.id}:${x.preview}:${x.isSecret}`).join("|");
}

function fmtAge(ts: string): string {
  const ms = Date.now() - new Date(ts).getTime();
  if (!isFinite(ms) || ms < 0) return "now";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export default function ClipboardHistory({ apiBase }: { apiBase: string }) {
  const [items, setItems] = useState<ClipEntry[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/api/clipboard/history`);
      if (!r.ok) return;
      const next: ClipEntry[] = await r.json();
      if (!Array.isArray(next)) return;
      // Only update when the content signature changes — avoids flicker.
      setItems((prev) => (sig(prev) === sig(next) ? prev : next));
    } catch {
      /* offline; ignore */
    }
  }, [apiBase]);

  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  const copy = async (id: string) => {
    setBusyId(id);
    try {
      const r = await fetch(`${apiBase}/api/clipboard/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const data = await r.json().catch(() => ({}));
      if (data?.ok) {
        setCopiedId(id);
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setCopiedId(null), 1500);
      }
    } catch {
      /* ignore */
    } finally {
      setBusyId(null);
    }
  };

  const clearAll = async () => {
    try {
      await fetch(`${apiBase}/api/clipboard/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      setItems([]);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-cyan-400">
          <ClipboardList className="h-3.5 w-3.5" /> Clipboard History
          <span className="text-slate-500">({items.length})</span>
        </div>
        {items.length > 0 && (
          <button
            onClick={clearAll}
            className="text-[10px] font-mono text-slate-500 hover:text-slate-300 transition-colors underline underline-offset-2"
          >
            clear
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-[11px] text-slate-500 font-mono">Nothing copied yet.</p>
      ) : (
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          <AnimatePresence initial={false}>
            {items.map((it) => (
              <motion.div
                key={it.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: "easeInOut" }}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <code className="text-[11px] text-slate-200 font-mono truncate">{it.preview}</code>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {it.isSecret && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase bg-red-500/15 text-red-400">
                        secret
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-slate-500">{fmtAge(it.ts)}</span>
                    <button
                      onClick={() => copy(it.id)}
                      disabled={busyId === it.id}
                      title="Copy to clipboard"
                      className="px-1.5 py-1 rounded-md border border-slate-700 text-slate-300 hover:border-cyan-500/50 hover:text-cyan-300 transition-all disabled:opacity-50 flex items-center"
                    >
                      {busyId === it.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : copiedId === it.id ? (
                        <Check className="h-3 w-3 text-emerald-400" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                </div>
                <AnimatePresence>
                  {copiedId === it.id && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="text-[10px] font-mono text-emerald-400 mt-1"
                    >
                      copied to clipboard
                    </motion.p>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
