// Autopilot Fleet: per-project planning via the direct Anthropic-compatible
// provider (Opus). PLAN-ONLY. The HTTP provider cannot execute file changes,
// so BUILD/FULL are disabled (and were unsafe to ship anyway). No CLI shell-out.
//
//   assess -> sends sanitized project metadata to the provider, returns a plan
//   build/full -> DISABLED (honest), pending a separately-reviewed execution path

import fs from "node:fs";
import path from "node:path";
import { chatJSON, aiConfigured } from "../ai/providers";
import { getGitStats } from "../telemetry/gitstats";

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

// PLAN-ONLY assessment via the direct Anthropic-compatible provider.
// Sends sanitized project METADATA only (name, goal, git stats) — never file
// contents, clipboard, or secrets. BUILD/FULL are refused (no execution path).
async function runProjectStep(project: FleetProject, mode: string): Promise<{ ok: boolean; summary: string; ms: number }> {
  const start = Date.now();
  if (mode !== "assess") {
    return { ok: false, summary: "DISABLED — BUILD/FULL require a separately-reviewed execution path. The Anthropic HTTP provider plans only; it cannot modify files. Use ASSESS.", ms: 0 };
  }
  if (!aiConfigured()) {
    return { ok: false, summary: "AI disabled — Anthropic provider not configured (set ANTHROPIC_BASE_URL/ANTHROPIC_API_KEY).", ms: 0 };
  }
  if (!project.path || !fs.existsSync(project.path)) {
    return { ok: false, summary: `Project path not found: ${project.path}`, ms: Date.now() - start };
  }
  try {
    const g: any = await getGitStats(project.path).catch(() => null);
    const meta = g && g.isRepo
      ? `git: branch ${g.currentBranch}, ${g.uncommitted} staged / ${g.unstaged} modified / ${g.untracked} untracked, ahead ${g.ahead} behind ${g.behind}, last commit "${g.lastCommit?.subject || "n/a"}" (${g.lastCommit?.relativeDate || ""})`
      : "git: not a repository or unavailable";
    const system = "You are an engineering planner. From the provided project METADATA ONLY (you are NOT given file contents), assess current state, the single highest-value next step, and any blockers. PLANS ONLY — do not claim to have changed anything. Under 150 words.";
    const user = `Project: ${project.name}\nGoal: ${project.goal || "(infer from metadata)"}\n${meta}`;
    const summary = await chatJSON({ system, user, json: false, maxTokens: 400 });
    return { ok: true, summary: String(summary).slice(0, 2000), ms: Date.now() - start };
  } catch (e: any) {
    // Sanitized error category only.
    return { ok: false, summary: `AI unavailable: ${String(e?.message || "error").replace(/anthropic_http_/, "http ")}`, ms: Date.now() - start };
  }
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
        const r = await runProjectStep(project, m);
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
