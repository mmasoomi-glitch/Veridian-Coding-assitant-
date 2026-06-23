import { useCallback, useEffect, useRef, useState } from "react";

// localStorage key shared with App.tsx / SettingsTab (BYOK = bring your own key).
const KEY_STORAGE = "veridian_byok_elevenlabs_key";

// Defaults chosen for natural + fast speech:
//  - voiceId "EXAVITQu4vr4xnSDxMaL" is ElevenLabs' "Sarah", a warm, natural English voice.
//  - modelId "eleven_turbo_v2_5" is low-latency yet high quality (good for live UI feedback).
export const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Sarah — warm, natural
export const DEFAULT_MODEL_ID = "eleven_turbo_v2_5"; // turbo: natural + fast

function readKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE)?.trim() || "";
  } catch {
    return "";
  }
}

// Pick the most natural-sounding Web Speech voice available as a fallback.
// We bias toward cloud/"natural" branded voices and away from the classic
// robotic eSpeak/Microsoft David-style ones.
function pickNaturalVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith("en"));
  if (voices.length === 0) return null;
  const prefer = ["natural", "google", "aria", "online", "jenny", "libby", "neural"];
  const scored = voices
    .map((v) => {
      const name = v.name.toLowerCase();
      let score = 0;
      prefer.forEach((p, i) => {
        if (name.includes(p)) score += prefer.length - i;
      });
      if (!v.localService) score += 2; // remote voices tend to sound better
      return { v, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.v ?? voices[0];
}

export interface UseVoice {
  speak: (text: string) => Promise<void>;
  stop: () => void;
  speaking: boolean;
  hasKey: boolean;
}

export function useVoice(apiBase: string): UseVoice {
  const [speaking, setSpeaking] = useState(false);
  const [hasKey, setHasKey] = useState<boolean>(() => !!readKey());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  // Keep hasKey in sync — the Settings tab may add/remove the key while mounted,
  // and other tabs can change it too (storage event).
  useEffect(() => {
    const refresh = () => setHasKey(!!readKey());
    refresh();
    window.addEventListener("storage", refresh);
    // Light polling covers same-tab writes (storage event only fires cross-tab).
    const id = window.setInterval(refresh, 1500);
    return () => {
      window.removeEventListener("storage", refresh);
      window.clearInterval(id);
    };
  }, []);

  const cleanupAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    cleanupAudio();
    try {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    } catch {
      /* ignore */
    }
    setSpeaking(false);
  }, [cleanupAudio]);

  // ElevenLabs path — the natural voice.
  const speakElevenLabs = useCallback(
    async (text: string, apiKey: string) => {
      const res = await fetch(`${apiBase}/api/elevenlabs/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          apiKey,
          voiceId: DEFAULT_VOICE_ID,
          modelId: DEFAULT_MODEL_ID
        })
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`TTS request failed (${res.status})${detail ? `: ${detail.slice(0, 120)}` : ""}`);
      }
      const blob = await res.blob(); // audio/mpeg
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error("Audio playback failed"));
        audio.play().catch(reject);
      });
    },
    [apiBase]
  );

  // Web Speech fallback — only used when no ElevenLabs key is present.
  const speakWebSpeech = useCallback(
    (text: string) =>
      new Promise<void>((resolve) => {
        if (typeof window === "undefined" || !window.speechSynthesis) {
          resolve();
          return;
        }
        const synth = window.speechSynthesis;
        synth.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        const voice = pickNaturalVoice();
        if (voice) utter.voice = voice;
        utter.rate = 1.0;
        utter.pitch = 1.0;
        utter.onend = () => resolve();
        utter.onerror = () => resolve();
        synth.speak(utter);
      }),
    []
  );

  const speak = useCallback(
    async (text: string) => {
      const clean = (text || "").trim();
      if (!clean) return;
      stop(); // never overlap utterances
      setSpeaking(true);
      const apiKey = readKey();
      try {
        if (apiKey) {
          await speakElevenLabs(clean, apiKey);
        } else {
          await speakWebSpeech(clean);
        }
      } catch {
        // If the natural voice fails (bad key, offline, quota), degrade
        // gracefully to Web Speech rather than going silent.
        try {
          if (apiKey) await speakWebSpeech(clean);
        } catch {
          /* give up quietly */
        }
      } finally {
        cleanupAudio();
        setSpeaking(false);
      }
    },
    [stop, speakElevenLabs, speakWebSpeech, cleanupAudio]
  );

  // Tear down audio + cancel any speech when the consumer unmounts.
  useEffect(() => () => stop(), [stop]);

  return { speak, stop, speaking, hasKey };
}
