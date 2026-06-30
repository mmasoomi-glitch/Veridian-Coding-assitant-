// CENTRAL side of cross-device clipboard sync. Each local instance pushes its
// recent clipboard entries as END-TO-END-ENCRYPTED blobs; this store keeps them
// keyed by machine so any other device can pull and decrypt them locally.
//
// PRIVACY: the central server stores ONLY ciphertext (the `blob` field). It has no
// key and never decrypts — it cannot read what was copied. The `preview` it stores
// was already redaction-safe on the source device (secrets masked). Everything is
// wrapped in try/catch and never throws.

import fs from "fs";
import path from "path";
import { writeJsonAtomic } from "../lib/atomic";
import { dataPath } from "../lib/paths";

const FILE = dataPath("clip-sync.json");
const PER_MACHINE_CAP = 100; // newest-first cap per machine
const LIST_CAP = 200;        // total returned on pull

export interface ClipBlob {
  id: string;       // stable id from the source device
  ts: string;       // ISO timestamp from the source device
  blob: string;     // E2E ciphertext (central cannot read)
  preview: string;  // redaction-safe preview (secrets already masked at source)
  isSecret: boolean;
  length: number;
}

interface MachineClips {
  hostname: string;
  entries: ClipBlob[];
}

type Store = Record<string, MachineClips>;

function read(): Store {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return raw && typeof raw === "object" ? (raw as Store) : {};
  } catch {
    return {};
  }
}

function write(s: Store): void {
  try {
    writeJsonAtomic(FILE, s);
  } catch (e) {
    console.error("clip-sync-store write failed:", e);
  }
}

function sanitizeEntry(e: any): ClipBlob | null {
  if (!e || typeof e !== "object") return null;
  const blob = String(e.blob || "");
  const id = String(e.id || "");
  if (!blob || !id) return null;
  return {
    id,
    ts: String(e.ts || ""),
    blob,
    preview: String(e.preview || ""),
    isSecret: Boolean(e.isSecret),
    length: Number(e.length || 0)
  };
}

/** Upsert a machine's encrypted clip blobs, dedup by id, newest-first, capped. */
export function recordClipBlobs(machineId: string, hostname: string, entries: any[]): void {
  try {
    if (!machineId || !Array.isArray(entries)) return;
    const store = read();
    const prev = store[machineId]?.entries || [];
    const incoming = entries.map(sanitizeEntry).filter(Boolean) as ClipBlob[];
    // Merge: incoming first, then any prior not re-sent, dedup by id.
    const seen = new Set<string>();
    const merged: ClipBlob[] = [];
    for (const e of [...incoming, ...prev]) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      merged.push(e);
    }
    merged.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
    store[machineId] = { hostname: String(hostname || machineId), entries: merged.slice(0, PER_MACHINE_CAP) };
    write(store);
  } catch (e) {
    console.error("recordClipBlobs failed:", e);
  }
}

/** All known encrypted clip blobs across machines (optionally excluding one),
 *  newest-first, each tagged with its origin machine/hostname. Ciphertext only. */
export function listClipBlobs(excludeMachineId?: string): Array<ClipBlob & { machineId: string; origin: string }> {
  try {
    const store = read();
    const out: Array<ClipBlob & { machineId: string; origin: string }> = [];
    for (const [machineId, mc] of Object.entries(store)) {
      if (excludeMachineId && machineId === excludeMachineId) continue;
      for (const e of mc.entries || []) {
        out.push({ ...e, machineId, origin: mc.hostname || machineId });
      }
    }
    out.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
    return out.slice(0, LIST_CAP);
  } catch {
    return [];
  }
}
