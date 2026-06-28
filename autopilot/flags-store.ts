// D06 — Feature flags + policy resolution. The control center's on/off switches for
// Veridian subsystems. Atomic-persisted; admin-gated writes (in server.ts). No secrets.
//
// Flags default ON unless explicitly disabled, so existing behavior is unchanged until the
// owner turns something off. Unknown flags resolve to their default (true) so a missing
// store never silently disables a subsystem.

import fs from "node:fs";
import path from "node:path";
import { writeJsonAtomic } from "../lib/atomic";

const FILE = path.join(process.cwd(), "feature-flags.json");

export interface FeatureFlag {
  id: string;
  enabled: boolean;
  description?: string;
  updatedAt: string;
}

// Known subsystems + default state + human description.
const DEFAULTS: Array<{ id: string; description: string; enabled: boolean }> = [
  { id: "telemetry", description: "Local machine telemetry collector", enabled: true },
  { id: "keystroke", description: "Consent-based typing-recovery recorder (visible)", enabled: false },
  { id: "screenshots", description: "Auto screenshot capture", enabled: true },
  { id: "autopilot", description: "Autopilot suggestions/fleet", enabled: true },
  { id: "clipboardSync", description: "Cross-device E2E clipboard", enabled: false },
  { id: "sync", description: "Central command sync", enabled: false },
  { id: "orchestrator", description: "Dev orchestrator collectors (repo registry/risk)", enabled: true },
  { id: "voice", description: "Veridian voice / proactive speech", enabled: true }
];

function read(): Record<string, FeatureFlag> {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}
function write(map: Record<string, FeatureFlag>): void {
  writeJsonAtomic(FILE, map);
}

/** All flags, defaults merged with any persisted overrides. */
export function listFlags(): FeatureFlag[] {
  const stored = read();
  return DEFAULTS.map((d) => stored[d.id] || { id: d.id, enabled: d.enabled, description: d.description, updatedAt: "" });
}

/** Resolve a flag's effective state. Unknown id → default true (never silently off). */
export function isEnabled(id: string): boolean {
  const stored = read()[id];
  if (stored) return stored.enabled;
  const def = DEFAULTS.find((d) => d.id === id);
  return def ? def.enabled : true;
}

/** Set a flag (admin). Returns the full list. */
export function setFlag(id: string, enabled: boolean): FeatureFlag[] {
  const def = DEFAULTS.find((d) => d.id === id);
  if (!def) throw new Error("unknown flag");
  const map = read();
  map[id] = { id, enabled: !!enabled, description: def.description, updatedAt: new Date().toISOString() };
  write(map);
  return listFlags();
}
