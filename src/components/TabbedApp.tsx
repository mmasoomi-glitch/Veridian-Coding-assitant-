import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { LayoutDashboard, Clipboard, MessageSquare, Image, ListTodo, Settings as SettingsIcon, Keyboard, ShieldCheck, Gauge, Home } from "lucide-react";
import App from "../App";
import FocusNow from "./FocusNow";
import ClipboardTab from "./ClipboardTab";
import AiAskTab from "./AiAskTab";
import ScreenshotsTab from "./ScreenshotsTab";
import TodoTab from "./TodoTab";
import SettingsTab from "./SettingsTab";
import KeyloggerTab from "./KeyloggerTab";
import AdminPanel from "./AdminPanel";
import ControlCenter from "./ControlCenter";
import BurnoutNudge from "./BurnoutNudge";

type TabDef = { id: string; label: string; Icon: typeof LayoutDashboard };

const TABS: TabDef[] = [
  { id: "home", label: "Home", Icon: Home },
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { id: "clipboard", label: "Clipboard", Icon: Clipboard },
  { id: "ask", label: "AI Ask", Icon: MessageSquare },
  { id: "shots", label: "Screenshots", Icon: Image },
  { id: "todo", label: "Todo", Icon: ListTodo },
  { id: "keylog", label: "Keystrokes", Icon: Keyboard },
  { id: "settings", label: "Settings", Icon: SettingsIcon }
];

// Admin-only tabs are appended only for admins (see role gating below).
const CONTROL_TAB: TabDef = { id: "control", label: "Control Center", Icon: Gauge };
const ACCESS_TAB: TabDef = { id: "access", label: "Access", Icon: ShieldCheck };

export default function TabbedApp({ apiBase }: { apiBase: string }) {
  const [tab, setTab] = useState("home");
  const [role, setRole] = useState<"admin" | "user" | null>(null);

  // Fetch the session role once so the Access tab can be shown only to admins.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${apiBase}/api/auth/status`, { credentials: "include" });
        if (!r.ok) return;
        const j = await r.json();
        if (!cancelled && (j?.role === "admin" || j?.role === "user")) setRole(j.role);
      } catch {
        /* role stays null -> Access tab hidden */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  const isAdmin = role === "admin";
  const tabs = isAdmin ? [...TABS, CONTROL_TAB, ACCESS_TAB] : TABS;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Tab bar */}
      <div className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-xl border-b border-slate-800 px-4">
        <div className="flex items-center gap-1 overflow-x-auto py-2">
          <span className="text-emerald-400 font-bold text-sm mr-1 pl-1 tracking-tight whitespace-nowrap">◆ Veridian</span>
          <span className="hidden md:inline text-[10px] text-slate-500 mr-3 whitespace-nowrap" title="Veridian™ is a trademark of Satellite World Trading LLC">v1.0.3 · by Satellite World Trading LLC</span>
          {tabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`relative px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                tab === id ? "text-emerald-300" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {tab === id && (
                <motion.span layoutId="tabpill" className="absolute inset-0 bg-emerald-500/15 border border-emerald-500/30 rounded-lg" transition={{ type: "spring", stiffness: 400, damping: 32 }} />
              )}
              <Icon className="h-3.5 w-3.5 relative z-10" />
              <span className="relative z-10">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          {tab === "home" && <FocusNow apiBase={apiBase} />}
          {tab === "dashboard" ? (
            <App />
          ) : (
            <div className="max-w-3xl mx-auto p-4 md:p-6">
              {tab === "clipboard" && <ClipboardTab apiBase={apiBase} />}
              {tab === "ask" && <AiAskTab apiBase={apiBase} />}
              {tab === "shots" && <ScreenshotsTab apiBase={apiBase} />}
              {tab === "todo" && <TodoTab apiBase={apiBase} />}
              {tab === "keylog" && <KeyloggerTab apiBase={apiBase} />}
              {tab === "settings" && <SettingsTab apiBase={apiBase} />}
              {tab === "control" && isAdmin && <ControlCenter apiBase={apiBase} />}
              {tab === "access" && isAdmin && <AdminPanel apiBase={apiBase} />}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Global burnout nudge (any tab) */}
      <BurnoutNudge apiBase={apiBase} />

      {/* Ownership / trademark footer */}
      <footer className="border-t border-slate-800 px-4 py-2 text-center text-[10px] leading-relaxed text-slate-500">
        © 2026 Satellite World Trading LLC · All Rights Reserved · Veridian™ is a trademark of Satellite World Trading LLC
      </footer>
    </div>
  );
}
