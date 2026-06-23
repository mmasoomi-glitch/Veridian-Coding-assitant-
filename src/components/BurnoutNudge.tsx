import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Coffee, Heart, X, ArrowRight } from "lucide-react";

// Mirrors autopilot/burnout-store.ts BurnoutState. Built purely from
// privacy-safe keystroke TIMING metrics — never any typed content.
interface BurnoutState {
  score: number;
  level: "ok" | "tired" | "burnt";
  reasons: string[];
  ts: string;
}

// Empathetic, NON-alarming copy. Matched to level; reasons are appended as a
// soft sub-line so the message feels seen, not surveilled.
function message(level: "tired" | "burnt", reasons: string[]): { title: string; body: string } {
  const cleaned = reasons.filter((r) => r && r !== "steady" && r !== "no data");
  const detail = humanReasons(cleaned);
  if (level === "burnt") {
    return {
      title: "You've been pushing hard.",
      body: detail
        ? `${detail} — maybe a real break would help. The work will keep.`
        : "Maybe a real break would help. The work will keep."
    };
  }
  return {
    title: "Looks like a good moment to breathe.",
    body: detail
      ? `${detail}. No rush — pick it back up when you're ready.`
      : "No rush — pick it back up when you're ready."
  };
}

function humanReasons(reasons: string[]): string {
  if (!reasons.length) return "";
  const map: Record<string, string> = {
    "high correction rate": "lots of corrections lately",
    "slowing down": "your pace has eased off",
    "long pauses": "some long pauses",
    stalled: "things have gone quiet",
    "erratic bursts": "typing in fits and starts"
  };
  const mapped = reasons.map((r) => map[r] || r);
  if (mapped.length === 1) return cap(mapped[0]);
  return cap(mapped.slice(0, 2).join(" and "));
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function BurnoutNudge({ apiBase }: { apiBase: string }) {
  const [state, setState] = useState<BurnoutState | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let alive = true;

    async function poll() {
      try {
        const r = await fetch(`${apiBase}/api/burnout`);
        if (!r.ok) return;
        const data: BurnoutState = await r.json();
        if (!alive) return;
        // A fresh assessment re-opens a previously dismissed card only when the
        // signature (level + reasons) changes, so we don't nag on every poll.
        setState((prev) => {
          if (prev && sig(prev) !== sig(data)) setDismissed(false);
          return data;
        });
      } catch {
        /* keep last state; never throw in UI */
      }
    }

    poll();
    const id = setInterval(poll, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [apiBase]);

  const level = state?.level;
  const show = !dismissed && (level === "tired" || level === "burnt");

  function nextStep() {
    try {
      window.dispatchEvent(new CustomEvent("veridian:autopilot-next"));
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  // When the user is "ok" (or no data), render nothing at all.
  if (!show || !state || (level !== "tired" && level !== "burnt")) return null;

  const tired = level === "tired";
  const accent = tired
    ? {
        border: "border-amber-500/30",
        ring: "ring-amber-500/10",
        icon: "text-amber-300",
        chip: "bg-amber-500/15 text-amber-200 border-amber-500/30",
        btn: "bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border-amber-500/30"
      }
    : {
        border: "border-red-500/30",
        ring: "ring-red-500/10",
        icon: "text-red-300",
        chip: "bg-red-500/15 text-red-200 border-red-500/30",
        btn: "bg-red-500/15 hover:bg-red-500/25 text-red-200 border-red-500/30"
      };

  const { title, body } = message(level, state.reasons);
  const Icon = tired ? Coffee : Heart;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="burnout-nudge"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="fixed bottom-5 left-5 z-50 w-[300px]"
          role="status"
          aria-live="polite"
        >
          <div
            className={`bg-slate-900/95 backdrop-blur border ${accent.border} ring-1 ${accent.ring} rounded-2xl p-4 shadow-2xl space-y-3`}
          >
            <div className="flex items-start gap-2.5">
              <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${accent.icon}`} />
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold text-slate-100 leading-snug">{title}</p>
                <p className="text-[12px] text-slate-400 leading-relaxed">{body}</p>
              </div>
              <button
                onClick={() => setDismissed(true)}
                aria-label="Dismiss"
                className="ml-auto -mt-1 -mr-1 p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={nextStep}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] font-medium transition-colors ${accent.btn}`}
              >
                Show me my next step
                <ArrowRight className="h-3 w-3" />
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/50 hover:bg-slate-800 text-[12px] text-slate-400 hover:text-slate-200 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Stable signature of an assessment so we only re-surface on a real change.
function sig(s: BurnoutState): string {
  return `${s.level}|${[...s.reasons].sort().join(",")}`;
}
