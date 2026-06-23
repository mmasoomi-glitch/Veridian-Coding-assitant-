// Scratch / typing-recovery store. A SAFE replacement for the rejected global
// keylogger: instead of hooking the whole OS keyboard, this only ever stores
// text the user deliberately types into the Veridian "scratch" textarea.
//
// The use-case: the owner has a faulty keyboard that randomly fires deletes and
// can wipe a textarea. We keep `current` plus a rolling list of `snapshots` so a
// prior version survives the wipe and can be restored from the UI.
//
// PRIVACY: this never observes other apps, windows, or passwords — only the one
// box the user types into. Data lives ONLY locally in scratch-buffer.json at
// process.cwd(). All file I/O is wrapped in try/catch; nothing here throws.

import fs from "fs";
import path from "path";

const FILE = path.join(process.cwd(), "scratch-buffer.json");
const MAX_SNAPSHOTS = 30;
// A snapshot is taken when the text changed "meaningfully" since the last one:
// either a big edit (>= this many chars added/removed) or enough time elapsed.
const SNAPSHOT_DELTA_CHARS = 20;
const SNAPSHOT_INTERVAL_MS = 60_000; // > 60s

export interface ScratchState {
  current: string;
  updatedAt: string;
  snapshots: { ts: string; text: string }[];
}

function defaultState(): ScratchState {
  return { current: "", updatedAt: "", snapshots: [] };
}

function read(): ScratchState {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (raw && typeof raw === "object") {
      return {
        current: typeof raw.current === "string" ? raw.current : "",
        updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
        snapshots: Array.isArray(raw.snapshots)
          ? raw.snapshots
              .filter(
                (s: any) =>
                  s && typeof s.ts === "string" && typeof s.text === "string"
              )
              .map((s: any) => ({ ts: s.ts, text: s.text }))
          : []
      };
    }
    return defaultState();
  } catch {
    return defaultState();
  }
}

function write(state: ScratchState): void {
  try {
    fs.writeFileSync(FILE, JSON.stringify(state, null, 2), "utf8");
  } catch (e) {
    console.error("scratch-store write failed:", e);
  }
}

// Save the current scratch text. If the PREVIOUS current text differed
// meaningfully (big length delta, or it's been > 60s since the last snapshot),
// push the previous text as a snapshot first — so a sudden keyboard-induced
// wipe still leaves a recoverable copy. Snapshots are newest-first, capped at 30.
export function saveScratch(text: string): ScratchState {
  try {
    const safeText = typeof text === "string" ? text : "";
    const state = read();
    const prev = state.current;

    // Decide whether the PREVIOUS content is worth snapshotting before we
    // overwrite it. Only bother if there was real prior content and it changed.
    if (prev && prev !== safeText) {
      const lastSnap = state.snapshots[0];
      const lengthDelta = Math.abs(prev.length - safeText.length);
      const sinceLastSnapMs = lastSnap
        ? Date.now() - new Date(lastSnap.ts).getTime()
        : Infinity;
      // Avoid duplicating: skip if the most recent snapshot already holds `prev`.
      const alreadySnapped = lastSnap && lastSnap.text === prev;

      const meaningful =
        lengthDelta >= SNAPSHOT_DELTA_CHARS ||
        !isFinite(sinceLastSnapMs) ||
        sinceLastSnapMs > SNAPSHOT_INTERVAL_MS;

      if (meaningful && !alreadySnapped) {
        state.snapshots = [
          { ts: new Date().toISOString(), text: prev },
          ...state.snapshots
        ].slice(0, MAX_SNAPSHOTS);
      }
    }

    state.current = safeText;
    state.updatedAt = new Date().toISOString();
    write(state);
    return state;
  } catch (e) {
    console.error("scratch-store save failed:", e);
    return read();
  }
}

// Read the current scratch state, defaulting cleanly when the file is missing.
export function getScratch(): ScratchState {
  try {
    return read();
  } catch {
    return defaultState();
  }
}
