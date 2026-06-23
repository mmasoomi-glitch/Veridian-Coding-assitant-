import React, { useEffect, useState, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Command as CommandIcon,
  Search,
  ArrowRightLeft,
  Wand2,
  FileCode,
  Terminal,
  Github,
  FileText,
  MessageSquarePlus,
  CornerDownLeft,
} from "lucide-react";

// A single runnable command in the palette. `hint` is a human-readable
// keyboard shortcut label shown on the right; `run` performs the action and
// resolves a short toast string (or void) for feedback.
interface Action {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => Promise<string | void> | string | void;
}

interface Toast {
  id: number;
  text: string;
}

// Fire-and-forget POST that never throws — the cockpit must never crash on a
// dead/offline server. Returns true on a 2xx response, false otherwise.
async function safePost(url: string, body?: unknown): Promise<boolean> {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export default function CommandPalette({ apiBase }: { apiBase: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const toastSeq = useRef(0);

  // Pop a small bottom-right toast that auto-dismisses after a few seconds.
  const pushToast = useCallback((text: string) => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t, { id, text }]);
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3200);
  }, []);

  const switchDesktop = useCallback(
    async (target: number) => {
      const ok = await safePost(`${apiBase}/api/desktop/switch`, { target });
      return ok ? `Switched to Desktop ${target}.` : `Couldn't switch (server offline?).`;
    },
    [apiBase]
  );

  const runAutopilot = useCallback(async () => {
    // Fire-and-forget — CommandDeck owns the full proposal UI; here we just kick it.
    pushToast("autopilot thinking…");
    void safePost(`${apiBase}/api/autopilot/next`);
  }, [apiBase, pushToast]);

  const launch = useCallback(
    async (what: "vscode" | "terminal" | "repo") => {
      const ok = await safePost(`${apiBase}/api/launch`, { what });
      const names: Record<string, string> = {
        vscode: "VS Code",
        terminal: "Terminal",
        repo: "repo on GitHub",
      };
      return ok ? `Opening ${names[what]}…` : `Couldn't open ${names[what]} (server offline?).`;
    },
    [apiBase]
  );

  // The full action catalogue. Order here is the default list order.
  const actions: Action[] = [
    {
      id: "desktop-1",
      label: "Switch to Desktop 1",
      hint: "Ctrl+1",
      icon: <ArrowRightLeft className="h-4 w-4 text-cyan-400" />,
      run: () => switchDesktop(1),
    },
    {
      id: "desktop-2",
      label: "Switch to Desktop 2",
      hint: "Ctrl+2",
      icon: <ArrowRightLeft className="h-4 w-4 text-cyan-400" />,
      run: () => switchDesktop(2),
    },
    {
      id: "desktop-3",
      label: "Switch to Desktop 3",
      hint: "Ctrl+3",
      icon: <ArrowRightLeft className="h-4 w-4 text-cyan-400" />,
      run: () => switchDesktop(3),
    },
    {
      id: "desktop-4",
      label: "Switch to Desktop 4",
      hint: "Ctrl+4",
      icon: <ArrowRightLeft className="h-4 w-4 text-cyan-400" />,
      run: () => switchDesktop(4),
    },
    {
      id: "autopilot",
      label: "Run Autopilot — what now?",
      hint: "Ctrl+Shift+A",
      icon: <Wand2 className="h-4 w-4 text-purple-400" />,
      run: () => {
        void runAutopilot();
      },
    },
    {
      id: "vscode",
      label: "Open VS Code here",
      icon: <FileCode className="h-4 w-4 text-sky-400" />,
      run: () => launch("vscode"),
    },
    {
      id: "terminal",
      label: "Open Terminal",
      icon: <Terminal className="h-4 w-4 text-emerald-400" />,
      run: () => launch("terminal"),
    },
    {
      id: "repo",
      label: "Open repo on GitHub",
      icon: <Github className="h-4 w-4 text-slate-300" />,
      run: () => launch("repo"),
    },
    {
      id: "new-note",
      label: "New note",
      icon: <FileText className="h-4 w-4 text-amber-400" />,
      run: () => {
        window.dispatchEvent(new CustomEvent("veridian:new-note"));
        return "New note requested.";
      },
    },
    {
      id: "new-prompt",
      label: "New prompt",
      icon: <MessageSquarePlus className="h-4 w-4 text-teal-400" />,
      run: () => {
        window.dispatchEvent(new CustomEvent("veridian:new-prompt"));
        return "New prompt requested.";
      },
    },
  ];

  // Substring filter over labels (case-insensitive). Empty query shows all.
  const q = query.trim().toLowerCase();
  const filtered = q ? actions.filter((a) => a.label.toLowerCase().includes(q)) : actions;

  // Run an action, surface its toast, and close the palette.
  const execute = useCallback(
    async (action: Action | undefined) => {
      if (!action) return;
      setOpen(false);
      try {
        const result = await action.run();
        if (typeof result === "string" && result) pushToast(result);
      } catch {
        pushToast("Action failed.");
      }
    },
    [pushToast]
  );

  // Reset cursor + focus the search box whenever the palette opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      // Focus after the modal has mounted/animated in.
      const id = window.setTimeout(() => inputRef.current?.focus(), 20);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  // Keep the active index in range as the filtered list shrinks/grows.
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  // The single global keydown layer. Registered once on mount, cleaned up on
  // unmount. Wrapped so a thrown handler never bubbles into the browser.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      try {
        const mod = e.ctrlKey || e.metaKey;

        // Ctrl/Cmd+K — toggle palette.
        if (mod && !e.shiftKey && (e.key === "k" || e.key === "K")) {
          e.preventDefault();
          setOpen((o) => !o);
          return;
        }

        // Ctrl/Cmd+Shift+A — run autopilot (global, regardless of palette).
        if (mod && e.shiftKey && (e.key === "a" || e.key === "A")) {
          e.preventDefault();
          void runAutopilot();
          return;
        }

        // Ctrl/Cmd+Shift+B — broadcast a backup prompt for other panels.
        if (mod && e.shiftKey && (e.key === "b" || e.key === "B")) {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("veridian:backup"));
          pushToast("Backup prompt triggered.");
          return;
        }

        // Ctrl/Cmd+1..4 — switch desktop (only when palette is closed so the
        // number keys still type into the search box when it's open).
        if (mod && !e.shiftKey && !open && e.key >= "1" && e.key <= "4") {
          e.preventDefault();
          const n = Number(e.key);
          void switchDesktop(n).then((msg) => {
            if (typeof msg === "string") pushToast(msg);
          });
          return;
        }

        // Palette-local navigation.
        if (open) {
          if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (filtered.length === 0 ? 0 : (a + 1) % filtered.length));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (filtered.length === 0 ? 0 : (a - 1 + filtered.length) % filtered.length));
          } else if (e.key === "Enter") {
            e.preventDefault();
            void execute(filtered[active]);
          }
        }
      } catch {
        /* never let a hotkey handler crash the page */
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, filtered, active, runAutopilot, switchDesktop, execute, pushToast]);

  return (
    <>
      {/* Always-visible hint chip, bottom-left so it doesn't fight the HUD. */}
      <div className="fixed bottom-6 left-6 z-40 pointer-events-none select-none">
        <div className="flex items-center gap-1.5 bg-slate-900/80 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[10px] font-mono text-slate-400 backdrop-blur-xl shadow-2xl">
          <CommandIcon className="h-3 w-3 text-cyan-400" />
          <span>
            <span className="text-slate-200 font-bold">⌘K / Ctrl+K</span> — Commands
          </span>
        </div>
      </div>

      {/* Command palette overlay */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="cmdk-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-950/70 backdrop-blur-sm pt-[18vh] px-4"
            onMouseDown={() => setOpen(false)}
          >
            <motion.div
              key="cmdk-modal"
              initial={{ opacity: 0, scale: 0.96, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -8 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="w-full max-w-xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden"
              onMouseDown={(e) => e.stopPropagation()}
            >
              {/* Search box */}
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-800">
                <Search className="h-4 w-4 text-slate-500 shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Type a command…"
                  className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none font-sans"
                />
                <span className="text-[9px] font-mono text-slate-600 border border-slate-800 rounded px-1.5 py-0.5">
                  ESC
                </span>
              </div>

              {/* Action list */}
              <div className="max-h-80 overflow-y-auto py-1.5">
                {filtered.length === 0 ? (
                  <div className="px-4 py-8 text-center text-xs text-slate-500 font-mono">
                    No matching commands.
                  </div>
                ) : (
                  filtered.map((a, i) => (
                    <button
                      key={a.id}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => void execute(a)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        i === active ? "bg-slate-800/80" : "hover:bg-slate-800/40"
                      }`}
                    >
                      <span className="shrink-0">{a.icon}</span>
                      <span className="flex-1 text-sm text-slate-200 truncate">{a.label}</span>
                      {a.hint && (
                        <span className="text-[10px] font-mono text-slate-500 border border-slate-800 rounded px-1.5 py-0.5 shrink-0">
                          {a.hint}
                        </span>
                      )}
                      {i === active && (
                        <CornerDownLeft className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                      )}
                    </button>
                  ))
                )}
              </div>

              {/* Footer legend */}
              <div className="flex items-center justify-between px-4 py-2 border-t border-slate-800 text-[10px] font-mono text-slate-600">
                <span>↑↓ navigate · ↵ run · esc close</span>
                <span className="text-slate-500">{filtered.length} commands</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toasts (bottom-right, stacked) */}
      <div className="fixed bottom-6 right-6 z-[110] flex flex-col items-end gap-2 pointer-events-none">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="bg-slate-900/95 border border-cyan-500/30 rounded-lg px-3.5 py-2 text-xs text-slate-200 font-mono shadow-2xl backdrop-blur-xl"
            >
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}
