// Keystroke recorder store (LOCAL ONLY).
//
// Backs the transparent, owner-consented keystroke recorder. The actual capture
// is done by telemetry/keylog.ps1 (GetAsyncKeyState polling) which appends to
// keystroke-log.txt in the project directory. This module is the Node-side glue:
// it reads the tail of that local file, toggles the pause flag file, reports
// recording status, and spawns/kills the recorder process.
//
// PRIVACY / SAFETY: every path resolved here is inside process.cwd() (the project
// dir). There is NO network, sync, or upload code anywhere in this file — the
// captured text never leaves the machine. Everything is wrapped in try/catch and
// nothing throws (callers are API handlers that must stay up).

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { dataPath } from "../lib/paths";

const LOG_FILE   = dataPath("keystroke-log.txt");
const PAUSE_FILE = dataPath("keylog.paused");
const PID_FILE   = dataPath("keylog.pid");
const PS1_FILE   = path.join(process.cwd(), "telemetry", "keylog.ps1");

// Consider the recorder "live" if the log was touched within this window.
const FRESH_MS = 60_000;

// Tail of the captured text (newest content is at the end of the file).
export function recentLog(maxChars = 6000): string {
  try {
    if (!fs.existsSync(LOG_FILE)) return "";
    const buf = fs.readFileSync(LOG_FILE, "utf8");
    if (buf.length <= maxChars) return buf;
    return buf.slice(buf.length - maxChars);
  } catch {
    return "";
  }
}

// Wipe the local capture file.
export function clearLog(): void {
  try {
    fs.writeFileSync(LOG_FILE, "", "utf8");
  } catch {
    /* never throw */
  }
}

// Pause = capture flag file exists; the .ps1 checks for it every tick.
export function isPaused(): boolean {
  try {
    return fs.existsSync(PAUSE_FILE);
  } catch {
    return false;
  }
}

export function setPaused(p: boolean): void {
  try {
    if (p) {
      fs.writeFileSync(PAUSE_FILE, String(Date.now()), "utf8");
    } else if (fs.existsSync(PAUSE_FILE)) {
      fs.rmSync(PAUSE_FILE, { force: true });
    }
  } catch {
    /* never throw */
  }
}

// Recording = the log file was modified recently AND we are not paused. (A stale
// file from a previous session, or a paused recorder, both read as not recording.)
export function isRecording(): boolean {
  try {
    if (isPaused()) return false;
    if (!fs.existsSync(LOG_FILE)) return false;
    const mtime = fs.statSync(LOG_FILE).mtimeMs;
    return Date.now() - mtime <= FRESH_MS;
  } catch {
    return false;
  }
}

// True if the pid recorded in keylog.pid is still a running process.
function pidAlive(): boolean {
  try {
    if (!fs.existsSync(PID_FILE)) return false;
    const pid = parseInt(fs.readFileSync(PID_FILE, "utf8").trim(), 10);
    if (!Number.isFinite(pid) || pid <= 0) return false;
    // signal 0 = existence check; throws if the process is gone.
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Spawn keylog.ps1 detached (best-effort) if it isn't already running. Tracks the
// child pid in keylog.pid so we can stop it and avoid duplicate recorders.
export function startRecorder(): { started: boolean } {
  try {
    if (pidAlive()) return { started: false };
    if (!fs.existsSync(PS1_FILE)) return { started: false };
    const child = spawn(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", PS1_FILE],
      { detached: true, stdio: "ignore", windowsHide: true }
    );
    child.on("error", () => { /* ignore spawn errors */ });
    if (child.pid) {
      try { fs.writeFileSync(PID_FILE, String(child.pid), "utf8"); } catch { /* ignore */ }
    }
    child.unref();
    return { started: true };
  } catch {
    return { started: false };
  }
}

// Kill the tracked recorder process and clear the pid file.
export function stopRecorder(): void {
  try {
    if (fs.existsSync(PID_FILE)) {
      const pid = parseInt(fs.readFileSync(PID_FILE, "utf8").trim(), 10);
      if (Number.isFinite(pid) && pid > 0) {
        try { process.kill(pid); } catch { /* already gone */ }
      }
      try { fs.rmSync(PID_FILE, { force: true }); } catch { /* ignore */ }
    }
  } catch {
    /* never throw */
  }
}
