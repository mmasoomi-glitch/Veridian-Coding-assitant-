// CENTRAL side of multi-machine sync. A central Veridian server (pr.afaq24.store)
// aggregates state pushed from several local Veridian instances so it can render a
// single "command center" view of the whole fleet of machines.
//
// Each local instance POSTs a snapshot of its current state to /api/sync/push; this
// store upserts that snapshot keyed by machineId into sync-machines.json. The central
// dashboard then reads listMachines()/getMachine() to render the fleet.
//
// Everything here is wrapped in try/catch and NEVER throws — a malformed push or a
// disk hiccup must never take down the central server.

import fs from "fs";
import path from "path";
import { sanitizeOutboundSnapshot, payloadHasForbiddenFields } from "./sync-sanitize";
import { writeJsonAtomic } from "../lib/atomic";
import { dataPath } from "../lib/paths";

const FILE = dataPath("sync-machines.json");

export interface MachineSnapshot {
  machineId: string;
  hostname: string;
  lastSeen: string;
  currentState: any;
  sessions: any[];
  waiting: any[];
  ts: string;
}

type Store = Record<string, MachineSnapshot>;

function read(): Store {
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Store) : {};
  } catch {
    // Missing/corrupt file → empty store. Never throw.
    return {};
  }
}

function write(s: Store): void {
  try {
    writeJsonAtomic(FILE, s);
  } catch (e) {
    console.error("sync-store write failed:", e);
  }
}

/**
 * Upsert a machine's snapshot. lastSeen/ts are stamped server-side on receipt so
 * clock skew on the local instances can't poison the "freshness" sort/colouring.
 */
export function recordMachine(payload: {
  machineId: string;
  hostname?: string;
  currentState?: any;
  sessions?: any[];
  waiting?: any[];
}): void {
  try {
    if (!payload || !payload.machineId) return;

    // F-004 defense-in-depth: even if a stale/misconfigured local agent sends
    // sensitive fields, the central store re-sanitizes through the same allowlist
    // so raw clipboard/paths/commands/URLs can never be persisted here.
    if (payloadHasForbiddenFields(payload)) {
      console.warn(
        `sync-store: dropped forbidden sensitive field(s) from ${payload.machineId} (central stores allowlisted aggregation only)`
      );
    }
    const safe = sanitizeOutboundSnapshot(payload);

    const now = new Date().toISOString();
    const store = read();
    const prev = store[payload.machineId];

    store[payload.machineId] = {
      machineId: payload.machineId,
      hostname: payload.hostname || prev?.hostname || payload.machineId,
      lastSeen: now,
      currentState: safe.currentState ?? prev?.currentState ?? {},
      sessions: Array.isArray(safe.sessions) ? safe.sessions : prev?.sessions ?? [],
      waiting: Array.isArray(safe.waiting) ? safe.waiting : prev?.waiting ?? [],
      ts: now,
    };

    write(store);
  } catch (e) {
    console.error("recordMachine failed:", e);
  }
}

/** All known machines, newest lastSeen first. */
export function listMachines(): MachineSnapshot[] {
  try {
    return Object.values(read()).sort(
      (a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
    );
  } catch {
    return [];
  }
}

/** A single machine's snapshot, or null if unknown. */
export function getMachine(id: string): MachineSnapshot | null {
  try {
    if (!id) return null;
    return read()[id] || null;
  } catch {
    return null;
  }
}
