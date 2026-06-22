// Autopilot learning store. Records how often you approve vs. reject each kind
// of suggested action. Once an action type is approved enough times with zero
// rejections, the autopilot is allowed to run it automatically (with less
// effort from you) — this is the "it learns your behaviour and takes control"
// mechanism, deliberately scoped so it can ONLY ever raise autonomy for actions
// already classified safe + reversible by the engine.

import fs from "fs";
import path from "path";

const FILE = path.join(process.cwd(), "autopilot-learning.json");

// Number of clean approvals (no rejections) before an action type is "trusted".
const TRUST_THRESHOLD = parseInt(process.env.AUTOPILOT_TRUST_THRESHOLD || "3", 10);

interface Entry {
  approved: number;
  rejected: number;
  lastTs: string;
}
type Store = Record<string, Entry>;

function read(): Store {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
}

function write(s: Store): void {
  try {
    fs.writeFileSync(FILE, JSON.stringify(s, null, 2), "utf8");
  } catch (e) {
    console.error("autopilot learn write failed:", e);
  }
}

export function recordFeedback(actionKey: string, approved: boolean): void {
  if (!actionKey) return;
  const s = read();
  const e = s[actionKey] || { approved: 0, rejected: 0, lastTs: "" };
  if (approved) e.approved++;
  else e.rejected++;
  e.lastTs = new Date().toISOString();
  s[actionKey] = e;
  write(s);
}

export function autonomyFor(actionKey: string): { trusted: boolean; approved: number; rejected: number } {
  const e = read()[actionKey];
  if (!e) return { trusted: false, approved: 0, rejected: 0 };
  return {
    trusted: e.approved >= TRUST_THRESHOLD && e.rejected === 0,
    approved: e.approved,
    rejected: e.rejected
  };
}

export function allLearning(): Store {
  return read();
}
