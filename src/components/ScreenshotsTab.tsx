import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Camera, X, ShieldCheck } from "lucide-react";

interface Shot {
  id: string;
  ts: string;
  path: string;
  desktop?: string;
  note?: string;
}

// Content signature so identical polls don't re-animate the grid (the owner is
// sensitive to flicker).
function sig(xs: Shot[]): string {
  return xs.map((x) => x.id).join("|");
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

export default function ScreenshotsTab({ apiBase }: { apiBase: string }) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [active, setActive] = useState<Shot | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/api/screenshots`);
      if (!r.ok) return;
      const next: Shot[] = await r.json();
      if (!Array.isArray(next)) return;
      setShots((prev) => (sig(prev) === sig(next) ? prev : next));
    } catch {
      /* offline; ignore */
    }
  }, [apiBase]);

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  // Esc closes the lightbox.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  const imgUrl = (id: string) => `${apiBase}/api/screenshots/img/${id}`;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-cyan-400">
          <Camera className="h-3.5 w-3.5" /> Screenshots
          <span className="text-slate-500">({shots.length})</span>
        </div>
      </div>

      <div className="flex items-start gap-1.5 text-[10px] font-mono text-slate-500 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5">
        <ShieldCheck className="h-3 w-3 mt-0.5 shrink-0 text-emerald-500/70" />
        <span>
          Captured locally after 1 min on a desktop; kept on this machine and used only as
          AI context for "where was I?". Nothing is uploaded.
        </span>
      </div>

      {shots.length === 0 ? (
        <p className="text-[11px] text-slate-500 font-mono">No screenshots captured yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[28rem] overflow-y-auto">
          <AnimatePresence initial={false}>
            {shots.map((s) => (
              <motion.button
                key={s.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: "easeInOut" }}
                onClick={() => setActive(s)}
                className="group relative text-left bg-slate-950 border border-slate-800 rounded-lg overflow-hidden hover:border-cyan-500/50 transition-all"
              >
                <img
                  src={imgUrl(s.id)}
                  alt={s.desktop || "screenshot"}
                  loading="lazy"
                  className="w-full h-24 object-cover object-top opacity-90 group-hover:opacity-100 transition-opacity"
                />
                <div className="px-2 py-1 flex items-center justify-between gap-1">
                  <span className="text-[10px] font-mono text-slate-400 truncate">
                    {s.desktop || "—"}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 shrink-0">
                    {fmtAge(s.ts)}
                  </span>
                </div>
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => setActive(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-5xl w-full bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-2xl"
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
                <div className="flex items-center gap-2 text-[11px] font-mono text-slate-300">
                  <Camera className="h-3.5 w-3.5 text-cyan-400" />
                  <span>{active.desktop || "screenshot"}</span>
                  <span className="text-slate-500">
                    {new Date(active.ts).toLocaleString()}
                  </span>
                </div>
                <button
                  onClick={() => setActive(null)}
                  title="Close"
                  className="p-1 rounded-md border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-all"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <img
                src={imgUrl(active.id)}
                alt={active.desktop || "screenshot"}
                className="w-full max-h-[80vh] object-contain bg-black"
              />
              {active.note && (
                <p className="px-3 py-2 text-[11px] font-mono text-slate-400 border-t border-slate-800">
                  {active.note}
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
