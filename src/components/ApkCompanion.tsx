import React, { useState } from "react";
import { 
  Smartphone, 
  Wifi, 
  Signal, 
  Battery, 
  Settings, 
  Volume2, 
  VolumeX, 
  CheckCircle2, 
  AlertTriangle, 
  Circle, 
  Hourglass, 
  Play, 
  RefreshCw, 
  Sliders, 
  Layers,
  KeyRound,
  Lock,
  MessageSquare
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { WorkspaceState, AISummary, TimelineEvent } from "../types";

interface ApkCompanionProps {
  currentState: WorkspaceState;
  aiBriefing: AISummary;
  timeline: TimelineEvent[];
  elevenLabsKey: string;
  setElevenLabsKey: (key: string) => void;
  elevenLabsVoiceId: string;
  setElevenLabsVoiceId: (id: string) => void;
  elevenLabsModel: string;
  setElevenLabsModel: (model: string) => void;
  isNarrating: boolean;
  audioStatus: string;
  handleVocalBriefing: (textOverride?: string) => Promise<void>;
  awayModeEnabled: boolean;
  setAwayModeEnabled: (val: boolean) => void;
  jobEstimatedMinutesLate: number;
  setJobEstimatedMinutesLate: (val: number) => void;
}

export default function ApkCompanion({
  currentState,
  aiBriefing,
  timeline,
  elevenLabsKey,
  setElevenLabsKey,
  elevenLabsVoiceId,
  setElevenLabsVoiceId,
  elevenLabsModel,
  setElevenLabsModel,
  isNarrating,
  audioStatus,
  handleVocalBriefing,
  awayModeEnabled,
  setAwayModeEnabled,
  jobEstimatedMinutesLate,
  setJobEstimatedMinutesLate
}: ApkCompanionProps) {
  
  const [showConfig, setShowConfig] = useState(false);
  const [localPushAlerts, setLocalPushAlerts] = useState<string[]>([
    "Synced: Active observer connected to secure Localhost Port 1321",
    "Completed: Docker Compose service started 12m ago"
  ]);

  // Voice presets for ElevenLabs
  const voicePresets = [
    { name: "Rachel (Classic)", id: "21m00Tcm4TlvDq8ikWAM" },
    { name: "Dom (Bold)", id: "AZnzlk1XfhEZv5msAtCc" },
    { name: "Antoni (Developer)", id: "ErXwobaY60tGHOwexOCf" },
    { name: "Bella (Cheerful)", id: "EXAVITQu4vr4xnSDxMaL" },
    { name: "Arnold (Hero)", id: "VR6A4Y66ndCOSuVoZiba" }
  ];

  // Dynamic status text to play in ElevenLabs BYOK
  const handleTriggerApkTts = () => {
    const completedText = aiBriefing.completed.length > 0 
      ? aiBriefing.completed.join(". ") 
      : "no active jobs marked completely finished on this branch";

    const requirementsText = aiBriefing.pending.length > 0
      ? `Simulated requirements to continue focus include: ${aiBriefing.pending.join(". ")}`
      : "all requirements stashed successfully in queue";

    const awaySummary = `Veridian Mobile Companion report: Your active job on ${currentState.virtualDesktop} is done. This was finished ${jobEstimatedMinutesLate} minutes late relative to standard sprint target. Key parameters: ${completedText}. ${requirementsText}. Active agent turn is checked for ${currentState.activeTurn}.`;
    
    handleVocalBriefing(awaySummary);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl relative overflow-hidden flex flex-col items-center">
      
      {/* Title Header */}
      <div className="w-full pb-3 border-b border-slate-800 mb-4 flex justify-between items-center text-xs font-mono">
        <span className="text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
          <Smartphone className="h-4 w-4" />
          Simulated APK Companion
        </span>
        <span className="text-slate-500 font-bold tracking-wide">Away Status Screen</span>
      </div>

      {/* Main Smartphone Shell */}
      <div className="relative w-[285px] h-[585px] bg-slate-950 rounded-[40px] p-3 border-4 border-slate-800 shadow-2xl flex flex-col shrink-0 ring-4 ring-slate-900/60 transition-all duration-300 hover:ring-emerald-500/10">
        
        {/* Notch / Camera Hole */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-5.5 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-between px-3.5 z-40">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-900"></span>
          <span className="h-1.5 w-8 rounded bg-slate-900"></span>
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500/40"></span>
        </div>

        {/* Smartphone Internal Contents */}
        <div className="w-full h-full rounded-[30px] bg-slate-900/40 overflow-hidden flex flex-col relative text-[11px] font-sans border border-slate-800/60">
          
          {/* Internal Top Bar */}
          <div className="h-7 pt-4 px-4 bg-slate-950/80 flex justify-between items-center text-[9px] text-slate-400 font-mono select-none">
            <span>12:57 PM</span>
            <div className="flex items-center gap-1">
              <Signal className="h-2.5 w-2.5 text-emerald-400" />
              <Wifi className="h-2.5 w-2.5 text-emerald-400" />
              <Battery className="h-3 w-3 text-emerald-400" />
            </div>
          </div>

          {/* APK Header */}
          <div className="p-3 bg-gradient-to-r from-emerald-600 to-teal-700 text-slate-950 flex justify-between items-center font-bold tracking-tight shadow-md">
            <div className="flex items-center gap-1.5">
              <Smartphone className="h-3.5 w-3.5 text-slate-950" />
              <span className="font-display font-bold">Veridian APK Companion</span>
            </div>
            
            {/* Clickable Mobile Settings */}
            <button 
              onClick={() => setShowConfig(!showConfig)}
              className="p-1 hover:bg-slate-950/15 rounded transition-colors text-slate-950"
              title="Elevenlabs TTS BYOK Settings"
            >
              <Settings className={`h-3.5 w-3.5 ${showConfig ? "animate-spin" : ""}`} />
            </button>
          </div>

          {/* Sliding ElevenLabs BYOK Configuration Drawer inside Mobile phone! */}
          <AnimatePresence>
            {showConfig && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="bg-slate-950 border-b border-slate-800 text-slate-300 overflow-hidden text-[10px]"
              >
                <div className="p-3 space-y-2.5">
                  <div className="flex items-center gap-1 text-emerald-400 font-mono font-bold uppercase tracking-wider text-[9px]">
                    <KeyRound className="h-3 w-3" />
                    ELEVENLABS BYOK CONFIG
                  </div>
                  
                  {/* Key Entry */}
                  <div className="space-y-1">
                    <span className="text-slate-500 block font-mono">1. ElevenLabs API Key:</span>
                    <input 
                      type="password"
                      value={elevenLabsKey}
                      onChange={(e) => setElevenLabsKey(e.target.value)}
                      placeholder="Paste xi-api-key..."
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-100 placeholder:text-slate-700 focus:outline-none focus:border-emerald-500/40 text-[10px] font-mono"
                    />
                    <p className="text-[8.5px] text-slate-500 leading-snug">
                      Your key is saved locally inside secure sandboxed client memory.
                    </p>
                  </div>

                  {/* Voice Selector */}
                  <div className="space-y-1">
                    <span className="text-slate-500 block font-mono">2. Select Premium Voice:</span>
                    <select
                      value={elevenLabsVoiceId}
                      onChange={(e) => setElevenLabsVoiceId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-emerald-500/40 text-[10px]"
                    >
                      {voicePresets.map((v) => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Close configs button */}
                  <button 
                    onClick={() => setShowConfig(false)}
                    className="w-full bg-emerald-500 text-slate-950 font-bold py-1 rounded hover:bg-emerald-400 transition-colors tracking-wide text-[9px] uppercase font-sans"
                  >
                    Save & Close Settings
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Live Mobile Screen Content */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 font-sans">
            
            {/* Status bar toggle */}
            <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800/80 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold block text-slate-300">Live Status Tracker</span>
                <span className="text-[8.5px] text-slate-500 font-mono">State: {awayModeEnabled ? "💤 AWAY (Observer Mod)" : "🏠 ACTIVE OFFICE"}</span>
              </div>
              <button 
                onClick={() => setAwayModeEnabled(!awayModeEnabled)}
                className={`text-[9px] px-2.5 py-1 rounded-full font-bold transition-all ${awayModeEnabled ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"}`}
              >
                {awayModeEnabled ? "Away" : "Office"}
              </button>
            </div>

            {/* Simulated Dynamic Late Slider */}
            {awayModeEnabled && (
              <div className="bg-slate-950/40 rounded-xl p-2.5 border border-slate-800/80 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-300">Milestone Deadlines</span>
                  <span className="text-[9.5px] text-amber-400 font-mono font-bold">+{jobEstimatedMinutesLate}m Late</span>
                </div>
                <input 
                  type="range" 
                  min="5" 
                  max="180" 
                  value={jobEstimatedMinutesLate} 
                  onChange={(e) => setJobEstimatedMinutesLate(Number(e.target.value))} 
                  className="w-full accent-amber-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                />
                <p className="text-[8.5px] text-slate-500 font-mono tracking-wide leading-tight text-center">
                  Adjust deadline buffer to see report calculations update.
                </p>
              </div>
            )}

            {/* Primary Report UI: Done on Desktop & How Late */}
            <div className="bg-slate-950/80 rounded-xl p-3 border border-slate-800/80 space-y-2">
              <span className="text-[9.5px] font-mono text-slate-400 block border-b border-slate-800 pb-1.5 uppercase font-bold tracking-wider">
                📢 Synced Completed Jobs
              </span>
              
              <div className="space-y-2">
                <div className="flex items-start gap-1.5 bg-emerald-500/10 border border-emerald-500/20 p-2 rounded-lg">
                  <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="text-slate-200 font-bold font-mono text-[9.5px] block leading-tight">
                      {aiBriefing.currentProject || "Veridian Pro"}
                    </span>
                    <span className="text-slate-400 leading-tight block">
                      Target job on <strong className="text-cyan-300 font-mono">{currentState.virtualDesktop.split("(")[0].trim()}</strong> is completed.
                    </span>
                    <span className="text-[9px] text-amber-400 font-mono block pt-0.5">
                      Completed <strong>{jobEstimatedMinutesLate} minutes LATE</strong> relative to target deadline metrics.
                    </span>
                  </div>
                </div>
                
                {/* Specific items list */}
                <ul className="space-y-1 pl-1 text-[10px]">
                  {aiBriefing.completed.map((task, idx) => (
                    <li key={idx} className="text-slate-400 flex items-start gap-1">
                      <span className="text-emerald-500 font-bold">&#8226;</span>
                      <span className="truncate">{task}</span>
                    </li>
                  ))}
                  {aiBriefing.completed.length === 0 && (
                    <li className="text-slate-500 italic">No direct done items reported.</li>
                  )}
                </ul>
              </div>
            </div>

            {/* Job Requirements Checklist */}
            <div className="bg-slate-950/80 rounded-xl p-3 border border-slate-800/80 space-y-2">
              <span className="text-[9.5px] font-mono text-slate-400 block border-b border-slate-800 pb-1.5 uppercase font-bold tracking-wider">
                ⚙️ Outstanding Requirements
              </span>
              
              <div className="space-y-2">
                <div className="text-[9px] text-slate-500 leading-normal">
                  Prerequisites needed before resuming active desktop operations:
                </div>

                <div className="space-y-1.5 font-mono text-[10px]">
                  {aiBriefing.pending.map((req, idx) => (
                    <div key={idx} className="flex items-start gap-1.5 text-teal-300">
                      <Circle className="h-3 w-3 text-teal-500 shrink-0 mt-0.5" />
                      <span className="leading-snug break-words">{req}</span>
                    </div>
                  ))}
                  {aiBriefing.pending.length === 0 && (
                    <span className="text-slate-500 italic italic block">All prerequisite requirements satisfied.</span>
                  )}
                </div>
              </div>
            </div>

            {/* Quick action buttons: Trigger BYOK Voice synthesis or test alerts */}
            <div className="space-y-2 pt-1 border-t border-slate-850">
              
              <button 
                onClick={handleTriggerApkTts}
                disabled={isNarrating}
                className={`w-full py-2 px-3.5 rounded-xl border font-bold flex items-center justify-center gap-2 transition-all cursor-pointer text-xs ${
                  isNarrating 
                    ? "bg-purple-500/20 border-purple-500/40 text-purple-300 animate-pulse" 
                    : "bg-emerald-500 text-slate-950 hover:bg-emerald-400 border-transparent shadow hover:scale-[1.02]"
                }`}
                title="Narrate reports via ElevenLabs V3 BYOK API voice"
              >
                {isNarrating ? (
                  <VolumeX className="h-4 w-4 shrink-0" />
                ) : (
                  <Volume2 className="h-4 w-4 shrink-0" />
                )}
                <span>{isNarrating ? "Stop Audio Report" : "Vocalize Away Alert"}</span>
              </button>

              {/* Elevenlabs indicator banner inside mobile phone */}
              <div className="px-1 text-center">
                <span className="text-[8.5px] font-mono text-slate-500 block">
                  {elevenLabsKey ? "🔴 ElevenLabs V3 API Connected (BYOK)" : "⚠️ Web Speech Synthesis fallback (Enter Key on settings)"}
                </span>
                {audioStatus && (
                  <span className="text-[8.5px] font-mono text-cyan-400 block pt-0.5 animate-pulse bg-cyan-950/20 py-0.5 rounded">
                    Status: {audioStatus}
                  </span>
                )}
              </div>
            </div>

          </div>

          {/* Simulated screen home line */}
          <div className="h-6 bg-slate-950/80 border-t border-slate-900 flex justify-center items-center">
            <div className="w-16 h-1 rounded-full bg-slate-800"></div>
          </div>

        </div>

      </div>

      {/* Quick guide text */}
      <p className="text-[10.5px] text-slate-400 leading-normal text-center mt-3 max-w-[260px] font-mono">
        This APK Companion simulates a mobile view using active telemetry packets. Configure your <strong>ElevenLabs API key</strong> on settings gear to test rich voice models!
      </p>

    </div>
  );
}
