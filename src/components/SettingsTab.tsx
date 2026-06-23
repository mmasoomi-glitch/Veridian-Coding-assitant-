import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  Settings,
  KeyRound,
  Volume2,
  Square,
  Loader2,
  Check,
  Database,
  Cpu,
  Sparkles,
  Eye,
  EyeOff,
  Save
} from "lucide-react";
import { useVoice, DEFAULT_VOICE_ID, DEFAULT_MODEL_ID } from "../hooks/useVoice";

const KEY_STORAGE = "veridian_byok_elevenlabs_key";

// A small curated set of natural-sounding ElevenLabs voices the user can pick from.
// These are stable public voice IDs from the ElevenLabs default library.
const VOICES = [
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", note: "warm · natural (default)" },
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", note: "calm · narration" },
  { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi", note: "confident" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", note: "deep · steady" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", note: "young · energetic" }
];

interface DbConfig {
  dbPath?: string;
  status?: string;
  apiKeyConfigured?: boolean;
}

function readKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE)?.trim() || "";
  } catch {
    return "";
  }
}

export default function SettingsTab({ apiBase }: { apiBase: string }) {
  const voice = useVoice(apiBase);

  const [keyInput, setKeyInput] = useState<string>(() => readKey());
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<string>(DEFAULT_VOICE_ID);

  const [dbConfig, setDbConfig] = useState<DbConfig | null>(null);
  const [dbError, setDbError] = useState<string>("");

  const hasKey = voice.hasKey;

  // Persist the key to localStorage; the hook picks it up automatically.
  const saveKey = useCallback(() => {
    try {
      const v = keyInput.trim();
      if (v) localStorage.setItem(KEY_STORAGE, v);
      else localStorage.removeItem(KEY_STORAGE);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch {
      /* ignore storage failures */
    }
  }, [keyInput]);

  // Load AI backend config.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${apiBase}/api/db-config`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!cancelled) setDbConfig(data);
      } catch (e: any) {
        if (!cancelled) setDbError(e?.message || "could not reach server");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  // The active provider: per project design the headless Opus (Claude) is the
  // brain. db-config tells us whether a fallback cloud key is set.
  const provider = dbConfig?.apiKeyConfigured ? "DeepSeek key present (fallback)" : "Local Claude Code (Opus)";

  const testVoice = useCallback(() => {
    if (voice.speaking) {
      voice.stop();
      return;
    }
    voice.speak("Veridian voice test. This is the natural voice.");
  }, [voice]);

  const section = "bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl space-y-3";
  const label = "flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeInOut" }}
      className="space-y-4"
    >
      <div className="flex items-center gap-2 text-slate-200">
        <Settings className="h-4 w-4 text-cyan-400" />
        <h2 className="text-sm font-bold tracking-wide">Settings</h2>
      </div>

      {/* ElevenLabs natural voice (BYOK) */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className={section}
      >
        <div className="flex items-center justify-between">
          <div className={`${label} text-cyan-400`}>
            <KeyRound className="h-3.5 w-3.5" /> ElevenLabs — Natural Voice
          </div>
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
              hasKey ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-700/40 text-slate-400"
            }`}
          >
            {hasKey ? "KEY SET" : "NO KEY"}
          </span>
        </div>

        <p className="text-[11px] text-slate-400">
          Bring your own ElevenLabs API key (stored only in this browser&apos;s localStorage). With a key set, Veridian
          speaks in a warm, natural voice.
        </p>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showKey ? "text" : "password"}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="sk_..."
              spellCheck={false}
              autoComplete="off"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 pr-8 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50"
            />
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              aria-label={showKey ? "Hide key" : "Show key"}
            >
              {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          <button
            onClick={saveKey}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition-all flex items-center gap-1.5"
          >
            {saved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            {saved ? "Saved" : "Save"}
          </button>
        </div>

        {/* Voice picker */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Voice</div>
          <div className="flex flex-wrap gap-2">
            {VOICES.map((v) => (
              <button
                key={v.id}
                onClick={() => setSelectedVoice(v.id)}
                title={v.note}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  selectedVoice === v.id
                    ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-200"
                    : "border-slate-700 bg-slate-950 text-slate-300 hover:border-cyan-500/40"
                }`}
              >
                {v.name}
                <span className="block text-[9px] font-mono text-slate-500">{v.note}</span>
              </button>
            ))}
          </div>
          <p className="text-[10px] font-mono text-slate-600">
            Test uses default {DEFAULT_VOICE_ID} · model {DEFAULT_MODEL_ID}
          </p>
        </div>

        <button
          onClick={testVoice}
          className="w-full px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-500 text-white hover:bg-purple-400 transition-all flex items-center justify-center gap-1.5"
        >
          {voice.speaking ? (
            <>
              <Square className="h-3.5 w-3.5" /> Stop
            </>
          ) : (
            <>
              <Volume2 className="h-3.5 w-3.5" /> Test voice
            </>
          )}
        </button>
      </motion.div>

      {/* AI backend */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className={section}
      >
        <div className={`${label} text-purple-400`}>
          <Cpu className="h-3.5 w-3.5" /> AI Backend
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 font-mono">active provider</span>
            <span className="text-slate-100 font-semibold">{provider}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 font-mono flex items-center gap-1">
              <Database className="h-3 w-3" /> session store
            </span>
            <span
              className={`font-mono ${
                dbError
                  ? "text-rose-400"
                  : dbConfig?.status === "active"
                  ? "text-emerald-400"
                  : "text-amber-400"
              }`}
            >
              {dbError ? "offline" : dbConfig?.status ?? "…"}
            </span>
          </div>
          {dbConfig?.dbPath && (
            <p className="text-[10px] font-mono text-slate-600 truncate">{dbConfig.dbPath}</p>
          )}
          {dbError && <p className="text-[10px] font-mono text-rose-400/80">{dbError}</p>}
        </div>

        <p className="text-[11px] text-slate-400 flex items-start gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-purple-400 mt-0.5 shrink-0" />
          The brain is <span className="text-purple-300 font-semibold">Opus-headless</span> — the local Claude Code CLI
          running on the owner&apos;s Max plan (flat-rate, no API cost). Cloud keys are only a fallback.
        </p>
      </motion.div>

      {/* Voice quality note */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        className={section}
      >
        <div className={`${label} text-amber-400`}>
          <Volume2 className="h-3.5 w-3.5" /> Voice Quality
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          With an <span className="text-cyan-300 font-semibold">ElevenLabs key</span>, Veridian uses high-fidelity neural
          TTS — the natural voice. Without a key, it falls back to your browser&apos;s built-in{" "}
          <span className="text-slate-200 font-semibold">Web Speech</span> synthesis, automatically choosing the most
          natural-sounding system voice available. The fallback works offline but sounds noticeably more synthetic.
        </p>
        <p className="text-[10px] font-mono text-slate-600">
          current mode: {hasKey ? "ElevenLabs (natural)" : "Web Speech (fallback)"}
        </p>
      </motion.div>
    </motion.div>
  );
}
