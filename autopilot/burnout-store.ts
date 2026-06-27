// Burnout / fatigue assessment from PRIVACY-SAFE keystroke metrics.
//
// Input is telemetry/keystroke-metrics.ps1's output: keystroke-metrics.json,
// a rolling array of timing-only samples shaped:
//   { ts, keys, corrections, avgGapMs, maxGapMs, longPauses }
// There is NEVER any key content here — only counts and timings — so nothing
// in this module can read or infer what was typed.
//
// assess() turns the recent samples into a 0-100 fatigue score + level +
// human-readable reasons. shouldNudge() rate-limits gentle nudges. Neither
// throws: on any failure they return a safe "ok / no data" result.

import fs from "node:fs";
import path from "node:path";
import { writeJsonAtomic } from "../lib/atomic";

const METRICS_FILE = path.join(process.cwd(), "keystroke-metrics.json");
const NUDGE_FILE = path.join(process.cwd(), "burnout-nudge.json");

const RECENT_WINDOW_MS = 10 * 60 * 1000; // last ~10 minutes
const NUDGE_COOLDOWN_MS = 5 * 60 * 1000; // >5 min between nudges

export interface BurnoutState {
  score: number;
  level: "ok" | "tired" | "burnt";
  reasons: string[];
  ts: string;
}

interface MetricsSample {
  ts: string;
  keys: number;
  corrections: number;
  avgGapMs: number;
  maxGapMs: number;
  longPauses: number;
}

// ---- sample loading ------------------------------------------------------

function readSamples(): MetricsSample[] {
  try {
    const raw = fs.readFileSync(METRICS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr.map(coerce).filter((s): s is MetricsSample => s !== null);
  } catch {
    return [];
  }
}

function coerce(s: any): MetricsSample | null {
  if (!s || typeof s !== "object") return null;
  const ts = String(s.ts ?? "");
  if (!ts) return null;
  return {
    ts,
    keys: num(s.keys),
    corrections: num(s.corrections),
    avgGapMs: num(s.avgGapMs),
    maxGapMs: num(s.maxGapMs),
    longPauses: num(s.longPauses)
  };
}

function num(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function recentSamples(samples: MetricsSample[], now: number): MetricsSample[] {
  return samples
    .filter((s) => {
      const t = Date.parse(s.ts);
      return Number.isFinite(t) && now - t <= RECENT_WINDOW_MS;
    })
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
}

// ---- assessment ----------------------------------------------------------

export function assess(): BurnoutState {
  const nowIso = new Date().toISOString();
  try {
    const all = readSamples();
    const recent = recentSamples(all, Date.now());

    if (recent.length === 0) {
      return { score: 0, level: "ok", reasons: ["no data"], ts: nowIso };
    }

    const totalKeys = recent.reduce((a, s) => a + s.keys, 0);
    const totalCorr = recent.reduce((a, s) => a + s.corrections, 0);
    const totalLongPauses = recent.reduce((a, s) => a + s.longPauses, 0);

    let score = 0;
    const reasons: string[] = [];

    // 1) High correction ratio -> fatigue / frustration.
    const corrRatio = totalKeys > 0 ? totalCorr / totalKeys : 0;
    if (totalKeys >= 20 && corrRatio > 0.25) {
      // Scale: 0.25 -> ~0 contribution, 0.5+ -> ~30.
      const over = Math.min(corrRatio - 0.25, 0.25);
      score += Math.round((over / 0.25) * 30);
      reasons.push("high correction rate");
    }

    // 2) Rising avgGapMs over the window -> slowing down.
    const gapped = recent.filter((s) => s.keys > 0);
    if (gapped.length >= 3) {
      const half = Math.floor(gapped.length / 2);
      const first = avg(gapped.slice(0, half).map((s) => s.avgGapMs));
      const last = avg(gapped.slice(gapped.length - half).map((s) => s.avgGapMs));
      if (first > 0 && last > first * 1.4) {
        score += 22;
        reasons.push("slowing down");
      }
    }

    // 3) Frequent long pauses (gaps > 3s) -> disengaged / staring.
    const pausesPerSample = totalLongPauses / recent.length;
    if (totalLongPauses >= 3 && pausesPerSample >= 0.5) {
      score += Math.min(20, Math.round(pausesPerSample * 12));
      reasons.push("long pauses");
    }

    // 4) Very low activity across the window -> stalled.
    const activeSamples = recent.filter((s) => s.keys > 0).length;
    const stalledRatio = 1 - activeSamples / recent.length;
    if (recent.length >= 4 && totalKeys < 30 && stalledRatio > 0.5) {
      score += 18;
      reasons.push("stalled");
    }

    // 5) Erratic bursts -> high variance in per-sample keys.
    if (recent.length >= 4) {
      const counts = recent.map((s) => s.keys);
      const mean = avg(counts);
      if (mean > 0) {
        const variance = avg(counts.map((c) => (c - mean) ** 2));
        const cv = Math.sqrt(variance) / mean; // coefficient of variation
        if (cv > 1.1) {
          score += 12;
          reasons.push("erratic bursts");
        }
      }
    }

    score = Math.max(0, Math.min(100, Math.round(score)));

    let level: BurnoutState["level"] = "ok";
    if (score > 70) level = "burnt";
    else if (score >= 40) level = "tired";

    if (reasons.length === 0) reasons.push("steady");

    return { score, level, reasons, ts: nowIso };
  } catch {
    return { score: 0, level: "ok", reasons: ["no data"], ts: nowIso };
  }
}

function avg(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

// ---- nudge rate-limiting -------------------------------------------------

function readLastNudge(): number {
  try {
    const raw = fs.readFileSync(NUDGE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const t = Date.parse(String(parsed?.lastNudge ?? ""));
    return Number.isFinite(t) ? t : 0;
  } catch {
    return 0;
  }
}

function writeLastNudge(ts: string): void {
  try {
    writeJsonAtomic(NUDGE_FILE, { lastNudge: ts });
  } catch {
    /* never throw */
  }
}

// True when the user is tired/burnt AND we haven't nudged in the last 5 min.
// Records the nudge time when it returns true, so callers self-rate-limit.
export function shouldNudge(): boolean {
  try {
    const state = assess();
    if (state.level === "ok") return false;
    const last = readLastNudge();
    if (Date.now() - last < NUDGE_COOLDOWN_MS) return false;
    writeLastNudge(new Date().toISOString());
    return true;
  } catch {
    return false;
  }
}
