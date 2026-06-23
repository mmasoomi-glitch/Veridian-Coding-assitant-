import React, { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BookText, FileText, StickyNote, Code2, Download, Plus, X, Loader2 } from "lucide-react";

// A NoteEntry as served by /api/notebook. Mirrors autopilot/notebook.ts.
interface NoteEntry {
  id: string;
  ts: string;
  type: "note" | "file" | "snippet";
  title: string;
  content: string;
  project?: string;
  fileName?: string;
}

// Reads a File as a bare base64 string (FileReader gives a data: URL).
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error || new Error("read failed"));
    r.readAsDataURL(file);
  });
}

function fmtAge(ts: string): string {
  const then = new Date(ts).getTime();
  if (!Number.isFinite(then)) return "";
  const s = Math.max(0, (Date.now() - then) / 1000);
  if (s < 90) return `${Math.round(s)}s`;
  if (s < 5400) return `${Math.round(s / 60)}m`;
  if (s < 129600) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

function TypeIcon({ type }: { type: NoteEntry["type"] }) {
  if (type === "file") return <FileText className="h-3.5 w-3.5 text-cyan-400 shrink-0" />;
  if (type === "snippet") return <Code2 className="h-3.5 w-3.5 text-purple-400 shrink-0" />;
  return <StickyNote className="h-3.5 w-3.5 text-amber-400 shrink-0" />;
}

export default function Copybook({ apiBase }: { apiBase: string }) {
  const [entries, setEntries] = useState<NoteEntry[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState("");
  const dragDepth = useRef(0);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/api/notebook`);
      if (!r.ok) return;
      const next: NoteEntry[] = await r.json();
      if (!Array.isArray(next)) return;
      // Only swap state when the set of entries actually changed — avoids
      // flicker on the 15s poll (the owner is sensitive to it).
      setEntries((prev) => {
        const sig = (xs: NoteEntry[]) => xs.map((x) => x.id).join("|");
        return sig(prev) === sig(next) ? prev : next;
      });
    } catch { /* offline; ignore */ }
  }, [apiBase]);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  // Newest-first view.
  const sorted = [...entries].sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));

  const saveNote = async () => {
    const content = draft.trim();
    if (!content || saving) return;
    setSaving(true);
    setStatus("");
    try {
      const title = content.split("\n")[0].slice(0, 60);
      const r = await fetch(`${apiBase}/api/notebook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "note", title, content })
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setDraft("");
      await load();
    } catch (e: any) {
      setStatus(`Couldn't save note: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    // Optimistic removal so the fade-out plays immediately.
    setEntries((prev) => prev.filter((x) => x.id !== id));
    try {
      await fetch(`${apiBase}/api/notebook/${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch { /* ignore */ }
    await load();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    setStatus("");
    try {
      const files: File[] = e.dataTransfer ? Array.from(e.dataTransfer.files) : [];
      if (files.length) {
        for (const f of files) {
          try {
            const base64 = await fileToBase64(f);
            await fetch(`${apiBase}/api/notebook/file`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: f.name, base64 })
            });
          } catch (err: any) {
            setStatus(`File "${f.name}" failed: ${err?.message || err}`);
          }
        }
      } else {
        const text = e.dataTransfer?.getData("text/plain") || "";
        if (text.trim()) {
          const title = text.trim().split("\n")[0].slice(0, 60);
          await fetch(`${apiBase}/api/notebook`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "snippet", title, content: text })
          });
        }
      }
      await load();
    } catch (err: any) {
      setStatus(`Drop failed: ${err?.message || err}`);
    }
  };

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current++;
    setDragging(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl space-y-4 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-cyan-400">
        <BookText className="h-3.5 w-3.5" /> Copybook
      </div>

      {/* Add a note */}
      <div className="space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") saveNote();
          }}
          placeholder="Jot a note…  (⌘/Ctrl+Enter to save)"
          rows={2}
          className="w-full resize-y rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors"
        />
        <div className="flex justify-end">
          <button
            onClick={saveNote}
            disabled={saving || !draft.trim()}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition-all disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Save
          </button>
        </div>
      </div>

      {/* Drag-and-drop zone */}
      <div
        onDrop={handleDrop}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        className={`rounded-lg border border-dashed px-3 py-4 text-center text-[11px] font-mono transition-colors ${
          dragging
            ? "border-cyan-400 bg-cyan-500/10 text-cyan-300"
            : "border-slate-700 bg-slate-950 text-slate-500"
        }`}
      >
        Drop files / snippets here
      </div>

      {status && <p className="text-[11px] text-rose-400 font-mono">{status}</p>}

      {/* Entries — newest first */}
      <div className="border-t border-slate-800 pt-3">
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-2">
          Entries ({sorted.length})
        </div>
        {sorted.length === 0 ? (
          <p className="text-[11px] text-slate-600 font-mono">Nothing saved yet.</p>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            <AnimatePresence initial={false}>
              {sorted.map((entry) => (
                <motion.div
                  key={entry.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: "easeInOut" }}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <span className="pt-0.5">
                        <TypeIcon type={entry.type} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs text-slate-200 font-semibold truncate">{entry.title || "(untitled)"}</p>
                        {entry.type !== "file" && entry.content && (
                          <p className="text-[10px] text-slate-500 font-mono truncate">{entry.content}</p>
                        )}
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {entry.project && (
                            <span className="px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 text-[9px] font-mono">
                              {entry.project}
                            </span>
                          )}
                          <span className="text-[10px] text-slate-600 font-mono">{fmtAge(entry.ts)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {entry.type === "file" && (
                        <a
                          href={`${apiBase}/api/notebook/file/${encodeURIComponent(entry.id)}`}
                          target="_blank"
                          rel="noreferrer"
                          download={entry.fileName}
                          title="Open / download"
                          className="p-1 rounded text-slate-500 hover:text-cyan-300 hover:bg-slate-800 transition-colors"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <button
                        onClick={() => remove(entry.id)}
                        title="Delete"
                        className="p-1 rounded text-slate-600 hover:text-rose-400 hover:bg-slate-800 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
