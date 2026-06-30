// D29 — Trusted device registry.
//
// A small, atomic-persisted registry of the devices that may participate in the
// Veridian fleet/sync. A device is enrolled UNTRUSTED by default; the owner flips
// `trusted` explicitly (no device trusts itself in). State lives in `devices.json`
// and every mutation is written via writeJsonAtomic (durability gates F-013/14/15).
//
// Reads are tolerant: a missing or corrupt file is treated as an empty registry,
// never throws. Drafted via OpenRouter (evidence: docs/program-control/ai-evidence/D29),
// reviewed, then hardened (Array.isArray guard, matching repo-registry.ts).

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { writeJsonAtomic } from "../lib/atomic";
import { dataPath } from "../lib/paths";

const DEVICES_FILE = dataPath("devices.json");

export interface Device {
  id: string;        // stable unique id (uuid)
  name: string;
  os: string;
  trusted: boolean;  // false by default — owner flips it explicitly
  firstSeen: string; // ISO timestamp
  lastSeen: string;  // ISO timestamp
}

/** Read the registry tolerantly: missing/corrupt/non-array ⇒ []. Never throws. */
function readDevices(): Device[] {
  try {
    const raw = JSON.parse(fs.readFileSync(DEVICES_FILE, "utf8"));
    return Array.isArray(raw) ? (raw as Device[]) : [];
  } catch {
    return [];
  }
}

function writeDevices(devices: Device[]): void {
  writeJsonAtomic(DEVICES_FILE, devices);
}

/** All enrolled devices, in enrollment order. */
export function listDevices(): Device[] {
  return readDevices();
}

/** Enroll a new device (trusted=false by default). Persists and returns it. */
export function enroll(input: { name: string; os: string }): Device {
  const name = (input?.name ?? "").trim();
  const os = (input?.os ?? "").trim();
  if (!name) throw new Error("enroll: device name must be a non-empty string");
  if (!os) throw new Error("enroll: device os must be a non-empty string");

  const now = new Date().toISOString();
  const device: Device = {
    id: randomUUID(),
    name,
    os,
    trusted: false,
    firstSeen: now,
    lastSeen: now,
  };

  const devices = readDevices();
  devices.push(device);
  writeDevices(devices);
  return device;
}

/** Set the trusted flag for a device. Returns the updated device or null if not found. */
export function setTrusted(id: string, trusted: boolean): Device | null {
  const devices = readDevices();
  const device = devices.find((d) => d.id === id);
  if (!device) return null;
  device.trusted = trusted;
  writeDevices(devices);
  return device;
}

/** Update lastSeen to now. Returns the updated device or null if not found. */
export function touch(id: string): Device | null {
  const devices = readDevices();
  const device = devices.find((d) => d.id === id);
  if (!device) return null;
  device.lastSeen = new Date().toISOString();
  writeDevices(devices);
  return device;
}

/** Remove a device by id. Returns true if a device was removed. */
export function removeDevice(id: string): boolean {
  const devices = readDevices();
  const index = devices.findIndex((d) => d.id === id);
  if (index === -1) return false;
  devices.splice(index, 1);
  writeDevices(devices);
  return true;
}
