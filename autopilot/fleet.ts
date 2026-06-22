// Autopilot Fleet: drives one headless Claude Code (Opus / Max plan) session per
// desktop's active project. It assesses progress and advances each project, then
// logs what it did — so you wake up to work moved forward.
//
// Modes map to Claude Code permission modes:
//   assess -> "plan"            (read-only; plans, never changes anything)
//   build  -> "acceptEdits"     (auto-applies file edits, gates risky commands)
//   full   -> "bypassPermissions" (you opt into this per project; unsupervised)

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PROJECTS_FILE = path.join(process.cwd(), "fleet-projects.json");
const PROGRESS_FILE = path.join(process.cwd(), "fleet-progress.json");

export interface FleetProject {
  desktop: number;
  name: string;
  path: string;
  goal: string;
  mode?: "assess" | "build" | "full";
}

export interface ProgressEntry {
  ts: string;
  project: string;
  desktop: number;
  mode: string;
  ok: boolean;
  summary: string;
  durationMs: number;
}

const MODE_TO_PERM: Record<string, string> = {
  assess: "plan",
  build: "acceptEdits",
  full: "bypassPermissions"
};

export function readProjects(): FleetProject[] {
  try { return JSON.parse(fs.readFileSync(PROJECTS_FILE, "utf8")); } catch { return []; }
}
export function writeProjects(p: FleetProject[]): void {
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(p, null, 2), "utf8");
}
export function readProgress(): ProgressEntry[] {
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8")); } catch { return []; }
}
function appendProgress(e: ProgressEntry): void {
  const all = readProgress();
  all.unshift(e);
  try { fs.writeFileSync(PROGRESS_FILE, JSON.stringify(all.slice(0, 200), null, 2), "utf8"); } catch (err) { console.error("fleet progress write:", err); }
}

function parseClaudeResult(raw: string): string {
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) {
      const r = [...p].reverse().find((m: any) => m.type === "result");
      return String(r?.result || p[p.length - 1]?.result || "").slice(0, 2000);
    }
    return String(p.result || p.content || "").slice(0, 2000);
  } catch {
    return raw.slice(0, 2000);
  }
}

function buildPrompt(project: FleetProject, mode: string): string {
  const base = `You are an autonomous engineering autopilot for the project "${project.name}" (folder: ${project.path}). Project goal: ${project.goal || "(no goal set — infer the most valuable objective from the codebase)"}.`;
  if (mode === "assess") {
    return `${base}\nDO NOT modify anything. Read the project and assess: (1) what is the current state/progress, (2) the single highest-value next step, (3) any blockers. Be concrete and concise (under 150 words).`;
  }
  if (mode === "build") {
    return `${base}\nAdvance the project by ONE concrete, safe, reversible step toward the goal — edit files as needed. Do NOT run destructive commands (no deletes, force-push, deploys) and nothing outward-facing (no sending, publishing, payments). When done, summarize exactly what you changed and the next step (under 150 words).`;
  }
  return `${base}\nAdvance the project toward the goal autonomously, making the changes you judge necessary. When done, summarize what you did and what remains (under 150 words).`;
}

function runClaudeInProject(project: FleetProject, mode: string): Promise<{ ok: boolean; summary: string; ms: number }> {
  return new Promise((resolve) => {
    const start = Date.now();
    if (!project.path || !fs.existsSync(project.path)) {
      return resolve({ ok: false, summary: `Project path not found: ${project.path}`, ms: 0 });
    }
    const perm = MODE_TO_PERM[mode] || "plan";
    const model = process.env.CLAUDE_MODEL || "opus";
    const bin = process.env.CLAUDE_BIN || "claude";
    const args = ["-p", "--output-format", "json", "--model", model, "--permission-mode", perm];
    let out = "", err = "";
    let child;
    try {
      child = spawn(bin, args, { cwd: project.path, shell: process.platform === "win32", windowsHide: true });
    } catch (e: any) {
      return resolve({ ok: false, summary: `spawn failed: ${e?.message || e}`, ms: Date.now() - start });
    }
    const timer = setTimeout(() => { try { child!.kill(); } catch { /* ignore */ } }, 15 * 60 * 1000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => { clearTimeout(timer); resolve({ ok: false, summary: `error: ${e.message}`, ms: Date.now() - start }); });
    child.on("close", (code) => {
      clearTimeout(timer);
      const summary = parseClaudeResult(out) || err.slice(0, 400) || `claude exited ${code}`;
      resolve({ ok: code === 0, summary, ms: Date.now() - start });
    });
    child.stdin.write(buildPrompt(project, mode));
    child.stdin.end();
  });
}

let running = false;
let lastRunStartedAt: string | null = null;

export function fleetStatus() {
  return { running, lastRunStartedAt, projects: readProjects(), progress: readProgress() };
}

// Fire-and-forget: runs each project one step sequentially, logging progress as
// it goes. Returns immediately; poll fleetStatus() for results.
export function startFleetRun(mode: string, onlyDesktop?: number): { started: boolean; reason?: string } {
  if (running) return { started: false, reason: "A fleet run is already in progress." };
  const projects = readProjects().filter((p) => p.path && (!onlyDesktop || p.desktop === onlyDesktop));
  if (projects.length === 0) return { started: false, reason: "No projects configured (edit fleet-projects.json)." };

  running = true;
  lastRunStartedAt = new Date().toISOString();
  (async () => {
    try {
      for (const project of projects) {
        const m = mode || project.mode || "assess";
        appendProgress({ ts: new Date().toISOString(), project: project.name, desktop: project.desktop, mode: m, ok: true, summary: `▶ Starting (${m})…`, durationMs: 0 });
        const r = await runClaudeInProject(project, m);
        appendProgress({ ts: new Date().toISOString(), project: project.name, desktop: project.desktop, mode: m, ok: r.ok, summary: r.summary, durationMs: r.ms });
      }
    } catch (e) {
      console.error("fleet run error:", e);
    } finally {
      running = false;
    }
  })();

  return { started: true };
}
