// "Waiting On You" sensor.
//
// Instead of scraping random Claude task logs under %LOCALAPPDATA%\Temp\claude
// (which surfaced HTML, git-status lines, build chatter and stray `}`), this
// derives the inbox from THIS project's own persistent state files:
//
//   - sessions.json       — per-desktop persistent Claude sessions
//                           (written by autopilot/sessions.ts)
//   - fleet-progress.json — autopilot fleet run log, newest-first
//                           (written by autopilot/fleet.ts)
//
// Each becomes a clean, meaningful item: which AI session / fleet run, its
// latest output, and how long since it last spoke. Everything is wrapped in
// try/catch; this module never throws and returns [] on any failure.

import * as fs from "node:fs";
import * as path from "node:path";
import { dataPath } from "../lib/paths";

export interface WaitingItem {
  source: string;
  title: string;
  detail: string;
  ageSec: number;
  status: "idle" | "finished";
  path: string;
}

const FINISHED_SEC = 120;
const MAX_DETAIL = 160;
const MAX_FLEET = 5;
const MAX_ITEMS = 12;

function oneLine(raw: unknown): string {
  const s = String(raw ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return s.length > MAX_DETAIL ? s.slice(0, MAX_DETAIL) : s;
}

function ageFrom(ts: unknown, now: number): number {
  const ms = Date.parse(String(ts ?? ""));
  if (!Number.isFinite(ms)) return Number.MAX_SAFE_INTEGER;
  const sec = (now - ms) / 1000;
  return Number.isFinite(sec) && sec >= 0 ? sec : 0;
}

function statusFor(ageSec: number): "idle" | "finished" {
  return ageSec >= FINISHED_SEC ? "finished" : "idle";
}

function readJsonArray(file: string): any[] {
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function sessionItems(now: number): WaitingItem[] {
  const items: WaitingItem[] = [];
  const rows = readJsonArray(dataPath("sessions.json"));
  for (const s of rows) {
    try {
      const desktop = Number(s?.desktop) || 0;
      const sessionId = s?.sessionId != null ? String(s.sessionId) : null;
      const project = s?.project != null ? String(s.project) : "";
      const detail = oneLine(s?.lastSummary);
      const ageSec = ageFrom(s?.lastTs, now);
      const title = `Desktop ${desktop}${project ? " · " + project : ""}`;
      items.push({
        source: "session",
        title,
        detail,
        ageSec,
        status: statusFor(ageSec),
        path: `session:${sessionId || desktop}`
      });
    } catch {
      // skip malformed row
    }
  }
  return items;
}

function fleetItems(now: number): WaitingItem[] {
  const items: WaitingItem[] = [];
  // fleet-progress.json is stored newest-first; take the most recent few.
  const rows = readJsonArray(dataPath("fleet-progress.json")).slice(0, MAX_FLEET);
  for (const e of rows) {
    try {
      const project = String(e?.project ?? "");
      const mode = String(e?.mode ?? "");
      const ts = String(e?.ts ?? "");
      const detail = oneLine(e?.summary);
      const ageSec = ageFrom(ts, now);
      items.push({
        source: "fleet",
        title: `${project} (${mode})`,
        detail,
        ageSec,
        status: statusFor(ageSec),
        path: `fleet:${ts}:${project}`
      });
    } catch {
      // skip malformed row
    }
  }
  return items;
}

export async function getWaitingItems(): Promise<WaitingItem[]> {
  try {
    const now = Date.now();
    const all = [...sessionItems(now), ...fleetItems(now)];

    // Dedupe by path (first occurrence wins).
    const byPath = new Map<string, WaitingItem>();
    for (const item of all) {
      if (!byPath.has(item.path)) byPath.set(item.path, item);
    }

    return Array.from(byPath.values())
      .sort((a, b) => a.ageSec - b.ageSec)
      .slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}
