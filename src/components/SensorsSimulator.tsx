import React from "react";
import { 
  Terminal, 
  FileCode, 
  ExternalLink, 
  Clipboard, 
  Cpu, 
  ShieldCheck, 
  Download,
  Bot
} from "lucide-react";
import { WorkspaceState, SessionHistory } from "../types";

interface SensorsSimulatorProps {
  currentState: WorkspaceState;
  setCurrentState: React.Dispatch<React.SetStateAction<WorkspaceState>>;
  addTimelineEvent: (type: any, title: string, details: string, important?: boolean) => void;
  customFileChange: string;
  setCustomFileChange: (val: string) => void;
  customCommand: string;
  setCustomCommand: (val: string) => void;
  customCopyString: string;
  setCustomCopyString: (val: string) => void;
  setNotifications: React.Dispatch<React.SetStateAction<any[]>>;
  dbConfig: { dbPath: string; status: string; apiKeyConfigured: boolean };
  downloadSessionJson: () => void;
  activeSession: any;
}

export default function SensorsSimulator({
  currentState,
  setCurrentState,
  addTimelineEvent,
  customFileChange,
  setCustomFileChange,
  customCommand,
  setCustomCommand,
  customCopyString,
  setCustomCopyString,
  setNotifications,
  dbConfig,
  downloadSessionJson,
  activeSession
}: SensorsSimulatorProps) {

  // Simulated virtual desktop shifts
  const handleVirtualDesktopChange = (name: string) => {
    setCurrentState(prev => ({ ...prev, virtualDesktop: name }));
    addTimelineEvent("desktop", "Changed Workspace Desktop", "Navigated to: " + name);
  };

  // Simulated shell execution
  const handleTerminalCommandSimulate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customCommand.trim()) return;
    
    const isClaude = customCommand.toLowerCase().includes("claude") || customCommand.toLowerCase().includes("cline");
    
    setCurrentState(prev => ({ 
      ...prev, 
      terminalCommand: customCommand,
      activeTurn: isClaude ? "agent" : "human",
      activeApp: isClaude ? "Claude Code" : "PowerShell"
    }));

    addTimelineEvent(
      "terminal", 
      `Terminal Session: Ran \`${customCommand}\``, 
      `Working Directory: ${currentState.workspacePath}. Session type: ${isClaude ? 'Agent Active' : 'Manual Shell'}`,
      isClaude
    );

    setCustomCommand("");
  };

  // Simulated VS Code file saves
  const handleAppendFileModification = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customFileChange.trim()) return;

    const newList = [...currentState.modifiedFiles, customFileChange];
    setCurrentState(prev => ({ 
      ...prev, 
      modifiedFiles: newList,
      windowTitle: customFileChange,
      activeApp: "VS Code"
    }));

    addTimelineEvent(
      "vscode", 
      `Modified File: ${customFileChange}`, 
      `Workspace modified: ${currentState.workspacePath}\\${customFileChange}. Active IDE editor switched focus.`,
      true
    );

    setCustomFileChange("");
  };

  // Clipboard copies
  const handleSimulateCopyClipboard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customCopyString.trim()) return;

    setCurrentState(prev => ({
      ...prev,
      clipboardContent: customCopyString,
      clipboardPasted: false,
      clipboardCopiedAt: new Date().toISOString()
    }));

    addTimelineEvent(
      "clipboard",
      "Copied information block",
      `Buffered characters: "${customCopyString.slice(0, 40)}${customCopyString.length > 40 ? '...' : ''}" - Recorded status: UNPASTED`,
      true
    );

    setNotifications(prev => [
      {
        id: "notif-" + Date.now(),
        title: "Forgotten Clipboard Object",
        text: `Copied text template "${customCopyString.slice(0, 20)}..." has not been pasted as parameters.`,
        type: "clipboard"
      },
      ...prev.filter(n => n.type !== "clipboard")
    ]);

    setCustomCopyString("");
  };

  const simulatePasteAction = () => {
    setCurrentState(prev => ({ ...prev, clipboardPasted: true }));
    addTimelineEvent(
      "clipboard", 
      "Clipboard Pasted successfully", 
      `Copied string pasted into ${currentState.activeApp}: "${currentState.windowTitle}"`
    );
    setNotifications(prev => prev.filter(n => n.type !== "clipboard"));
  };

  return (
    <div className="space-y-6">
      
      {/* OS Sensors Simulator Panel */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 shadow-2xl relative overflow-hidden backdrop-blur-md">
        <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-emerald-500/5 to-transparent rounded-full blur-2xl pointer-events-none"></div>
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
          <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </span>
            OS Sensors Simulator
          </h2>
          <span className="text-[10px] text-slate-500 font-mono text-right">Simulate PC events</span>
        </div>

        <div className="space-y-4">
          
          {/* Virtual Desktop switcher */}
          <div>
            <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wide mb-1.5 flex items-center justify-between">
              <span>1. Virtual Desktop State</span>
              <span className="text-emerald-400 text-[10px] font-sans">Active: {currentState.virtualDesktop}</span>
            </label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                "Desktop 1 (Kernel OS Dev)",
                "Desktop 2 (Mira VPN Dev)",
                "Desktop 3 (AI Research)",
                "Desktop 4 (Personal Stuff)"
              ].map((desk) => (
                <button
                  key={desk}
                  type="button"
                  onClick={() => handleVirtualDesktopChange(desk)}
                  className={`py-1.5 px-2.5 rounded-lg border text-left truncate font-mono text-[11px] transition-all cursor-pointer ${currentState.virtualDesktop === desk ? "bg-slate-800 border-emerald-500/50 text-emerald-300 font-medium" : "bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-300 hover:bg-slate-800"}`}
                >
                  {desk.split("(")[0].trim()}
                </button>
              ))}
            </div>
          </div>

          {/* Window detector monitoring */}
          <div className="border-t border-slate-800 pt-3">
            <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wide mb-2">
              2. Active Window Monitor
            </label>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Active App:</span>
                <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                  {currentState.activeApp === "VS Code" && <FileCode className="h-3 w-3" />}
                  {currentState.activeApp === "Chrome" && <ExternalLink className="h-3 w-3" />}
                  {currentState.activeApp.includes("PowerShell") && <Terminal className="h-3 w-3" />}
                  {currentState.activeApp === "Claude Code" && <Bot className="h-3 w-3 text-purple-400" />}
                  {currentState.activeApp}
                </span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-slate-500 shrink-0">Window:</span>
                <span className="text-slate-300 text-right break-all max-w-[150px] text-[11px]">{currentState.windowTitle}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-500">Workspace Root:</span>
                <span className="font-semibold text-slate-400">{currentState.workspacePath} [#{currentState.gitRepo}]</span>
              </div>
            </div>
          </div>

          {/* Files modification simulator */}
          <div className="border-t border-slate-800 pt-3">
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wide">
                3. Workspace Changes ({currentState.modifiedFiles.length})
              </label>
              {currentState.modifiedFiles.length > 0 && (
                <button 
                  type="button"
                  onClick={() => {
                    setCurrentState(p => ({ ...p, modifiedFiles: [] }));
                    addTimelineEvent("vscode", "Stashed Workspace Cleaned", "Cleared all stashed modifications simulator.", false);
                  }}
                  className="text-[10px] text-slate-500 hover:text-red-400 font-mono"
                >
                  Reset Clean
                </button>
              )}
            </div>
            
            <div className="flex flex-wrap gap-1.5 mb-2">
              {currentState.modifiedFiles.length === 0 ? (
                <span className="text-[11px] font-mono text-slate-500 italic">No modified files. Workspace pristine.</span>
              ) : (
                currentState.modifiedFiles.map(file => (
                  <span key={file} className="bg-orange-500/10 border border-orange-500/30 text-orange-400 text-[10px] font-mono px-2 py-0.5 rounded flex items-center gap-1">
                    <FileCode className="h-2.5 w-2.5 animate-pulse" />
                    {file}
                  </span>
                ))
              )}
            </div>

            <form onSubmit={handleAppendFileModification} className="flex gap-2">
              <input
                type="text"
                value={customFileChange}
                onChange={(e) => setCustomFileChange(e.target.value)}
                placeholder="Simulate custom file save..."
                className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 flex-1 focus:outline-none focus:border-emerald-500/50 placeholder:text-slate-600 font-mono"
              />
              <button type="submit" className="bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300 text-xs px-2.5 py-1.5 rounded-lg cursor-pointer">
                Stage
              </button>
            </form>
          </div>

          {/* Bash shell simulation */}
          <div className="border-t border-slate-800 pt-3">
            <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wide mb-1.5">
              4. Terminal Command Line
            </label>
            <form onSubmit={handleTerminalCommandSimulate} className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-2.5 top-2.5 text-slate-500 font-mono text-[10px]">$</span>
                <input
                  type="text"
                  value={customCommand}
                  onChange={(e) => setCustomCommand(e.target.value)}
                  placeholder="make boot, npm run build..."
                  className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg pl-6 pr-2.5 py-1.5 w-full focus:outline-none focus:border-emerald-500/50 placeholder:text-slate-600 font-mono"
                />
              </div>
              <button type="submit" className="bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300 text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer font-mono">
                Run
              </button>
            </form>
          </div>

          {/* Clipboard intelligence simulation structure */}
          <div className="border-t border-slate-800 pt-3">
            <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wide mb-1.5">
              5. Clipboard Intelligence
            </label>
            <div className="bg-slate-950 p-2.5 border border-slate-800 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-500 font-semibold">Buffered Content:</span>
                <span className={`text-[9px] px-2 py-0.5 rounded-full font-mono font-bold ${currentState.clipboardPasted ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 animate-pulse"}`}>
                  {currentState.clipboardPasted ? "Clean" : "Unpasted"}
                </span>
              </div>
              <p className="font-mono text-xs text-slate-300 truncate bg-slate-900 border border-slate-800 p-1.5 rounded select-all">
                {currentState.clipboardContent || "Empty buffer"}
              </p>
              
              <div className="flex justify-between items-center gap-2">
                <button
                  type="button"
                  disabled={currentState.clipboardPasted || !currentState.clipboardContent}
                  onClick={simulatePasteAction}
                  className="text-[11px] flex items-center gap-1 text-emerald-400 hover:text-emerald-300 disabled:text-slate-500 font-semibold cursor-pointer"
                >
                  <Clipboard className="h-3 w-3" />
                  Simulate Paste
                </button>
                <span className="text-[9px] font-mono text-slate-600">Copied text</span>
              </div>
            </div>

            <form onSubmit={handleSimulateCopyClipboard} className="flex gap-2 mt-2">
              <input
                type="text"
                value={customCopyString}
                onChange={(e) => setCustomCopyString(e.target.value)}
                placeholder="Simulate copying secret credentials..."
                className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 flex-1 focus:outline-none focus:border-emerald-500/50 placeholder:text-slate-600 font-mono"
              />
              <button type="submit" className="bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300 text-xs px-2.5 py-1.5 rounded-lg cursor-pointer font-mono">
                Copy
              </button>
            </form>
          </div>

        </div>
      </div>

      {/* Database details persistence panel */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-400 space-y-2">
        <h3 className="text-slate-200 text-xs font-semibold flex items-center gap-1.5 pb-1 border-b border-slate-800">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          Workspace Database Cache
        </h3>
        <p className="text-[11px] leading-relaxed">
          Saves and retrieves records inside persistent localized database:
          <span className="text-emerald-300 block bg-slate-950 px-2 py-1 rounded border border-slate-800 my-1 truncate text-[10px]" title={dbConfig.dbPath}>
            {dbConfig.dbPath}
          </span>
        </p>
        <div className="pt-2 flex justify-between items-center text-[10px]">
          <span>DeepSeek key: {dbConfig.apiKeyConfigured ? "🟢 Injected" : "⚠️ Key Missing"}</span>
          <button
            onClick={downloadSessionJson}
            className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 hover:underline cursor-pointer"
          >
            <Download className="h-3 w-3" />
            Export JSON
          </button>
        </div>
      </div>

    </div>
  );
}
