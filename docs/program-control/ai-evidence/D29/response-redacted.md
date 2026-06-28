```typescript
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { writeJsonAtomic } from "../lib/atomic";

const DEVICES_FILE = path.join(process.cwd(), "devices.json");

export interface Device {
  id: string;
  name: string;
  os: string;
  trusted: boolean;
  firstSeen: string;
  lastSeen: string;
}

function readDevices(): Device[] {
  try {
    const content = fs.readFileSync(DEVICES_FILE, "utf8");
    return JSON.parse(content) as Device[];
  } catch {
    return [];
  }
}

function writeDevices(devices: Device[]): void {
  writeJsonAtomic(DEVICES_FILE, devices, true);
}

export function listDevices(): Device[] {
  return readDevices();
}

export function enroll(input: { name: string; os: string }): Device {
  const name = input.name.trim();
  const os = input.os.trim();
  if (!name || !os) throw new Error("Name and OS must be non-empty");

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

export function setTrusted(id: string, trusted: boolean): Device | null {
  const devices = readDevices();
  const device = devices.find((d) => d.id === id);
  if (!device) return null;

  device.trusted = trusted;
  writeDevices(devices);
  return device;
}

export function touch(id: string): Device | null {
  const devices = readDevices();
  const device = devices.find((d) => d.id === id);
  if (!device) return null;

  device.lastSeen = new Date().toISOString();
  writeDevices(devices);
  return device;
}

export function removeDevice(id: string): boolean {
  const devices = readDevices();
  const index = devices.findIndex((d) => d.id === id);
  if (index === -1) return false;

  devices.splice(index, 1);
  writeDevices(devices);
  return true;
}
```