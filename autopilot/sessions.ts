// Persistent per-desktop Claude Code "brains".
//
// Each virtual desktop gets ONE long-lived headless Claude Code session that
// RETAINS context across calls via the CLI's resume feature. The first run
// creates a session and the CLI returns a `session_id`; every subsequent run
// for that desktop passes `--resume <session_id>` so the conversation (and the
// model's accumulated understanding of the desktop's project) carries forward.
//
// Modes map to Claude Code permission modes:
//   assess (default) -> "plan"        (read-only; observes & advises, no edits)
//   build            -> "acceptEdits" (auto-applies file edits)
//
// All session state lives in sessions.json (process.cwd()). Every fs/spawn call
// is wrapped — exported functions never throw; on failure they return ok:false
// with the error captured in `summary`.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SESSIONS_FILE = path.join(process.cwd(), "sessions.json");

export interface DesktopSession {
  desktop: number;
  sessionId: string | null;
  lastSummary: string;
  lastTs: string;
  project?: string;
  runs: number;
}

const MODE_TO_PERM: Record<string, string> = {
  assess: "plan",
  build: "acceptEdits"
};

// ---- persistence ---------------------------------------------------------

export function listSessions(): DesktopSession[] {
  try {
    const raw = fs.readFileSync(SESSIONS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(coerceSession);
  } catch {
    return [];
  }
}

function coerceSession(s: any): DesktopSession {
  return {
    desktop: Number(s?.desktop) || 0,
    sessionId: s?.sessionId != null ? String(s.sessionId) : null,
    lastSummary: String(s?.lastSummary ?? ""),
    lastTs: String(s?.lastTs ?? ""),
    project: s?.project != null ? String(s.project) : undefined,
    runs: Number(s?.runs) || 0
  };
}

function writeSessions(all: DesktopSession[]): void {
  // Atomic-ish: write to a temp file then rename. Never throw.
  try {
    const tmp = SESSIONS_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(all, null, 2), "utf8");
    fs.renameSync(tmp, SESSIONS_FILE);
  } catch (err) {
    try {
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify(all, null, 2), "utf8");
    } catch (e) {
      console.error("sessions write failed:", e);
    }
  }
}

function upsert(all: DesktopSession[], next: DesktopSession): DesktopSession[] {
  const i = all.findIndex((s) => s.desktop === next.desktop);
  if (i >= 0) all[i] = next;
  else all.push(next);
  return all;
}

export function clearSession(desktop: number): void {
  try {
    const all = listSessions().filter((s) => s.desktop !== Number(desktop));
    writeSessions(all);
  } catch (err) {
    console.error("clearSession failed:", err);
  }
}

// ---- claude CLI parsing --------------------------------------------------

// stdout may be a JSON array of stream events, a single object, or junk.
// Pull out the final `result` text and the `session_id` from anywhere.
function parseClaude(raw: string): { result: string; sessionId: string | null } {
  let result = "";
  let sessionId: string | null = null;
  try {
    const parsed = JSON.parse(raw);
    const events: any[] = Array.isArray(parsed) ? parsed : [parsed];

    // Final result text: last event carrying a `result` (fall back to content).
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e && e.result != null) { result = String(e.result); break; }
    }
    if (!result) {
      for (let i = events.length - 1; i >= 0; i--) {
        const e = events[i];
        if (e && e.content != null) { result = String(e.content); break; }
      }
    }

    // session_id: search events (prefer the last one that has it).
    for (let i = events.length - 1; i >= 0; i--) {
      const id = findSessionId(events[i]);
      if (id) { sessionId = id; break; }
    }
  } catch {
    result = String(raw || "");
  }
  return { result, sessionId };
}

// Recursively look for a field literally named session_id.
function findSessionId(obj: any, depth = 0): string | null {
  if (!obj || typeof obj !== "object" || depth > 6) return null;
  if (obj.session_id != null) return String(obj.session_id);
  for (const k of Object.keys(obj)) {
    const v = (obj as any)[k];
    if (v && typeof v === "object") {
      const found = findSessionId(v, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function buildPrompt(desktop: number, project: string, event: string): string {
  const preamble =
    `You are the persistent autopilot for desktop ${desktop}, project ${project}. ` +
    `Here is a new observed event/context; decide and report the next move concisely (<120 words).`;
  return `${preamble}\n\n${event}`;
}

// ---- run -----------------------------------------------------------------

export async function runDesktopSession(opts: {
  desktop: number;
  project?: string;
  cwd?: string;
  event: string;
  mode?: "assess" | "build";
}): Promise<{ ok: boolean; sessionId: string | null; summary: string }> {
  const desktop = Number(opts?.desktop) || 0;
  const project = String(opts?.project ?? "(unknown)");
  const event = String(opts?.event ?? "");
  const mode = opts?.mode === "build" ? "build" : "assess";

  let existingSessionId: string | null = null;
  let all: DesktopSession[] = [];
  try {
    all = listSessions();
    existingSessionId = all.find((s) => s.desktop === desktop)?.sessionId ?? null;
  } catch {
    all = [];
  }

  let runResult: { ok: boolean; result: string; sessionId: string | null };
  try {
    runResult = await spawnClaude({
      desktop,
      project,
      event,
      mode,
      cwd: opts?.cwd,
      resumeId: existingSessionId
    });
  } catch (e: any) {
    return { ok: false, sessionId: existingSessionId, summary: `run failed: ${e?.message || e}` };
  }

  // Keep the prior session id if the CLI didn't surface a new one.
  const nextSessionId = runResult.sessionId || existingSessionId;
  const summary = String(runResult.result || "");

  // Upsert session record. Never throw out of here.
  try {
    const prior = all.find((s) => s.desktop === desktop);
    const next: DesktopSession = {
      desktop,
      sessionId: nextSessionId,
      lastSummary: summary.slice(0, 1500),
      lastTs: new Date().toISOString(),
      project,
      runs: (Number(prior?.runs) || 0) + 1
    };
    writeSessions(upsert(all, next));
  } catch (err) {
    console.error("runDesktopSession upsert failed:", err);
  }

  return { ok: runResult.ok, sessionId: nextSessionId, summary };
}

function spawnClaude(args: {
  desktop: number;
  project: string;
  event: string;
  mode: "assess" | "build";
  cwd?: string;
  resumeId: string | null;
}): Promise<{ ok: boolean; result: string; sessionId: string | null }> {
  return new Promise((resolve) => {
    const model = process.env.CLAUDE_MODEL || "opus";
    const bin = process.env.CLAUDE_BIN || "claude";
    const perm = MODE_TO_PERM[args.mode] || "plan";

    const cliArgs = ["-p", "--output-format", "json", "--model", model, "--permission-mode", perm];
    if (args.resumeId) cliArgs.push("--resume", args.resumeId);

    let cwd = process.cwd();
    try {
      if (args.cwd && fs.existsSync(args.cwd)) cwd = args.cwd;
    } catch {
      /* keep default cwd */
    }

    let out = "";
    let err = "";
    let child;
    try {
      child = spawn(bin, cliArgs, {
        cwd,
        shell: process.platform === "win32",
        windowsHide: true
      });
    } catch (e: any) {
      return resolve({ ok: false, result: `spawn failed: ${e?.message || e}`, sessionId: null });
    }

    const timer = setTimeout(() => {
      try { child!.kill(); } catch { /* ignore */ }
    }, 5 * 60 * 1000);

    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, result: `error: ${e.message}`, sessionId: null });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const parsed = parseClaude(out);
      const result = parsed.result || err.slice(0, 400) || `claude exited ${code}`;
      resolve({ ok: code === 0, result, sessionId: parsed.sessionId });
    });

    try {
      child.stdin.write(buildPrompt(args.desktop, args.project, args.event));
      child.stdin.end();
    } catch (e: any) {
      clearTimeout(timer);
      try { child.kill(); } catch { /* ignore */ }
      resolve({ ok: false, result: `stdin write failed: ${e?.message || e}`, sessionId: null });
    }
  });
}
