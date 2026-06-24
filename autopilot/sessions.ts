// Per-desktop autopilot "brains" — direct Anthropic-compatible provider only.
//
// No Claude CLI, no `--resume`, no subprocess. Each call is a stateless
// reasoning request to the HTTP provider; lightweight memory is provided by
// prepending the desktop's previous summary as context. PLAN-ONLY (assess);
// build/full are refused (the HTTP provider cannot modify files).
//
// State lives in sessions.json (process.cwd()). Exported functions never throw.

import fs from "node:fs";
import path from "node:path";
import { chatJSON, aiConfigured } from "../ai/providers";

const SESSIONS_FILE = path.join(process.cwd(), "sessions.json");

export interface DesktopSession {
  desktop: number;
  sessionId: string | null; // always null now (no CLI session); kept for API shape
  lastSummary: string;
  lastTs: string;
  project?: string;
  runs: number;
}

export function listSessions(): DesktopSession[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.map(coerceSession);
  } catch {
    return [];
  }
}

function coerceSession(s: any): DesktopSession {
  return {
    desktop: Number(s?.desktop) || 0,
    sessionId: null,
    lastSummary: String(s?.lastSummary ?? ""),
    lastTs: String(s?.lastTs ?? ""),
    project: s?.project != null ? String(s.project) : undefined,
    runs: Number(s?.runs) || 0
  };
}

function writeSessions(all: DesktopSession[]): void {
  try {
    const tmp = SESSIONS_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(all, null, 2), "utf8");
    fs.renameSync(tmp, SESSIONS_FILE);
  } catch {
    try { fs.writeFileSync(SESSIONS_FILE, JSON.stringify(all, null, 2), "utf8"); } catch (e) { console.error("sessions write failed:", e); }
  }
}

function upsert(all: DesktopSession[], next: DesktopSession): DesktopSession[] {
  const i = all.findIndex((s) => s.desktop === next.desktop);
  if (i >= 0) all[i] = next; else all.push(next);
  return all;
}

export function clearSession(desktop: number): void {
  try { writeSessions(listSessions().filter((s) => s.desktop !== Number(desktop))); }
  catch (err) { console.error("clearSession failed:", err); }
}

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

  if (mode === "build") {
    return { ok: false, sessionId: null, summary: "DISABLED — build requires a separately-reviewed execution path. The HTTP provider plans only. Use assess." };
  }
  if (!aiConfigured()) {
    return { ok: false, sessionId: null, summary: "AI disabled — Anthropic provider not configured." };
  }

  const all = listSessions();
  const prior = all.find((s) => s.desktop === desktop);

  let summary = "";
  let ok = false;
  try {
    const system = `You are the persistent planner for desktop ${desktop}, project ${project}. PLAN-ONLY: observe the event and report the next move concisely (<120 words). Do not claim to have changed anything.`;
    const user = (prior?.lastSummary ? `Previous note: ${prior.lastSummary}\n\n` : "") + `New event/context:\n${event}`;
    summary = String(await chatJSON({ system, user, json: false, maxTokens: 400 }));
    ok = true;
  } catch (e: any) {
    summary = `AI unavailable: ${String(e?.message || "error").replace(/anthropic_http_/, "http ")}`;
  }

  try {
    writeSessions(upsert(all, {
      desktop, sessionId: null,
      lastSummary: summary.slice(0, 1500),
      lastTs: new Date().toISOString(),
      project, runs: (Number(prior?.runs) || 0) + 1
    }));
  } catch (err) { console.error("runDesktopSession upsert failed:", err); }

  return { ok, sessionId: null, summary };
}
