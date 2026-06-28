import React, { useEffect, useState, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Clipboard, Pin, Search, Trash2, Check, Lock, Loader2, Copy, Laptop, Network } from "lucide-react";

// Shape returned by the clipboard API (ClipEntry from autopilot/clip-history.ts).
// Raw values are never sent — only a redacted-safe preview.
// `origin`/`remote` are present on the unified (cross-device) feed; optional so
// the same type also models the local-only /history fallback.
interface ClipEntry {
  id: string;
  ts: string;
  preview: string;
  isSecret: boolean;
  length: number;
  origin?: string;
  remote?: boolean;
}

interface SyncStatus {
  ready: boolean;
  remoteCount: number;
  includesSecrets: boolean;
}

// Stable signature of a list so polling only re-renders when content meaningfully
// changes (the owner is flicker-sensitive — ages alone must not churn the DOM).
const sig = (xs: ClipEntry[]) =>
  xs.map((x) => `${x.id}:${x.isSecret}:${x.remote ? 1 : 0}:${x.origin || ""}`).join("|");

function fmtAge(ts: string): string {
  const ms = Date.now() - new Date(ts).getTime();
  if (!isFinite(ms) || ms < 0) return "";
  const s = ms / 1000;
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

export default function ClipboardTab({ apiBase }: { apiBase: string }) {
  const [history, setHistory] = useState<ClipEntry[]>([]);
  const [top, setTop] = useState<ClipEntry[]>([]);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<ClipEntry[]>([]);
  const [openSuggest, setOpenSuggest] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- loaders (signature-diffed, all wrapped) ----
  // Prefer the cross-device unified feed; fall back to local-only history if it
  // errors or is empty (e.g. when sync is off) so the list always works.
  const loadHistory = useCallback(async () => {
    try {
      let next: ClipEntry[] | null = null;
      try {
        const ru = await fetch(`${apiBase}/api/clipboard/unified`);
        if (ru.ok) {
          const u = await ru.json();
          if (Array.isArray(u) && u.length > 0) next = u;
        }
      } catch { /* fall through to local history */ }
      if (!next) {
        const r = await fetch(`${apiBase}/api/clipboard/history`);
        if (!r.ok) return;
        const local = await r.json();
        if (!Array.isArray(local)) return;
        next = local;
      }
      setHistory((prev) => (sig(prev) === sig(next!) ? prev : next!));
    } catch { /* offline; ignore */ }
  }, [apiBase]);

  const loadSyncStatus = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/api/clipboard/sync-status`);
      if (!r.ok) return;
      const next: SyncStatus = await r.json();
      if (!next || typeof next.ready !== "boolean") return;
      setSyncStatus((prev) =>
        prev &&
        prev.ready === next.ready &&
        prev.remoteCount === next.remoteCount &&
        prev.includesSecrets === next.includesSecrets
          ? prev
          : next
      );
    } catch { /* ignore */ }
  }, [apiBase]);

  const loadTop = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/api/clipboard/top`);
      if (!r.ok) return;
      const next: ClipEntry[] = await r.json();
      if (!Array.isArray(next)) return;
      setTop((prev) => (sig(prev) === sig(next) ? prev : next));
    } catch { /* ignore */ }
  }, [apiBase]);

  useEffect(() => {
    loadHistory();
    loadTop();
    loadSyncStatus();
    const id = setInterval(() => { loadHistory(); loadTop(); loadSyncStatus(); }, 15000);
    return () => clearInterval(id);
  }, [loadHistory, loadTop, loadSyncStatus]);

  // ---- autocomplete (debounced) ----
  useEffect(() => {
    const q = query.trim();
    if (!q) { setSuggestions([]); setOpenSuggest(false); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`${apiBase}/api/clipboard/suggest?q=${encodeURIComponent(q)}`);
        if (!r.ok) return;
        const next: ClipEntry[] = await r.json();
        if (cancelled || !Array.isArray(next)) return;
        setSuggestions(next);
        setOpenSuggest(true);
      } catch { /* ignore */ }
    }, 180);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, apiBase]);

  // ---- actions ----
  const copy = useCallback(async (id: string) => {
    try {
      const r = await fetch(`${apiBase}/api/clipboard/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const data = await r.json().catch(() => ({}));
      if (data?.ok) {
        setCopiedId(id);
        if (copiedTimer.current) clearTimeout(copiedTimer.current);
        copiedTimer.current = setTimeout(() => setCopiedId(null), 1400);
      }
    } catch { /* ignore */ }
  }, [apiBase]);

  const clearAll = useCallback(async () => {
    setClearing(true);
    try {
      await fetch(`${apiBase}/api/clipboard/clear`, { method: "POST" });
      setHistory([]);
      setTop([]);
    } catch { /* ignore */ } finally {
      setClearing(false);
    }
  }, [apiBase]);

  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);

  const pickSuggestion = (e: ClipEntry) => {
    copy(e.id);
    setOpenSuggest(false);
    setQuery("");
  };

  // ---- small presentational helpers ----
  const SecretChip = () => (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 text-[10px] font-mono">
      <Lock className="h-2.5 w-2.5" /> secret
    </span>
  );

  // Chip showing which device a remote entry came from. Local entries render a
  // subtle "this PC" marker instead.
  const OriginChip = ({ e }: { e: ClipEntry }) =>
    e.remote ? (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 text-[10px] font-mono">
        <Network className="h-2.5 w-2.5" /> from {e.origin || "remote"}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-slate-600 text-[10px] font-mono">
        <Laptop className="h-2.5 w-2.5" /> this PC
      </span>
    );

  const CopiedBadge = ({ id }: { id: string }) =>
    copiedId === id ? (
      <motion.span
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-300"
      >
        <Check className="h-3 w-3" /> copied
      </motion.span>
    ) : null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-cyan-400">
        <Clipboard className="h-3.5 w-3.5" /> Clipboard
      </div>

      {/* Cross-device sync status */}
      <AnimatePresence initial={false} mode="wait">
        {syncStatus && (
          <motion.div
            key={syncStatus.ready ? "sync-on" : "sync-off"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className="flex items-center gap-2 text-[10px] font-mono"
          >
            {syncStatus.ready ? (
              <>
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                <span className="text-emerald-300">
                  Cross-device sync on · {syncStatus.remoteCount} from other device{syncStatus.remoteCount === 1 ? "" : "s"}
                </span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-slate-600" />
                <span className="text-slate-500">
                  Local only — set VERIDIAN_SYNC_KEY to sync across devices
                </span>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pinned / most used */}
      <div>
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-amber-400 mb-2">
          <Pin className="h-3.5 w-3.5" /> Pinned (most used)
        </div>
        {top.length === 0 ? (
          <p className="text-[11px] text-slate-500 font-mono">Nothing copied repeatedly yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <AnimatePresence initial={false}>
              {top.map((e) => (
                <motion.button
                  key={e.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35, ease: "easeInOut" }}
                  onClick={() => copy(e.id)}
                  title="Click to copy"
                  className="group max-w-full px-3 py-1.5 rounded-lg text-xs border border-slate-700 bg-slate-950 text-slate-200 hover:border-amber-500/50 hover:text-amber-200 transition-all flex items-center gap-2"
                >
                  {e.isSecret ? <Lock className="h-3 w-3 text-rose-300 shrink-0" /> : <Copy className="h-3 w-3 text-slate-500 group-hover:text-amber-300 shrink-0" />}
                  <span className="truncate font-mono">{e.preview || "(empty)"}</span>
                  <CopiedBadge id={e.id} />
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Search / autocomplete */}
      <div className="relative">
        <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 focus-within:border-cyan-500/50 transition-all">
          <Search className="h-3.5 w-3.5 text-slate-500 shrink-0" />
          <input
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
            onFocus={() => { if (suggestions.length) setOpenSuggest(true); }}
            onBlur={() => setTimeout(() => setOpenSuggest(false), 150)}
            placeholder="Search clipboard to copy…"
            className="flex-1 bg-transparent text-xs text-slate-200 placeholder-slate-600 outline-none font-mono"
          />
        </div>
        <AnimatePresence>
          {openSuggest && suggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="absolute z-10 left-0 right-0 mt-1 bg-slate-950 border border-cyan-500/30 rounded-lg overflow-hidden shadow-2xl"
            >
              {suggestions.map((e) => (
                <button
                  key={e.id}
                  // onMouseDown (not onClick) so it fires before the input's onBlur closes the list.
                  onMouseDown={() => pickSuggestion(e)}
                  className="w-full text-left px-3 py-1.5 text-xs font-mono text-slate-300 hover:bg-slate-900 hover:text-cyan-200 transition-colors flex items-center gap-2"
                >
                  {e.isSecret ? <Lock className="h-3 w-3 text-rose-300 shrink-0" /> : <Copy className="h-3 w-3 text-slate-600 shrink-0" />}
                  <span className="truncate flex-1">{e.preview || "(empty)"}</span>
                  {e.isSecret && <SecretChip />}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Full history */}
      <div className="border-t border-slate-800 pt-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-slate-400">
            <Clipboard className="h-3.5 w-3.5" /> History ({history.length})
          </div>
          <button
            onClick={clearAll}
            disabled={clearing || history.length === 0}
            className="px-2.5 py-1 rounded-lg text-[11px] font-bold border border-slate-700 text-slate-300 hover:text-rose-300 hover:border-rose-500/50 transition-all disabled:opacity-40 flex items-center gap-1.5"
          >
            {clearing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            Clear
          </button>
        </div>
        {history.length === 0 ? (
          <p className="text-[11px] text-slate-500 font-mono">Nothing copied yet.</p>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            <AnimatePresence initial={false}>
              {history.map((e) => (
                <motion.button
                  key={e.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: "easeInOut" }}
                  onClick={() => copy(e.id)}
                  title="Click to copy"
                  className="group w-full text-left bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 hover:border-cyan-500/40 transition-all"
                >
                  <div className="flex items-center gap-2">
                    {e.isSecret ? <Lock className="h-3 w-3 text-rose-300 shrink-0" /> : <Copy className="h-3 w-3 text-slate-600 group-hover:text-cyan-300 shrink-0" />}
                    <span className="flex-1 truncate text-xs font-mono text-slate-200">{e.preview || "(empty)"}</span>
                    <CopiedBadge id={e.id} />
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 pl-5 text-[10px] font-mono text-slate-500">
                    <OriginChip e={e} />
                    {e.isSecret && <SecretChip />}
                    <span>{e.length} ch</span>
                    <span>· {fmtAge(e.ts)}</span>
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
