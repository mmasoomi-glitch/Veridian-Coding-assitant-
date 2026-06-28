// D05 — Settings / policy registry with scoped effective-setting resolution.
//
// Scopes form a precedence chain (most specific wins): global < device < project.
// `getEffective` resolves a key by walking project target -> device target -> global,
// then falling back to a small set of KNOWN_DEFAULTS, then `undefined` for truly
// unknown keys. State persists atomically to `orchestrator-settings.json` via the
// crash-safe helper (lib/atomic). No secrets are stored here — this is policy/config.
//
// Design notes (see docs/program-control/ai-evidence/D05): an OpenRouter draft seeded
// the type model + resolution order. Its load path (require()), its async .catch() on
// the SYNC writeJsonAtomic, and its empty-global "is loaded?" heuristic were rejected
// and reimplemented below: explicit `fs.readFileSync`, synchronous persist, and a
// dedicated `loaded` flag. `setSetting` validates scope/target rather than silently
// no-op'ing, so a bad call surfaces instead of vanishing.

import fs from "node:fs";
import path from "node:path";
import { writeJsonAtomic } from "../lib/atomic";

const SETTINGS_FILE = path.join(process.cwd(), "orchestrator-settings.json");

export type SettingScope = "global" | "device" | "project";

/** On-disk shape. Scoped tables are keyed by target id (device id / project id). */
export interface SettingsStore {
  global: Record<string, unknown>;
  device: Record<string, Record<string, unknown>>;
  project: Record<string, Record<string, unknown>>;
}

/** Built-in defaults applied when no scope has set a key. NEVER put secrets here. */
export const KNOWN_DEFAULTS: Record<string, unknown> = {
  telemetryPollMs: 30000,
  voiceVerbosity: "normal",
};

function emptyStore(): SettingsStore {
  return { global: {}, device: {}, project: {} };
}

let store: SettingsStore | null = null;

/** Coerce arbitrary parsed JSON into a well-formed SettingsStore (tolerant of partial/old files). */
function normalize(raw: unknown): SettingsStore {
  const s = emptyStore();
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (r.global && typeof r.global === "object") s.global = r.global as Record<string, unknown>;
    if (r.device && typeof r.device === "object") s.device = r.device as Record<string, Record<string, unknown>>;
    if (r.project && typeof r.project === "object") s.project = r.project as Record<string, Record<string, unknown>>;
  }
  return s;
}

/** Load once from disk. Missing or corrupt file => empty store (never throws on read). */
function load(): SettingsStore {
  if (store) return store;
  try {
    store = normalize(JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")));
  } catch {
    store = emptyStore(); // missing / unreadable / corrupt JSON — start clean
  }
  return store;
}

function persist(s: SettingsStore): void {
  writeJsonAtomic(SETTINGS_FILE, s); // synchronous: tmp + fsync + atomic rename
}

/**
 * Resolve the effective value of `key` for the given context.
 * Precedence: project target -> device target -> global -> KNOWN_DEFAULTS -> undefined.
 * A scope "sets" a key only if it holds that key as an OWN property (so an explicit
 * `null` shadows lower scopes; an absent key falls through).
 */
export function getEffective(key: string, ctx?: { device?: string; project?: string }): unknown {
  const s = load();
  if (ctx?.project) {
    const p = s.project[ctx.project];
    if (p && Object.prototype.hasOwnProperty.call(p, key)) return p[key];
  }
  if (ctx?.device) {
    const d = s.device[ctx.device];
    if (d && Object.prototype.hasOwnProperty.call(d, key)) return d[key];
  }
  if (Object.prototype.hasOwnProperty.call(s.global, key)) return s.global[key];
  if (Object.prototype.hasOwnProperty.call(KNOWN_DEFAULTS, key)) return KNOWN_DEFAULTS[key];
  return undefined; // truly unknown
}

/**
 * Set `key` to `value` in `scope`. For device/project scopes `target` (the device id /
 * project id) is required. Persists atomically. Throws on invalid scope or missing target
 * so misuse surfaces rather than silently no-op'ing.
 */
export function setSetting(scope: SettingScope, key: string, value: unknown, target?: string): void {
  if (!key || typeof key !== "string") throw new Error("setSetting: key must be a non-empty string");
  const s = load();
  switch (scope) {
    case "global":
      s.global[key] = value;
      break;
    case "device":
      if (!target) throw new Error("setSetting: device scope requires a target (device id)");
      (s.device[target] ??= {})[key] = value;
      break;
    case "project":
      if (!target) throw new Error("setSetting: project scope requires a target (project id)");
      (s.project[target] ??= {})[key] = value;
      break;
    default:
      throw new Error(`setSetting: unknown scope "${String(scope)}"`);
  }
  persist(s);
}

/** Full stored structure (deep copy — callers can't mutate the in-memory store). */
export function listSettings(): SettingsStore {
  return structuredClone(load());
}

/** Test/maintenance hook: drop the in-memory cache so the next call re-reads from disk. */
export function _resetForTests(): void {
  store = null;
}
