import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  FileText,
  Lightbulb,
  Loader2,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Wand2
} from "lucide-react";

interface Pdr {
  id: string;
  ts: string;
  idea: string;
  title: string;
  overview: string;
  problem: string;
  goals: string[];
  nonGoals: string[];
  users: string[];
  requirements: { title: string; detail: string; priority: "P0" | "P1" | "P2" }[];
  milestones: string[];
  risks: string[];
  openQuestions: string[];
}

const PRIORITY_STYLES: Record<string, string> = {
  P0: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  P1: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  P2: "bg-sky-500/15 text-sky-300 border-sky-500/30"
};

// Build markdown client-side from the PDR fields (mirrors pdrToMarkdown server-side).
function pdrToMarkdown(p: Pdr): string {
  const bullets = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join("\n") : "_None._");
  const reqs = p.requirements.length
    ? p.requirements.map((r) => `- **[${r.priority}] ${r.title}** — ${r.detail}`).join("\n")
    : "_None._";
  return `# ${p.title}

> ${p.overview}

_Generated ${p.ts} from idea: "${p.idea}"_

## Problem
${p.problem || "_Not specified._"}

## Goals
${bullets(p.goals)}

## Non-Goals
${bullets(p.nonGoals)}

## Target Users
${bullets(p.users)}

## Requirements
${reqs}

## Milestones
${bullets(p.milestones)}

## Risks
${bullets(p.risks)}

## Open Questions
${bullets(p.openQuestions)}
`;
}

function Section({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-slate-800 pt-3">
      <div className={`text-[11px] font-mono uppercase tracking-wider mb-1.5 ${accent}`}>{title}</div>
      {children}
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (!items?.length) return <p className="text-[11px] text-slate-500 font-mono">None.</p>;
  return (
    <ul className="space-y-1">
      {items.map((x, i) => (
        <li key={i} className="text-xs text-slate-300 flex gap-2">
          <span className="text-slate-600 select-none">·</span>
          <span>{x}</span>
        </li>
      ))}
    </ul>
  );
}

export default function PdrGenerator({ apiBase }: { apiBase: string }) {
  const [idea, setIdea] = useState("");
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState("");
  const [pdr, setPdr] = useState<Pdr | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState<Pdr[]>([]);
  const [showSaved, setShowSaved] = useState(false);

  const loadSaved = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/api/pdr`);
      if (!r.ok) return;
      const list: Pdr[] = await r.json();
      if (Array.isArray(list)) setSaved(list);
    } catch { /* offline; ignore */ }
  }, [apiBase]);

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  const generate = async () => {
    const clean = idea.trim();
    if (!clean || working) return;
    setWorking(true);
    setStatus("Generating PDR…");
    try {
      const r = await fetch(`${apiBase}/api/pdr/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: clean })
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${r.status}`);
      }
      const p: Pdr = await r.json();
      setPdr(p);
      setStatus("");
      loadSaved();
    } catch (e: any) {
      setStatus(`PDR error: ${e?.message || e}`);
    } finally {
      setWorking(false);
    }
  };

  const openPdr = async (id: string) => {
    try {
      const r = await fetch(`${apiBase}/api/pdr/${id}`);
      if (!r.ok) return;
      const p: Pdr = await r.json();
      setPdr(p);
      setStatus("");
    } catch { /* ignore */ }
  };

  const copyMarkdown = async () => {
    if (!pdr) return;
    try {
      await navigator.clipboard.writeText(pdrToMarkdown(pdr));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setStatus("Copy failed (clipboard unavailable).");
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-cyan-400">
        <FileText className="h-3.5 w-3.5" />
        <Lightbulb className="h-3.5 w-3.5" />
        PDR — Idea → Spec
      </div>

      {/* Idea input */}
      <div className="space-y-2">
        <textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="Describe your idea…"
          rows={3}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 resize-none"
        />
        <button
          onClick={generate}
          disabled={working || !idea.trim()}
          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition-all disabled:opacity-60 flex items-center gap-1.5"
        >
          {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
          {working ? "Generating…" : "Generate PDR"}
        </button>
        {status && <p className="text-[11px] text-slate-400 font-mono">{status}</p>}
      </div>

      {/* Rendered PDR */}
      <AnimatePresence mode="wait">
        {pdr && (
          <motion.div
            key={pdr.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="bg-slate-950 border border-cyan-500/20 rounded-lg p-3.5 space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-100">{pdr.title}</h3>
                <p className="text-[10px] text-slate-500 font-mono">
                  {new Date(pdr.ts).toLocaleString()}
                </p>
              </div>
              <button
                onClick={copyMarkdown}
                className="shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-slate-700 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/50 transition-all flex items-center gap-1.5"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy as Markdown"}
              </button>
            </div>

            {pdr.overview && <p className="text-sm text-slate-300">{pdr.overview}</p>}

            {pdr.problem && (
              <Section title="Problem" accent="text-rose-400">
                <p className="text-xs text-slate-300">{pdr.problem}</p>
              </Section>
            )}

            <Section title="Goals" accent="text-emerald-400">
              <BulletList items={pdr.goals} />
            </Section>

            <Section title="Non-Goals" accent="text-slate-400">
              <BulletList items={pdr.nonGoals} />
            </Section>

            <Section title="Target Users" accent="text-purple-400">
              <BulletList items={pdr.users} />
            </Section>

            <Section title="Requirements" accent="text-cyan-400">
              {pdr.requirements.length ? (
                <ul className="space-y-1.5">
                  {pdr.requirements.map((r, i) => (
                    <li key={i} className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${
                            PRIORITY_STYLES[r.priority] || PRIORITY_STYLES.P1
                          }`}
                        >
                          {r.priority}
                        </span>
                        <span className="text-xs font-semibold text-slate-200">{r.title}</span>
                      </div>
                      {r.detail && <p className="text-[11px] text-slate-400 mt-1">{r.detail}</p>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-slate-500 font-mono">None.</p>
              )}
            </Section>

            <Section title="Milestones" accent="text-sky-400">
              <BulletList items={pdr.milestones} />
            </Section>

            <Section title="Risks" accent="text-amber-400">
              <BulletList items={pdr.risks} />
            </Section>

            <Section title="Open Questions" accent="text-indigo-400">
              <BulletList items={pdr.openQuestions} />
            </Section>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Saved PDRs */}
      <div className="border-t border-slate-800 pt-3">
        <button
          onClick={() => setShowSaved((s) => !s)}
          className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-slate-400 hover:text-slate-200 transition-all"
        >
          {showSaved ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Saved PDRs ({saved.length})
        </button>
        <AnimatePresence>
          {showSaved && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="space-y-1.5 mt-2 max-h-44 overflow-y-auto">
                {saved.length === 0 ? (
                  <p className="text-[11px] text-slate-500 font-mono">No saved PDRs yet.</p>
                ) : (
                  saved.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => openPdr(p.id)}
                      className="w-full text-left bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 hover:border-cyan-500/40 transition-all"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-200 font-semibold truncate">{p.title}</span>
                        <span className="text-[10px] text-slate-500 font-mono shrink-0">
                          {new Date(p.ts).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 font-mono truncate">{p.idea}</p>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
