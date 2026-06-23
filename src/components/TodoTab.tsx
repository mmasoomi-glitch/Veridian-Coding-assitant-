import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ListTodo, Plus, X, Check, Loader2, Sparkles, Clipboard } from "lucide-react";

interface Todo {
  id: string;
  ts: string;
  text: string;
  done: boolean;
  source?: string;
}

type Filter = "all" | "active" | "done";

// A small chip surfaced when a todo was auto-added by something other than the
// owner typing it (e.g. the autopilot, or captured from the clipboard).
function SourceChip({ source }: { source: string }) {
  const ai = source === "ai";
  const clip = source === "clipboard";
  const Icon = ai ? Sparkles : clip ? Clipboard : Sparkles;
  const tone = ai
    ? "bg-purple-500/15 text-purple-300 border-purple-500/30"
    : clip
    ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
    : "bg-slate-500/15 text-slate-300 border-slate-500/30";
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider border ${tone}`}
    >
      <Icon className="h-2.5 w-2.5" /> {source}
    </span>
  );
}

export default function TodoTab({ apiBase }: { apiBase: string }) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [text, setText] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/api/todos`);
      if (!r.ok) return;
      const next: Todo[] = await r.json();
      if (Array.isArray(next)) {
        // Only swap when content actually changed — avoids flicker on re-poll.
        setTodos((prev) => {
          const sig = (xs: Todo[]) => xs.map((x) => `${x.id}:${x.done}`).join("|");
          return sig(prev) === sig(next) ? prev : next;
        });
      }
    } catch {
      /* offline; ignore */
    }
  }, [apiBase]);

  useEffect(() => {
    load();
  }, [load]);

  const addTask = async () => {
    const t = text.trim();
    if (!t || adding) return;
    setAdding(true);
    setStatus("");
    // Optimistic: drop a placeholder in at the top immediately.
    const temp: Todo = {
      id: `temp-${Date.now()}`,
      ts: new Date().toISOString(),
      text: t,
      done: false
    };
    setTodos((prev) => [temp, ...prev]);
    setText("");
    try {
      const r = await fetch(`${apiBase}/api/todos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t })
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const saved: Todo = await r.json();
      // Replace the placeholder with the server's real record.
      setTodos((prev) => prev.map((x) => (x.id === temp.id ? saved : x)));
    } catch (e: any) {
      // Roll back the optimistic insert.
      setTodos((prev) => prev.filter((x) => x.id !== temp.id));
      setText(t);
      setStatus(`Couldn't add (is the server running?).`);
    } finally {
      setAdding(false);
    }
  };

  const toggle = async (id: string) => {
    if (id.startsWith("temp-")) return;
    // Optimistic flip.
    setTodos((prev) => prev.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));
    try {
      const r = await fetch(`${apiBase}/api/todos/${id}/toggle`, { method: "POST" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const saved: Todo = await r.json();
      setTodos((prev) => prev.map((x) => (x.id === id ? saved : x)));
    } catch {
      // Revert on failure.
      setTodos((prev) => prev.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));
      setStatus("Toggle failed.");
    }
  };

  const remove = async (id: string) => {
    if (id.startsWith("temp-")) return;
    const prevList = todos;
    // Optimistic removal.
    setTodos((prev) => prev.filter((x) => x.id !== id));
    try {
      const r = await fetch(`${apiBase}/api/todos/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    } catch {
      setTodos(prevList);
      setStatus("Delete failed.");
    }
  };

  const visible = todos.filter((t) =>
    filter === "all" ? true : filter === "active" ? !t.done : t.done
  );
  const activeCount = todos.filter((t) => !t.done).length;

  const filterBtn = (f: Filter, label: string) => (
    <button
      key={f}
      onClick={() => setFilter(f)}
      className={`px-2.5 py-1 rounded-md text-[11px] font-mono uppercase tracking-wider transition-all ${
        filter === f
          ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
          : "text-slate-400 border border-transparent hover:text-slate-200"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl space-y-4">
      {/* Header + add */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-emerald-400">
            <ListTodo className="h-3.5 w-3.5" /> Todo ({activeCount} active)
          </div>
          <div className="flex gap-1">
            {filterBtn("all", "All")}
            {filterBtn("active", "Active")}
            {filterBtn("done", "Done")}
          </div>
        </div>
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addTask();
            }}
            placeholder="Add a task…"
            className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
          />
          <button
            onClick={addTask}
            disabled={adding || !text.trim()}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition-all disabled:opacity-50 flex items-center gap-1.5"
          >
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add
          </button>
        </div>
      </div>

      {/* List */}
      <div className="border-t border-slate-800 pt-3">
        {visible.length === 0 ? (
          <p className="text-[11px] text-slate-500 font-mono">
            {filter === "done"
              ? "Nothing finished yet."
              : filter === "active"
              ? "No active tasks — all clear."
              : "No tasks yet. Add one above."}
          </p>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            <AnimatePresence initial={false}>
              {visible.map((t) => (
                <motion.div
                  key={t.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 flex items-center gap-2.5"
                >
                  <button
                    onClick={() => toggle(t.id)}
                    aria-label={t.done ? "Mark not done" : "Mark done"}
                    className={`h-4 w-4 shrink-0 rounded border flex items-center justify-center transition-all ${
                      t.done
                        ? "bg-emerald-500 border-emerald-500 text-slate-950"
                        : "border-slate-600 hover:border-emerald-500/60"
                    }`}
                  >
                    {t.done && <Check className="h-3 w-3" />}
                  </button>
                  <span
                    className={`flex-1 text-sm truncate ${
                      t.done ? "line-through text-slate-500" : "text-slate-100"
                    }`}
                  >
                    {t.text}
                  </span>
                  {t.source && <SourceChip source={t.source} />}
                  <button
                    onClick={() => remove(t.id)}
                    aria-label="Delete task"
                    className="shrink-0 text-slate-600 hover:text-rose-400 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
        {status && <p className="text-[11px] text-rose-400 font-mono mt-2">{status}</p>}
      </div>
    </div>
  );
}
