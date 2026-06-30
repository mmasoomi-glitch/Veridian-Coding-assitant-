// Per-desktop retained context. Stores a small "where I was + next step" brief
// keyed by desktop label (e.g. "Desktop 2 (SHOPIFY)"), so that landing on a
// desktop can instantly resurface what you were doing there.

import fs from "fs";
import path from "path";
import { writeJsonAtomic } from "../lib/atomic";
import { dataPath } from "../lib/paths";

const FILE = dataPath("desktop-briefs.json");

export interface DesktopBrief {
  desktop: string;
  updatedAt: string;
  wasDoing: string;
  nextStep: string;
  raw?: any;
}

function read(): Record<string, DesktopBrief> {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
}

function write(d: Record<string, DesktopBrief>): void {
  try {
    writeJsonAtomic(FILE, d);
  } catch (e) {
    console.error("desktop-briefs write failed:", e);
  }
}

export function saveBrief(desktop: string, b: Partial<DesktopBrief>): void {
  if (!desktop) return;
  const all = read();
  all[desktop] = {
    desktop,
    updatedAt: new Date().toISOString(),
    wasDoing: b.wasDoing || "",
    nextStep: b.nextStep || "",
    raw: b.raw
  };
  write(all);
}

export function getBrief(desktop: string): DesktopBrief | null {
  return read()[desktop] || null;
}

export function allBriefs(): Record<string, DesktopBrief> {
  return read();
}
