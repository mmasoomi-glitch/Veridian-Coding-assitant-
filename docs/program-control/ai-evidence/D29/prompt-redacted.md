Return ONLY TypeScript, no prose, no code fences. Write a small, self-contained
Veridian "trusted device registry" module. Conventions to follow exactly:

- import fs from "node:fs"; import path from "node:path";
- import { writeJsonAtomic } from "../lib/atomic";   // signature: writeJsonAtomic(file: string, data: unknown, pretty?: boolean): void
- The data file path is: const DEVICES_FILE = path.join(process.cwd(), "devices.json");
- Persist atomically via writeJsonAtomic on every mutation.
- Read tolerantly: if the file is missing or unparsable, treat the registry as empty [] (never throw).

Types:
export interface Device {
  id: string;        // stable unique id (generate; e.g. crypto.randomUUID())
  name: string;
  os: string;
  trusted: boolean;
  firstSeen: string; // ISO timestamp
  lastSeen: string;  // ISO timestamp
}

Public API (all operate on the persisted registry):
- export function listDevices(): Device[]
- export function enroll(input: { name: string; os: string }): Device   // trusted=false by default; firstSeen=lastSeen=now; generate id; persist; return the new device
- export function setTrusted(id: string, trusted: boolean): Device | null  // update trusted, persist, return updated or null if not found
- export function touch(id: string): Device | null   // update lastSeen=now, persist, return updated or null if not found
- export function removeDevice(id: string): boolean   // remove by id, persist, return true if removed else false

Keep it small and total. Use crypto.randomUUID() from "node:crypto". Trim/validate name & os are non-empty strings in enroll (throw a clear Error if empty). No other dependencies.
