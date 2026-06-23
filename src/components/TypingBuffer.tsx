import React, { useEffect, useState, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Keyboard, Copy, Check, Trash2, RotateCcw } from "lucide-react";

// SAFE typing-recovery panel — the privacy-respecting replacement for the
// rejected global keylogger. It only ever sees the text the user types into
// THIS box, debounce-saves it locally, and keeps prior snapshots so a faulty
// keyboard that wipes the textarea can't lose your work.

interface Snapshot {
  ts: string;
  text: string;
}
interface ScratchState {
  current: string;
  updatedAt: string;
  snapshots: Snapshot[];
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

function preview(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.slice(0, 60) || "(empty)";
}

export default function TypingBuffer({ apiBase }: { apiBase: string }) {
  const [text, setText] = useState("");
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [savedAt, setSavedAt] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load current text + snapshots on mount.
  const load = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/api/scratch`);
      if (!r.ok) return;
      const data: ScratchState = await r.json();
      if (data && typeof data.current === "string") {
        setText(data.current);
        setSnapshots(Array.isArray(data.snapshots) ? data.snapshots : []);
        setSavedAt(data.updatedAt || "");
      }
    } catch {
      /* offline; ignore */
    }
  }, [apiBase]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  // Debounced persist (~800ms). Returns the fresh state so the snapshot list
  // stays in sync with what the server actually recorded.
  const persist = useCallback(
    (value: string) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          const r = await fetch(`${apiBase}/api/scratch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: value })
          });
          if (!r.ok) return;
          const data: ScratchState = await r.json();
          if (data) {
            setSnapshots(Array.isArray(data.snapshots) ? data.snapshots : []);
            setSavedAt(data.updatedAt || "");
          }
        } catch {
          /* offline; ignore */
        }
      }, 800);
    },
    [apiBase]
  );

  const onChange = (value: string) => {
    setText(value);
    persist(value);
  };

  const restore = (snap: Snapshot) => {
    setText(snap.text);
    persist(snap.text);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; ignore */
    }
  };

  const clear = () => {
    setText("");
    persist("");
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-cyan-400">
          <Keyboard className="h-3.5 w-3.5" /> Scratch / Typing Recovery
        </div>
        <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          auto-saved locally
        </span>
      </div>

      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type here. If your keyboard wipes it, restore a snapshot below."
        rows={5}
        spellCheck={false}
        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono resize-y focus:outline-none focus:border-cyan-500/50 transition-colors placeholder:text-slate-600"
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={copy}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-slate-700 text-slate-300 hover:border-cyan-500/50 hover:text-cyan-300 transition-all flex items-center gap-1.5"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={clear}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-slate-700 text-slate-300 hover:border-red-500/50 hover:text-red-300 transition-all flex items-center gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear
          </button>
        </div>
        {savedAt && (
          <span className="text-[10px] font-mono text-slate-500">
            saved {fmtAge(savedAt)} ago
          </span>
        )}
      </div>

      <div className="border-t border-slate-800 pt-3">
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-2">
          <RotateCcw className="h-3.5 w-3.5" /> Snapshots
          <span className="text-slate-500">({snapshots.length})</span>
        </div>
        {snapshots.length === 0 ? (
          <p className="text-[11px] text-slate-500 font-mono">
            No snapshots yet — they appear as you type.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-44 overflow-y-auto">
            <AnimatePresence initial={false}>
              {snapshots.map((s) => (
                <motion.button
                  key={`${s.ts}-${s.text.length}`}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: "easeInOut" }}
                  onClick={() => restore(s)}
                  title="Click to restore this into the box"
                  className="w-full text-left bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 hover:border-cyan-500/50 transition-all group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <code className="text-[11px] text-slate-200 font-mono truncate">
                      {preview(s.text)}
                    </code>
                    <span className="text-[10px] font-mono text-slate-500 shrink-0 group-hover:text-cyan-300">
                      {fmtAge(s.ts)}
                    </span>
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <p className="text-[10px] font-mono text-slate-500 leading-relaxed border-t border-slate-800 pt-2">
        Recovers text you type HERE if your keyboard wipes it. Local only; only
        sees this box (never other apps/passwords).
      </p>
    </div>
  );
}
