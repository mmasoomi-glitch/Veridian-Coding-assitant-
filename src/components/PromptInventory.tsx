import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Library, Search, Plus, X, Copy, Check, Loader2, ChevronDown, ChevronRight } from "lucide-react";

// A PromptItem as served by /api/prompts. Mirrors autopilot/prompts-store.ts.
interface PromptItem {
  id: string;
  ts: string;
  title: string;
  body: string;
  tags: string[];
}

// Copies text to the OS clipboard. Prefers the async Clipboard API and falls
// back to a hidden textarea + execCommand for older / non-secure contexts.
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function PromptInventory({ apiBase }: { apiBase: string }) {
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/api/prompts`);
      if (!r.ok) return;
      const next: PromptItem[] = await r.json();
      if (!Array.isArray(next)) return;
      // Only swap when the set actually changed — avoids flicker on re-loads
      // (the owner is sensitive to it).
      setPrompts((prev) => {
        const sig = (xs: PromptItem[]) => xs.map((x) => `${x.id}:${x.title}`).join("|");
        return sig(prev) === sig(next) ? prev : next;
      });
    } catch {
      /* offline; ignore */
    }
  }, [apiBase]);

  useEffect(() => {
    load();
  }, [load]);

  // Filter by title / body / tags (case-insensitive).
  const q = query.trim().toLowerCase();
  const filtered = q
    ? prompts.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.body.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
      )
    : prompts;

  const addPrompt = async () => {
    const t = title.trim();
    const b = body.trim();
    if (!t || !b || saving) return;
    setSaving(true);
    setStatus("");
    try {
      const tags = tagsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const r = await fetch(`${apiBase}/api/prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, body: b, tags })
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setTitle("");
      setBody("");
      setTagsRaw("");
      setAdding(false);
      await load();
    } catch (e: any) {
      setStatus(`Couldn't add prompt: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    // Optimistic removal so the fade-out plays immediately.
    setPrompts((prev) => prev.filter((x) => x.id !== id));
    try {
      await fetch(`${apiBase}/api/prompts/${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      /* ignore */
    }
    await load();
  };

  const copy = async (p: PromptItem) => {
    const ok = await copyToClipboard(p.body);
    if (ok) {
      setCopiedId(p.id);
      window.setTimeout(() => setCopiedId((c) => (c === p.id ? null : c)), 1200);
    } else {
      setStatus("Copy failed — your browser blocked clipboard access.");
    }
  };

  const toggle = (id: string) => setExpanded((m) => ({ ...m, [id]: !m[id] }));

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl space-y-4 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-cyan-400">
          <Library className="h-3.5 w-3.5" /> Prompt Inventory ({prompts.length})
        </div>
        <button
          onClick={() => setAdding((a) => !a)}
          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition-all flex items-center gap-1.5"
        >
          {adding ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {adding ? "Close" : "Add prompt"}
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="h-3.5 w-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, body, or tags…"
          className="w-full rounded-lg bg-slate-950 border border-slate-800 pl-8 pr-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors"
        />
      </div>

      {/* Add form */}
      <AnimatePresence initial={false}>
        {adding && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-2 bg-slate-950 border border-slate-800 rounded-lg p-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title"
                className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors"
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Prompt body…"
                rows={3}
                className="w-full resize-y rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors"
              />
              <input
                value={tagsRaw}
                onChange={(e) => setTagsRaw(e.target.value)}
                placeholder="Tags (comma separated)"
                className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors"
              />
              <div className="flex justify-end">
                <button
                  onClick={addPrompt}
                  disabled={saving || !title.trim() || !body.trim()}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition-all disabled:opacity-50 flex items-center gap-1.5"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Save
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {status && <p className="text-[11px] text-rose-400 font-mono">{status}</p>}

      {/* List */}
      <div className="border-t border-slate-800 pt-3">
        {filtered.length === 0 ? (
          <p className="text-[11px] text-slate-600 font-mono">
            {prompts.length === 0 ? "No prompts yet." : "No prompts match your search."}
          </p>
        ) : (
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            <AnimatePresence initial={false}>
              {filtered.map((p) => {
                const isOpen = !!expanded[p.id];
                return (
                  <motion.div
                    key={p.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4, ease: "easeInOut" }}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        onClick={() => toggle(p.id)}
                        className="flex items-start gap-1.5 min-w-0 text-left flex-1"
                        title={isOpen ? "Collapse" : "Expand"}
                      >
                        <span className="pt-0.5 text-slate-500">
                          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs text-slate-200 font-semibold truncate">{p.title}</span>
                          {!isOpen && (
                            <span className="block text-[10px] text-slate-500 font-mono truncate">{p.body}</span>
                          )}
                        </span>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => copy(p)}
                          title="Copy body to clipboard"
                          className={`p-1 rounded transition-colors hover:bg-slate-800 ${
                            copiedId === p.id ? "text-emerald-400" : "text-slate-500 hover:text-cyan-300"
                          }`}
                        >
                          {copiedId === p.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          onClick={() => remove(p.id)}
                          title="Delete"
                          className="p-1 rounded text-slate-600 hover:text-rose-400 hover:bg-slate-800 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.3, ease: "easeInOut" }}
                          className="overflow-hidden"
                        >
                          <p className="text-[11px] text-slate-300 font-mono whitespace-pre-wrap mt-1.5 pl-5">
                            {p.body}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {p.tags.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 mt-1 pl-5">
                        {p.tags.map((t) => (
                          <span
                            key={t}
                            className="px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 text-[9px] font-mono"
                          >
                            {t}
                          </span>
                        ))}
                        {copiedId === p.id && (
                          <span className="text-[9px] font-mono text-emerald-400">copied!</span>
                        )}
                      </div>
                    )}
                    {p.tags.length === 0 && copiedId === p.id && (
                      <div className="mt-1 pl-5">
                        <span className="text-[9px] font-mono text-emerald-400">copied!</span>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
