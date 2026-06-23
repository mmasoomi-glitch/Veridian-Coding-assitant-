import React, { useState, useEffect, useMemo } from "react";
import { 
  Monitor, 
  Terminal, 
  Folder, 
  FileText, 
  FileCode, 
  CheckCircle2, 
  Circle, 
  AlertTriangle, 
  Play, 
  RefreshCw, 
  Plus, 
  Search, 
  Trash2, 
  Volume2, 
  VolumeX, 
  Copy, 
  Clipboard, 
  User, 
  Bot, 
  Lock, 
  Download, 
  ShieldCheck,
  ChevronRight,
  Sparkles,
  Layers,
  Cpu,
  Clock,
  ExternalLink,
  Save,
  BellRing,
  Activity,
  Sliders,
  Settings
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { WorkspaceState, TimelineEvent, SessionHistory, AISummary } from "./types";
import SensorsSimulator from "./components/SensorsSimulator";
import ApkCompanion from "./components/ApkCompanion";
import CommandDeck from "./components/CommandDeck";
import AutopilotFleet from "./components/AutopilotFleet";
import Copybook from "./components/Copybook";
import ClipboardHistory from "./components/ClipboardHistory";
import PdrGenerator from "./components/PdrGenerator";
import PromptInventory from "./components/PromptInventory";
import BackupRestore from "./components/BackupRestore";
import CommandPalette from "./components/CommandPalette";

// Base URL for the backend API. Empty string => same-origin relative calls
// (web/dev). For the packaged APK, set VITE_API_BASE at build time to the
// deployed server, e.g. https://assistant.afaq24.store
const API_BASE = (import.meta as any).env?.VITE_API_BASE || "";

export default function App() {
  // Global API Config state
  const [dbConfig, setDbConfig] = useState<{ dbPath: string; status: string; apiKeyConfigured: boolean }>({
    dbPath: "./workspace-sessions.json",
    status: "active",
    apiKeyConfigured: false
  });

  // State representation
  const [sessions, setSessions] = useState<SessionHistory[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("live-telemetry");
  
  // Current active PC sensor state (Simulated)
  const [currentState, setCurrentState] = useState<WorkspaceState>({
    virtualDesktop: "Desktop 2 (Mira VPN Dev)",
    activeApp: "VS Code",
    windowTitle: "auth.service.ts",
    workspacePath: "D:\\MiraVPN",
    gitRepo: "mira-vpn",
    gitBranch: "develop",
    latestCommit: "c6a1b2d3 - Add JWT verify payload",
    modifiedFiles: ["auth.service.ts", "secure-route.ts"],
    terminalDir: "D:\\MiraVPN",
    terminalCommand: "docker compose up -d vpn-auth",
    browserDomain: "claude.ai",
    browserTitle: "Claude - Fix Token Payload Verification Code",
    browserTabUrl: "https://claude.ai/chat/21c890-aab",
    clipboardContent: "eyKey: 'v_prod_9921_xzz_k9'",
    clipboardCopiedAt: "2026-06-22T06:40:00Z",
    clipboardPasted: false,
    claudeSessionId: "claude-session-81c",
    activeTurn: "human"
  });

  // Custom task prompt requested for resuming session
  const [customResumeTask, setCustomResumeTask] = useState<string>("");

  // ElevenLabs BYOK and Settings Config states
  const [elevenLabsKey, setElevenLabsKey] = useState<string>(() => {
    return localStorage.getItem("veridian_byok_elevenlabs_key") || "";
  });
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState<string>("21m00Tcm4TlvDq8ikWAM"); // default: Rachel
  const [elevenLabsModel, setElevenLabsModel] = useState<string>("eleven_monolingual_v1");
  const [audioStatus, setAudioStatus] = useState<string>("");

  // APK Mobile Companion status
  const [awayModeEnabled, setAwayModeEnabled] = useState<boolean>(true);
  const [jobEstimatedMinutesLate, setJobEstimatedMinutesLate] = useState<number>(45);

  // Search through timeline state
  const [searchQuery, setSearchQuery] = useState<string>("");

  // AI briefing summary state
  const [aiBriefing, setAiBriefing] = useState<AISummary>({
    currentProject: "—",
    focus: "Generating live AI recall…",
    completed: [],
    pending: [],
    risks: []
  });

  const [isLoadingSummary, setIsLoadingSummary] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Layout UI states
  const [isNarrating, setIsNarrating] = useState<boolean>(false);
  const [showOverlayWidget, setShowOverlayWidget] = useState<boolean>(true);
  const [notifications, setNotifications] = useState<Array<{ id: string; title: string; text: string; type: 'warning' | 'info' | 'clipboard' }>>([]);

  // Command input simulation state
  const [customCommand, setCustomCommand] = useState<string>("");
  const [customFileChange, setCustomFileChange] = useState<string>("");
  const [customCopyString, setCustomCopyString] = useState<string>("");
  const [viewJsonMode, setViewJsonMode] = useState<boolean>(false);
  
  // Sync back to localstorage when elevenLabsKey changes
  useEffect(() => {
    localStorage.setItem("veridian_byok_elevenlabs_key", elevenLabsKey);
  }, [elevenLabsKey]);

  // Load databases configuration and sessions list
  const loadSessions = async () => {
    try {
      const configRes = await fetch(`${API_BASE}/api/db-config`);
      if (configRes.ok) {
        const configData = await configRes.json();
        setDbConfig(configData);
      }

      const res = await fetch(`${API_BASE}/api/sessions`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
        
        // Match active session details to currentState
        const matched = data.find((s: any) => s.sessionId === activeSessionId);
        if (matched) {
          syncStateWithSession(matched);
        }
      }
    } catch (e) {
      console.error("Local Server fallback triggered.", e);
    }
  };

  useEffect(() => {
    loadSessions();
  }, [activeSessionId]);

  // Re-sync local state variables whenever a database session changes
  const syncStateWithSession = (matched: SessionHistory) => {
    setCurrentState(prev => ({
      ...prev,
      workspacePath: matched.folderPath,
      claudeSessionId: matched.claudeSessionId,
      activeTurn: matched.activeTurn,
      clipboardContent: matched.clipboardContent,
      gitRepo: matched.folderPath.split("\\").pop() || "unknown",
      terminalDir: matched.folderPath
    }));
  };

  // Push modified state or tasks database back to server file
  const saveSessionsToServer = async (updatedSessions: SessionHistory[]) => {
    try {
      const res = await fetch(`${API_BASE}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedSessions)
      });
      if (res.ok) {
        setSessions(updatedSessions);
      }
    } catch (err) {
      setSessions(updatedSessions);
      console.warn("Saved in local memory state.", err);
    }
  };

  // Active session reference. Prefers a real matched session; the fallback is an
  // EMPTY live-telemetry shell (no fiction) used before telemetry has populated.
  const activeSession = useMemo(() => {
    return sessions.find(s => s.sessionId === activeSessionId) || {
      sessionId: "live-telemetry",
      folderPath: "",
      claudeSessionId: "",
      activeTurn: "human" as const,
      lastTimestamp: new Date().toISOString(),
      clipboardContent: "",
      completedTasks: [],
      pendingTasks: [],
      timeline: []
    };
  }, [sessions, activeSessionId]);

  // Handlers to simulate developer actions adding events to timeline
  const addTimelineEvent = (type: TimelineEvent['type'], title: string, details: string, important = false) => {
    const newEvent: TimelineEvent = {
      id: "ev-" + Date.now(),
      timestamp: new Date().toISOString(),
      type,
      title,
      details,
      important
    };

    const updatedSessions = sessions.map(s => {
      if (s.sessionId === activeSessionId) {
        return {
          ...s,
          lastTimestamp: new Date().toISOString(),
          timeline: [newEvent, ...s.timeline]
        };
      }
      return s;
    });

    if (sessions.length === 0) {
      const defaultSes: SessionHistory = {
        sessionId: activeSessionId,
        folderPath: currentState.workspacePath,
        claudeSessionId: currentState.claudeSessionId,
        activeTurn: currentState.activeTurn,
        lastTimestamp: new Date().toISOString(),
        clipboardContent: currentState.clipboardContent,
        completedTasks: ["Review setup documentation"],
        pendingTasks: ["Fix pending modules"],
        timeline: [newEvent]
      };
      saveSessionsToServer([defaultSes]);
    } else {
      saveSessionsToServer(updatedSessions);
    }
  };

  // Trigger real AI generation on backend Express API
  const generateAIConsistentSummary = async () => {
    setIsLoadingSummary(true);
    setErrorMessage(null);
    try {
      // 1. Pull LIVE machine telemetry (real active window, clipboard, git, etc.)
      //    Fall back to the current UI state if the collector is unavailable.
      let liveState: any = currentState;
      let liveTimeline: any = activeSession.timeline;
      try {
        const teleRes = await fetch(`${API_BASE}/api/telemetry/current`);
        if (teleRes.ok) {
          const tele = await teleRes.json();
          liveState = { ...currentState, ...tele.currentState };
          liveTimeline = tele.timeline;
          setCurrentState(prev => ({ ...prev, ...tele.currentState }));
        }
      } catch (teleErr) {
        console.warn("Telemetry unavailable; using current UI state.", teleErr);
      }

      // 2. Ask DeepSeek to summarize the REAL state.
      const res = await fetch(`${API_BASE}/api/ai/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentState: liveState,
          timelineLog: liveTimeline,
          customResumeTask
        })
      });

      if (res.ok) {
        const rawJson = await res.json();
        setAiBriefing(rawJson);
        setIsLoadingSummary(false);
      } else {
        const errJson = await res.json();
        throw new Error(errJson.error || "Summarization endpoint failed");
      }
    } catch (e: any) {
      console.warn("Falling back to local heuristic analyzer:", e);
      setErrorMessage(e?.message || "Verify your API configuration");

      setTimeout(() => {
        setAiBriefing({
          currentProject: currentState.gitRepo === "mira-vpn" ? "Mira VPN" : "AFAQ Kernel OS",
          focus: `Switched into ${currentState.activeApp} reviewing '${currentState.windowTitle}' on virtual desktop ${currentState.virtualDesktop}`,
          completed: activeSession.completedTasks.length > 0 
            ? activeSession.completedTasks 
            : ["Initiated active session setup", "Created local file system checks"],
          pending: [
            `Continue modifications to ${currentState.windowTitle}`,
            currentState.modifiedFiles.length > 0 
              ? `Commit stashed files: ${currentState.modifiedFiles.join(", ")}`
              : "Synchronize local folder repository and stage next feature",
            ...(activeSession.pendingTasks || [])
          ],
          risks: [
            currentState.modifiedFiles.length >= 2 
              ? `${currentState.modifiedFiles.length} files currently uncommitted.`
              : "No massive uncommitted work.",
            !currentState.clipboardPasted && currentState.clipboardContent
              ? `Clipboard has an unpasted item matching secure credentials.`
              : "Pruned clipboard to protect credentials state."
          ]
        });
        setIsLoadingSummary(false);
      }, 700);
    }
  };

  // Auto-run the live AI recall on first load and whenever the active session
  // changes, so the panel shows real DeepSeek output instead of placeholder text.
  useEffect(() => {
    generateAIConsistentSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  // Narrate current briefing aloud via local SpeechSynthesis API or ElevenLabs V3 BYOK Proxy
  const handleVocalBriefing = async (textOverride?: string) => {
    if (isNarrating) {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      setIsNarrating(false);
      setAudioStatus("");
      return;
    }

    const textToSpeak = textOverride || `Veridian Context Report. You are currently working on ${aiBriefing.currentProject}. Active focus: ${aiBriefing.focus}. Your pending tasks are: ${aiBriefing.pending.join(". ")}. Risks detected: ${aiBriefing.risks.join(". ")}`;
    
    setIsNarrating(true);
    setAudioStatus("Requesting speech compilation...");

    if (!elevenLabsKey) {
      setAudioStatus("No ElevenLabs Key. Playing standard voice...");
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.onend = () => {
          setIsNarrating(false);
          setAudioStatus("");
        };
        utterance.onerror = () => {
          setIsNarrating(false);
          setAudioStatus("");
        };
        window.speechSynthesis.speak(utterance);
      } else {
        setIsNarrating(false);
        setAudioStatus("WebSpeech unsupported on this browser.");
      }
      return;
    }

    setAudioStatus("Synthesizing premium voice via ElevenLabs API...");
    try {
      const response = await fetch(`${API_BASE}/api/elevenlabs/tts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: textToSpeak,
          apiKey: elevenLabsKey,
          voiceId: elevenLabsVoiceId,
          modelId: elevenLabsModel
        })
      });

      if (!response.ok) {
        const errorJson = await response.json();
        throw new Error(errorJson.error || `HTTP ${response.status}`);
      }

      setAudioStatus("Playing ElevenLabs stream...");
      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      
      audio.onended = () => {
        setIsNarrating(false);
        setAudioStatus("");
      };
      
      audio.onerror = () => {
        setIsNarrating(false);
        setAudioStatus("Playback error on audio tag.");
      };

      await audio.play();
    } catch (err: any) {
      console.warn("ElevenLabs TTS failed. Falling back to native SpeechSynthesis:", err);
      setAudioStatus(`Fallback: playing Web Speech...`);
      
      setTimeout(() => {
        if ("speechSynthesis" in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(textToSpeak);
          utterance.onend = () => {
            setIsNarrating(false);
            setAudioStatus("");
          };
          window.speechSynthesis.speak(utterance);
        } else {
          setIsNarrating(false);
          setAudioStatus("");
        }
      }, 1200);
    }
  };

  // Keyboard simulator shortcuts / Scenarios handlers
  const loadScenario = (index: number) => {
    if (index === 1) {
      setActiveSessionId("session-mira-102");
      const baseState: WorkspaceState = {
        virtualDesktop: "Desktop 2 (Mira VPN Dev)",
        activeApp: "VS Code",
        windowTitle: "auth.service.ts",
        workspacePath: "D:\\MiraVPN",
        gitRepo: "mira-vpn",
        gitBranch: "develop",
        latestCommit: "c6a1b2d3 - Add JWT verify payload",
        modifiedFiles: ["auth.service.ts", "secure-route.ts"],
        terminalDir: "D:\\MiraVPN",
        terminalCommand: "docker compose up -d vpn-auth",
        browserDomain: "claude.ai",
        browserTitle: "Claude - Fix Token Payload Verification Code",
        browserTabUrl: "https://claude.ai/chat/21c890-aab",
        clipboardContent: "eyKey: 'v_prod_9921_xzz_k9'",
        clipboardCopiedAt: new Date().toISOString(),
        clipboardPasted: false,
        claudeSessionId: "claude-session-81c",
        activeTurn: "human"
      };
      setCurrentState(baseState);
      
      setNotifications([
        {
          id: "notif-2",
          title: "Forgotten Secret Clipboard",
          text: "Varying secret string 'eyKey: 'v_prod_9921_xzz_k9'' has been copied for 8 minutes and never pasted.",
          type: "clipboard"
        }
      ]);
      
      addTimelineEvent("desktop", "Returned from lunch break", "Memory state restored for Desktop 2 (Mira VPN Dev).", true);
    } else if (index === 2) {
      const baseState: WorkspaceState = {
        virtualDesktop: "Desktop 1 (Kernel OS Dev)",
        activeApp: "Claude Code",
        windowTitle: "alloc.h",
        workspacePath: "D:\\AFAQ-OS",
        gitRepo: "afaq-os",
        gitBranch: "feature/kernel-allocator",
        latestCommit: "0a11fcde - Kernel mainline patch",
        modifiedFiles: ["alloc.h", "memory.ld", "heap_alloc.ts", "boot.asm"],
        terminalDir: "D:\\AFAQ-OS",
        terminalCommand: "claude -y 'Refactor register mapping allocations'",
        browserDomain: "github.com",
        browserTitle: "AFAQ Kernel Issues - Page 12",
        browserTabUrl: "https://github.com/afaqsubs/afaq-os/issues/12",
        clipboardContent: "https://github.com/afaqsubs/afaq-os/pull/44",
        clipboardCopiedAt: new Date().toISOString(),
        clipboardPasted: true,
        claudeSessionId: "claude-session-2a4",
        activeTurn: "agent"
      };
      
      setCurrentState(baseState);
      setActiveSessionId("session-afaq-301");

      setNotifications([
        {
          id: "notif-3",
          title: "Active Claude Session Running",
          text: "Claude Code agent has active turn token at CMD workspace on Desktop 1.",
          type: "info"
        },
        {
          id: "notif-4",
          title: "High Uncommitted Count",
          text: "4 modified system core files have been modified. Remote push suggested.",
          type: "warning"
        }
      ]);

      addTimelineEvent("terminal", "Claude Agent Task active", "AI agent took the active token. Started allocator overhaul.", true);
    } else if (index === 3) {
      setCurrentState(prev => ({
        ...prev,
        virtualDesktop: "Desktop 4 (Personal Stuff)",
        activeApp: "Chrome",
        windowTitle: "Hacker News - ADHD programmer workflow discussion",
        browserDomain: "news.ycombinator.com",
        browserTabUrl: "https://news.ycombinator.com/item?id=38192131"
      }));

      setNotifications([
        {
          id: "notif-1",
          title: "Context Lost (Heuristics Alert)",
          text: "You have switched virtual desktops and projects 12 times in 20 minutes! Take a breather.",
          type: "warning"
        },
        {
          id: "notif-2",
          title: "Forgotten Secret Clipboard",
          text: "A production token was copied prior to switching out of Mira VPN and never pasted.",
          type: "clipboard"
        }
      ]);

      addTimelineEvent("desktop", "Virtual Desktop switch storm", "Switched desktops between Coding, Social and Personal in high frequency.", true);
    }
  };

  // Helper tasks modifiers
  const toggleCompleted = (taskText: string, isFromCompleted: boolean) => {
    let updatedCompleted = [...aiBriefing.completed];
    let updatedPending = [...aiBriefing.pending];

    if (isFromCompleted) {
      updatedCompleted = updatedCompleted.filter(t => t !== taskText);
      updatedPending.push(taskText);
      addTimelineEvent("vscode", "Task Moved to Pending", `Strived task returned to unfinished queues: "${taskText}"`);
    } else {
      updatedPending = updatedPending.filter(t => t !== taskText);
      updatedCompleted.push(taskText);
      addTimelineEvent("vscode", "Completed Goal Stashed", `Job requirements satisfied: "${taskText}"`, true);
    }

    setAiBriefing(prev => ({
      ...prev,
      completed: updatedCompleted,
      pending: updatedPending
    }));

    const updatedSessions = sessions.map(s => {
      if (s.sessionId === activeSessionId) {
        return {
          ...s,
          completedTasks: updatedCompleted,
          pendingTasks: updatedPending
        };
      }
      return s;
    });
    saveSessionsToServer(updatedSessions);
  };

  const addNewTaskItem = (isPending: boolean, text: string) => {
    const updatedSessions = sessions.map(s => {
      if (s.sessionId === activeSessionId) {
        if (isPending) {
          return { ...s, pendingTasks: [...s.pendingTasks, text] };
        } else {
          return { ...s, completedTasks: [...s.completedTasks, text] };
        }
      }
      return s;
    });
    
    setAiBriefing(p => {
      const copy = { ...p };
      if (isPending) copy.pending = [...copy.pending, text];
      else copy.completed = [...copy.completed, text];
      return copy;
    });

    saveSessionsToServer(updatedSessions);
    addTimelineEvent("vscode", "New Target Task Added", `Manually requested workspace metric task: "${text}"`);
  };

  // Filter our searchable history timeline list
  const filteredTimeline = useMemo(() => {
    if (!searchQuery.trim()) return activeSession.timeline;
    return activeSession.timeline.filter(e => 
      e.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      e.details.toLowerCase().includes(searchQuery.toLowerCase()) || 
      e.type.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [activeSession.timeline, searchQuery]);

  // Remove a timeline item manually
  const removeTimelineItem = (id: string) => {
    const updatedSessions = sessions.map(s => {
      if (s.sessionId === activeSessionId) {
        return {
          ...s,
          timeline: s.timeline.filter(ev => ev.id !== id)
        };
      }
      return s;
    });
    saveSessionsToServer(updatedSessions);
  };

  // Function to clear all timeline logs to clean restart
  const clearTimeline = () => {
    const updatedSessions = sessions.map(s => {
      if (s.sessionId === activeSessionId) {
        return {
          ...s,
          timeline: []
        };
      }
      return s;
    });
    saveSessionsToServer(updatedSessions);
  };

  // Generate downloadable JSON file
  const downloadSessionJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(activeSession, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `veridian-session-${activeSessionId}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500/30 selection:text-emerald-300">
      
      {/* 1. Header Status Bar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-xl sticky top-0 z-40 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center justify-center text-emerald-400">
            <Cpu className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-bold text-lg tracking-tight bg-gradient-to-r from-emerald-400 to-teal-200 bg-clip-text text-transparent">
                Veridian Workspace Memory
              </h1>
              <span className="text-[10px] bg-slate-800 text-slate-400 font-mono px-2 py-0.5 rounded border border-slate-700 font-bold">
                APK Ready v3.0
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Away Telemetry Endpoint: /api/elevenlabs/tts &bull; Active: {activeSessionId}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Scenario A/B/C demo presets removed — replaced by real PDR + Prompt
              Inventory panels in the main column. */}

          <button
            onClick={() => setShowOverlayWidget(prev => !prev)}
            className={`text-xs px-3 py-1.5 rounded-md font-medium flex items-center gap-1.5 border transition-all ${showOverlayWidget ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-300"}`}
          >
            <Layers className="h-3.5 w-3.5" />
            HUD Overlay
          </button>
        </div>
      </header>

      {/* Grid container responsive layout */}
      <div className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* COL 1: Left sensors columns (3 Columns) */}
        <section className="lg:col-span-12 xl:col-span-3 space-y-6">
          <SensorsSimulator
            currentState={currentState}
            setCurrentState={setCurrentState}
            addTimelineEvent={addTimelineEvent}
            customFileChange={customFileChange}
            setCustomFileChange={setCustomFileChange}
            customCommand={customCommand}
            setCustomCommand={setCustomCommand}
            customCopyString={customCopyString}
            setCustomCopyString={setCustomCopyString}
            setNotifications={setNotifications}
            dbConfig={dbConfig}
            downloadSessionJson={downloadSessionJson}
            activeSession={activeSession}
          />
        </section>

        {/* COL 2: Center Main workspace (5 Columns) */}
        <section className="lg:col-span-12 xl:col-span-5 space-y-6">
          
          {/* Notifications component */}
          {notifications.length > 0 && (
            <div className="space-y-2">
              <span className="text-[11px] font-mono font-bold tracking-wider text-slate-400 uppercase">
                Active Cognitive Distraction Alerts
              </span>
              <div className="space-y-2">
                {notifications.map((notif) => (
                  <div 
                    key={notif.id} 
                    className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs relative overflow-hidden bg-slate-900/40 ${
                      notif.type === "warning" 
                        ? "border-red-500/30 text-red-200" 
                        : notif.type === "clipboard" 
                          ? "border-yellow-500/20 text-yellow-100" 
                          : "border-sky-500/20 text-sky-200"
                    }`}
                  >
                    {notif.type === "warning" && <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />}
                    {notif.type === "clipboard" && <Clipboard className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />}
                    {notif.type === "info" && <Bot className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />}
                    
                    <div className="space-y-0.5 pr-6">
                      <span className="font-bold underline text-[11px]">{notif.title}</span>
                      <p className="opacity-90 leading-normal">{notif.text}</p>
                    </div>

                    <button 
                      onClick={() => setNotifications(p => p.filter(n => n.id !== notif.id))}
                      className="absolute top-1.5 right-2 text-slate-500 hover:text-slate-300 px-1 text-[11px]"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Global command palette + hotkeys (Ctrl/Cmd+K) */}
          <CommandPalette apiBase={API_BASE} />

          {/* Command Deck: desktop switch + autopilot + waiting-on-you */}
          <CommandDeck apiBase={API_BASE} desktopCount={4} />

          {/* Autopilot Fleet: one Opus session per desktop project */}
          <AutopilotFleet apiBase={API_BASE} />

          {/* PDR generator + Prompt inventory (replaced the fake Scenario buttons) */}
          <PdrGenerator apiBase={API_BASE} />
          <PromptInventory apiBase={API_BASE} />

          {/* Copybook (notes/files) + Clipboard history + Backup/Restore */}
          <Copybook apiBase={API_BASE} />
          <ClipboardHistory apiBase={API_BASE} />
          <BackupRestore apiBase={API_BASE} />

          {/* Core AI reconstruction cockpit card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl relative overflow-hidden">
            <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 border border-purple-500/20 rounded font-bold absolute top-5 right-5 uppercase tracking-wider">
              DeepSeek Smart Recall
            </span>

            <h2 className="text-sm font-bold text-slate-200 mb-4 pb-1.5 border-b border-slate-800/80 flex items-center gap-1.5">
              <Sparkles className="h-4.5 w-4.5 text-emerald-400" />
              State Reconstruction Summary
            </h2>

            <div className="space-y-4">
              
              {/* Current focus */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-1">
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest block font-bold">
                  Active Cognitive Thread
                </span>
                <p className="text-xs text-slate-200 leading-normal font-sans">
                  {aiBriefing.focus}
                </p>
              </div>

              {/* Requirements & Tasks lists */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Completed */}
                <div className="bg-slate-950/40 border border-slate-850 p-3.5 rounded-xl space-y-2">
                  <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-wide block border-b border-slate-850 pb-1.5">
                    ✓ Completed in this run
                  </span>
                  <ul className="space-y-2">
                    {aiBriefing.completed.map((task, idx) => (
                      <li key={idx} className="text-[11px] text-slate-400 flex items-start gap-1.5 leading-snug">
                        <CheckCircle2 
                          className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5 cursor-pointer" 
                          onClick={() => toggleCompleted(task, true)} 
                        />
                        <span className="line-through opacity-75">{task}</span>
                      </li>
                    ))}
                    {aiBriefing.completed.length === 0 && (
                      <span className="text-[11px] text-slate-500 italic block">No completed items stashed.</span>
                    )}
                  </ul>
                  <div className="pt-1">
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      const formInput = (e.currentTarget.elements.namedItem("compTask") as HTMLInputElement);
                      if (formInput.value.trim()) {
                        addNewTaskItem(false, formInput.value.trim());
                        formInput.value = "";
                      }
                    }} className="flex gap-1">
                      <input name="compTask" placeholder="+ Completed manual job..." className="bg-slate-950 border border-slate-850 text-[10px] px-2 py-1 rounded w-full focus:outline-none focus:border-slate-800 placeholder:text-slate-600 font-mono text-slate-300" />
                    </form>
                  </div>
                </div>

                {/* Outstanding / Pending */}
                <div className="bg-slate-950/40 border border-slate-850 p-3.5 rounded-xl space-y-2">
                  <span className="text-[10px] font-mono font-bold text-teal-400 uppercase tracking-wide block border-b border-slate-850 pb-1.5">
                    ⚡ Outstanding Goals
                  </span>
                  <ul className="space-y-2">
                    {aiBriefing.pending.map((task, idx) => (
                      <li key={idx} className="text-[11px] text-slate-300 flex items-start gap-1.5 leading-snug">
                        <Circle 
                          className="h-3.5 w-3.5 text-teal-500 shrink-0 mt-0.5 cursor-pointer hover:text-emerald-400 hover:scale-110 transition-transform" 
                          onClick={() => toggleCompleted(task, false)} 
                        />
                        <span>{task}</span>
                      </li>
                    ))}
                    {aiBriefing.pending.length === 0 && (
                      <span className="text-[11px] text-slate-500 italic block">All pending requirements satisfies!</span>
                    )}
                  </ul>
                  <div className="pt-1">
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      const formInput = (e.currentTarget.elements.namedItem("pendTask") as HTMLInputElement);
                      if (formInput.value.trim()) {
                        addNewTaskItem(true, formInput.value.trim());
                        formInput.value = "";
                      }
                    }} className="flex gap-1">
                      <input name="pendTask" placeholder="+ Pending target requirement..." className="bg-slate-950 border border-slate-850 text-[10px] px-2 py-1 rounded w-full focus:outline-none focus:border-slate-800 placeholder:text-slate-600 font-mono text-slate-300" />
                    </form>
                  </div>
                </div>

              </div>

              {/* Warnings Risks summary lists */}
              {aiBriefing.risks.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wide block">Cognitive Interrupt Warnings</span>
                  <div className="bg-red-950/20 border border-red-500/25 p-3 rounded-xl space-y-1.5">
                    {aiBriefing.risks.map((risk, idx) => (
                      <div key={idx} className="text-[11px] text-red-200 flex items-start gap-1.5 leading-normal">
                        <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                        <span>{risk}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Synthesis actions trigger block */}
              <div className="border-t border-slate-800 pt-4 flex flex-wrap justify-between items-center gap-3">
                
                <button
                  type="button"
                  onClick={() => handleVocalBriefing()}
                  className={`text-xs px-3.5 py-2 rounded-xl border flex items-center gap-2.5 transition-all cursor-pointer font-sans select-none ${
                    isNarrating
                      ? "bg-purple-500/20 border-purple-500/40 text-purple-300 animate-pulse"
                      : "bg-slate-950 border-slate-800 text-slate-300 hover:text-slate-100 hover:border-slate-700"
                  }`}
                  title="Narrate context briefing out loud"
                >
                  {isNarrating ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4 text-purple-400" />}
                  <span>{isNarrating ? "Stop Audio" : "Narrate Session"}</span>
                </button>

                <button
                  onClick={generateAIConsistentSummary}
                  disabled={isLoadingSummary}
                  className="bg-emerald-500 text-slate-950 hover:bg-emerald-400 font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-75"
                >
                  {isLoadingSummary ? (
                    <RefreshCw className="h-4.5 w-4.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 text-slate-950" />
                  )}
                  <span>{isLoadingSummary ? "Analyzing..." : "Ask AI 'Where was I?'"}</span>
                </button>

              </div>

              {errorMessage && (
                <p className="text-[10px] text-yellow-500 hover:underline text-center cursor-pointer font-mono pt-1">
                  Heuristic active format output parsed. Configure DEEPSEEK_API_KEY to test actual LLM summaries.
                </p>
              )}

            </div>
          </div>

          {/* Memory Timeline List log with search */}
          <div className="bg-slate-900 border border-slate-850 rounded-xl p-4 flex flex-col h-[400px]">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-cyan-400" />
                Raw Telemetry History ({activeSession.timeline.length})
              </h3>
              {activeSession.timeline.length > 0 && (
                <button onClick={clearTimeline} className="text-[10px] text-slate-500 hover:text-slate-300 font-mono">
                  Clear Logs
                </button>
              )}
            </div>

            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search raw context traces..."
                className="bg-slate-950 border border-slate-850 text-slate-200 text-xs rounded-lg pl-8 p-2 w-full focus:outline-none focus:border-emerald-500/50 font-mono"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 font-mono text-xs">
              {filteredTimeline.length === 0 ? (
                <div className="text-center py-12 text-slate-500">No events found.</div>
              ) : (
                filteredTimeline.map((ev) => (
                  <div key={ev.id} className="relative pl-5 border-l border-slate-800 group">
                    <div className={`absolute -left-1.5 top-0.5 h-3 w-3 rounded-full border flex items-center justify-center ${
                      ev.important 
                        ? "bg-amber-500/20 border-amber-500 text-amber-400" 
                        : ev.type === "desktop" 
                          ? "bg-cyan-500/10 border-cyan-500 text-cyan-400"
                          : ev.type === "terminal" 
                            ? "bg-purple-500/10 border-purple-500 text-purple-400"
                            : "bg-slate-800 border-slate-700 text-slate-400"
                    }`}>
                      <div className="h-1 w-1 bg-current rounded-full" />
                    </div>

                    <div className="space-y-0.5">
                      <div className="flex justify-between items-center text-[10.5px]">
                        <span className="font-bold text-slate-300 group-hover:text-emerald-300 transition-colors">
                          {ev.title}
                        </span>
                        <div className="flex items-center gap-1.5 text-[9px] text-slate-500">
                          <span>{new Date(ev.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}</span>
                          <button onClick={() => removeTimelineItem(ev.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300">✕</button>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-snug">{ev.details}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 mt-2 border-t border-slate-850 flex justify-between text-[10px] text-slate-500">
              <span>Database Sync Active</span>
              <button onClick={() => setViewJsonMode(!viewJsonMode)} className="text-cyan-400 hover:underline">
                {viewJsonMode ? "Hide DB Schema" : "Show Session DB JSON 📂"}
              </button>
            </div>
          </div>

          {/* database JSON browser */}
          {viewJsonMode && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 font-mono text-[9px] space-y-2">
              <span className="text-slate-300 font-bold">WORKSPACE-SESSIONS.JSON</span>
              <textarea
                readOnly
                value={JSON.stringify(activeSession, null, 2)}
                className="w-full h-36 bg-slate-950 text-emerald-400 border border-slate-850 p-2 rounded resize-none focus:outline-none"
              />
            </div>
          )}

        </section>

        {/* COL 3: Right APK companion preview (4 Columns) */}
        <section className="lg:col-span-12 xl:col-span-4">
          <ApkCompanion
            currentState={currentState}
            aiBriefing={aiBriefing}
            timeline={activeSession.timeline}
            elevenLabsKey={elevenLabsKey}
            setElevenLabsKey={setElevenLabsKey}
            elevenLabsVoiceId={elevenLabsVoiceId}
            setElevenLabsVoiceId={setElevenLabsVoiceId}
            elevenLabsModel={elevenLabsModel}
            setElevenLabsModel={setElevenLabsModel}
            isNarrating={isNarrating}
            audioStatus={audioStatus}
            handleVocalBriefing={handleVocalBriefing}
            awayModeEnabled={awayModeEnabled}
            setAwayModeEnabled={setAwayModeEnabled}
            jobEstimatedMinutesLate={jobEstimatedMinutesLate}
            setJobEstimatedMinutesLate={setJobEstimatedMinutesLate}
          />
        </section>

      </div>

      {/* Floating HUD simulator */}
      <AnimatePresence>
        {showOverlayWidget && (
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 30 }}
            className="fixed bottom-6 right-6 z-50 w-72 bg-slate-900/90 border border-emerald-500/20 rounded-xl p-4 shadow-3xl backdrop-blur-xl pointer-events-auto"
          >
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-850 mb-2.5">
              <span className="text-[9.5px] font-mono font-bold tracking-wider text-slate-400 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                VERIDIAN HEADS-UP HUD
              </span>
              <button onClick={() => setShowOverlayWidget(false)} className="text-[10px] text-slate-500 hover:text-slate-200 font-mono">[hide]</button>
            </div>

            <div className="space-y-1 text-[10.5px] font-mono text-slate-400">
              <div className="flex justify-between">
                <span>ACTIVE PROJECT:</span>
                <span className="text-emerald-400 font-bold">{currentState.gitRepo.toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span>DESKTOP INDEX:</span>
                <span className="text-cyan-400">{currentState.virtualDesktop.split("(")[0].trim()}</span>
              </div>
              <div className="flex justify-between truncate">
                <span>FOCUS FILE:</span>
                <span className="text-slate-200">{currentState.windowTitle}</span>
              </div>
              <div className="flex justify-between">
                <span>STAGE CHANGES:</span>
                <span className="text-orange-400 font-bold">{currentState.modifiedFiles.length} files</span>
              </div>
              <div className="flex justify-between">
                <span>BUFFER PLAIN:</span>
                <span className="text-yellow-400 text-[10px] truncate max-w-[130px]" title={currentState.clipboardContent}>
                  {currentState.clipboardPasted ? "Pasted" : `"${currentState.clipboardContent.slice(0, 15)}..."`}
                </span>
              </div>
            </div>
            
            <div className="mt-3 pt-2 border-t border-slate-850 text-slate-600 text-[9px] flex justify-between">
              <span>Coordinates pinned</span>
              <span>v3.0.1</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
