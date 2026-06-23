// Scratch / typing-recovery store. Local only. Auto-saves the scratch textarea
// and keeps timestamped snapshots so text survives a keyboard wipe.
import fs from "fs";
import path from "path";

const FILE = path.join(process.cwd(), "scratch-buffer.json");
const MAX_SNAPSHOTS = 30;

export interface ScratchState {
  current: string;
  updatedAt: string;
  snapshots: { ts: string; text: string }[];
}

function read(): ScratchState {
  try {
    const d = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return {
      current: typeof d.current === "string" ? d.current : "",
      updatedAt: typeof d.updatedAt === "string" ? d.updatedAt : "",
      snapshots: Array.isArray(d.snapshots) ? d.snapshots : []
    };
  } catch {
    return { current: "", updatedAt: "", snapshots: [] };
  }
}

function write(s: ScratchState): void {
  try { fs.writeFileSync(FILE, JSON.stringify(s, null, 2), "utf8"); } catch (e) { console.error("scratch write:", e); }
}

export function getScratch(): ScratchState {
  return read();
}

export function saveScratch(text: string): ScratchState {
  const s = read();
  const prev = s.current;
  const now = new Date().toISOString();
  // Snapshot the PREVIOUS content if it changed meaningfully (so a wipe is recoverable).
  if (prev && prev !== text) {
    const last = s.snapshots[0];
    const lastTs = last ? Date.parse(last.ts) : 0;
    const bigChange = Math.abs(prev.length - text.length) >= 20;
    const stale = !last || (Date.parse(now) - lastTs) > 60000;
    if ((bigChange || stale) && (!last || last.text !== prev)) {
      s.snapshots.unshift({ ts: now, text: prev });
      s.snapshots = s.snapshots.slice(0, MAX_SNAPSHOTS);
    }
  }
  s.current = text;
  s.updatedAt = now;
  write(s);
  return s;
}
