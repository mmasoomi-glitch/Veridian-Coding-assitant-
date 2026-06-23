// Screenshot context store. Maintains a local, newest-first index of captured
// screen images (screenshots-index.json at process.cwd()) so the AI can use
// recent visual context ("what was on screen when I was last on this desktop?")
// and the UI can render a gallery.
//
// PRIVACY: captures happen LOCALLY only. maybeCapture() throttles so we only
// snap once a desktop has been continuously active for >= minMs, avoiding noisy
// spam. The cap (MAX) bounds disk use; oldest PNGs beyond the cap are deleted
// best-effort.
//
// All file/spawn I/O is wrapped in try/catch; nothing here throws.

import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const FILE = path.join(process.cwd(), "screenshots-index.json");
const SCRIPT = path.join(process.cwd(), "telemetry", "screenshot.ps1");
const SHOT_DIR = path.join(process.cwd(), "screenshots");
const MAX = 200;

export interface Shot {
  id: string;
  ts: string;
  path: string;
  desktop?: string;
  note?: string;
}

function read(): Shot[] {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return Array.isArray(raw) ? (raw as Shot[]) : [];
  } catch {
    return [];
  }
}

function write(shots: Shot[]): void {
  try {
    fs.writeFileSync(FILE, JSON.stringify(shots, null, 2), "utf8");
  } catch (e) {
    console.error("screenshots-store write failed:", e);
  }
}

// Stored newest-first on disk; return as-is (defensive re-sort by id desc).
export function listShots(): Shot[] {
  try {
    return read()
      .slice()
      .sort((a, b) => Number(b.id) - Number(a.id));
  } catch {
    return [];
  }
}

// Index a freshly captured file. id = Date.now(). Caps at MAX, deleting the
// oldest entries (and their PNGs, best-effort) beyond the cap.
export function addShot(filePath: string, desktop?: string, note?: string): Shot {
  const shot: Shot = {
    id: String(Date.now()),
    ts: new Date().toISOString(),
    path: filePath,
    ...(desktop ? { desktop } : {}),
    ...(note ? { note } : {})
  };
  try {
    const shots = [shot, ...read()];
    if (shots.length > MAX) {
      const dropped = shots.slice(MAX);
      for (const d of dropped) {
        try {
          if (d.path && fs.existsSync(d.path)) fs.unlinkSync(d.path);
        } catch {
          /* best-effort file cleanup */
        }
      }
      write(shots.slice(0, MAX));
    } else {
      write(shots);
    }
  } catch (e) {
    console.error("screenshots-store addShot failed:", e);
  }
  return shot;
}

// Resolve a shot id to its on-disk PNG path, or null if unknown/missing.
export function shotPath(id: string): string | null {
  try {
    const shot = read().find((s) => s.id === id);
    if (!shot || !shot.path) return null;
    if (!fs.existsSync(shot.path)) return null;
    return shot.path;
  } catch {
    return null;
  }
}

// --- Throttled capture, driven by the telemetry poller -----------------------
// We track the desktop that has been active and WHEN it became active, plus when
// we last captured for it. A capture fires only when the SAME desktop has been
// continuously active for >= minMs since our last capture on it. Switching to a
// different desktop resets the dwell clock (so a fresh dwell must accumulate).

let activeDesktop: string | null = null;
let activeSince = 0; // ms epoch when activeDesktop became the active one
let lastCaptureAt = 0; // ms epoch of the last successful capture

function runCapture(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const ps = spawn(
        "powershell",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          SCRIPT,
          "-OutDir",
          SHOT_DIR
        ],
        { shell: false }
      );
      let out = "";
      ps.stdout.on("data", (d) => {
        out += d.toString();
      });
      ps.on("error", () => resolve(null));
      ps.on("close", () => {
        const line = out.trim().split(/\r?\n/).filter(Boolean).pop() || "";
        resolve(line || null);
      });
    } catch {
      resolve(null);
    }
  });
}

// Called each telemetry tick with the current desktop. Returns the newly added
// Shot when a capture fired this tick, else null. Never throws.
export async function maybeCapture(
  desktop: string,
  minMs = 60000
): Promise<Shot | null> {
  try {
    const now = Date.now();
    const d = desktop || "unknown";

    // Desktop changed (or first observation): reset the dwell clock.
    if (d !== activeDesktop) {
      activeDesktop = d;
      activeSince = now;
      return null;
    }

    // Same desktop: require enough continuous dwell AND enough gap since the
    // last capture (so we don't re-snap every tick once the threshold is met).
    const dwell = now - activeSince;
    const sinceLast = now - lastCaptureAt;
    if (dwell < minMs || sinceLast < minMs) return null;

    const filePath = await runCapture();
    if (!filePath) return null;

    lastCaptureAt = Date.now();
    return addShot(filePath, d);
  } catch (e) {
    console.error("screenshots-store maybeCapture failed:", e);
    return null;
  }
}
