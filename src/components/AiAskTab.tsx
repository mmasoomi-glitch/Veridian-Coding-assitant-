import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Sparkles, Send, Loader2, History, Database } from "lucide-react";

interface AskEntry {
  q: string;
  a: string;
  ts: string;
}

// Renders multi-line answer text, preserving newlines from the model.
function MultilineText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={className}>
      {text.split("\n").map((line, i) => (
        <p key={i} className={line.trim() ? "" : "h-2"}>
          {line}
        </p>
      ))}
    </div>
  );
}

export default function AiAskTab({ apiBase }: { apiBase: string }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string>("");
  const [usedContext, setUsedContext] = useState<string[]>([]);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string>("");
  const [history, setHistory] = useState<AskEntry[]>([]);

  const loadHistory = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/api/ask/history`);
      if (!r.ok) return;
      const data = await r.json();
      if (Array.isArray(data)) setHistory(data);
    } catch {
      /* offline; ignore */
    }
  }, [apiBase]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const ask = async () => {
    const q = question.trim();
    if (!q || thinking) return;
    setThinking(true);
    setError("");
    setAnswer("");
    setUsedContext([]);
    try {
      const r = await fetch(`${apiBase}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q })
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${r.status}`);
      }
      const data = await r.json();
      setAnswer(String(data?.answer ?? ""));
      setUsedContext(Array.isArray(data?.usedContext) ? data.usedContext : []);
      setQuestion("");
      loadHistory();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setThinking(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ask();
    }
  };

  const fmtTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return ts;
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-cyan-400">
        <Sparkles className="h-3.5 w-3.5" /> AI Ask — Your Context, Answered
      </div>

      {/* Question input */}
      <div className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={thinking}
          placeholder="e.g. What was the repo URL for the veridian project?"
          className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 disabled:opacity-60"
        />
        <button
          onClick={ask}
          disabled={thinking || !question.trim()}
          className="px-3 py-2 rounded-lg text-xs font-bold bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition-all disabled:opacity-50 flex items-center gap-1.5"
        >
          {thinking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {thinking ? "Thinking…" : "Ask"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <p className="text-[11px] text-rose-400 font-mono bg-rose-500/10 border border-rose-500/30 rounded-lg px-2.5 py-1.5">
          {error}
        </p>
      )}

      {/* Answer */}
      <AnimatePresence mode="wait">
        {answer && (
          <motion.div
            key={answer}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="bg-slate-950 border border-cyan-500/30 rounded-lg p-3 space-y-2"
          >
            <MultilineText text={answer} className="text-sm text-slate-100 leading-relaxed space-y-1" />
            {usedContext.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <Database className="h-3 w-3 text-slate-500" />
                {usedContext.map((src) => (
                  <span
                    key={src}
                    className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-500/15 text-cyan-300"
                  >
                    {src}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recent Q&A history */}
      <div className="border-t border-slate-800 pt-3">
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-2">
          <History className="h-3.5 w-3.5" /> Recent Questions ({history.length})
        </div>
        {history.length === 0 ? (
          <p className="text-[11px] text-slate-500 font-mono">No questions yet — ask something above.</p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            <AnimatePresence initial={false}>
              {history.map((h, i) => (
                <motion.div
                  key={`${h.ts}-${i}`}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: "easeInOut" }}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 space-y-1"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs text-cyan-300 font-semibold">{h.q}</span>
                    <span className="text-[10px] text-slate-600 font-mono shrink-0">{fmtTime(h.ts)}</span>
                  </div>
                  <MultilineText text={h.a} className="text-[11px] text-slate-400 leading-relaxed" />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
