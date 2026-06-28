```typescript
import { writeJsonAtomic } from "../lib/atomic";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export type SecretKind = "openrouter-key" | "google-client" | "totp" | "ssh" | "webhook" | "other";
export type SecretScope = "global" | "project" | "service" | "infrastructure" | "deployment" | "temporary";
export interface SecretRef {
  id: string;
  name: string;
  kind: SecretKind;
  scope: SecretScope;
  provenance: string;
  firstSeen: string;
  lastUsed?: string;
  repo?: string;
}

const FILE_PATH = join(process.cwd(), "secret-references.json");

function looksLikeSecret(s: string): boolean {
  if (typeof s !== "string") return false;
  if (s.startsWith("sk-") || s.startsWith("sk-or-v1-")) return true;
  if (/^AKIA[A-Z0-9]{16}$/.test(s)) return true;
  if (s.startsWith("ghp_")) return true;
  if (s.startsWith("GOCSPX-")) return true;
  if ((s.match(/\./g) || []).length === 2 && s.startsWith("eyJ")) return true;
  if (s.length >= 32 && /^[a-zA-Z0-9+/=]+$/.test(s)) return true;
  if (s.length >= 32 && /^[a-fA-F0-9]+$/.test(s)) return true;
  return false;
}

function scanForSecrets(obj: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string" && looksLikeSecret(value)) {
      throw new Error("refusing to store value that looks like a secret");
    }
  }
}

function readRefs(): SecretRef[] {
  if (!existsSync(FILE_PATH)) return [];
  try {
    const data = JSON.parse(readFileSync(FILE_PATH, "utf-8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeRefs(refs: SecretRef[]): void {
  writeJsonAtomic(FILE_PATH, refs);
}

export function listRefs(): SecretRef[] {
  return readRefs();
}

export function addRef(meta: Omit<SecretRef, "id" | "firstSeen">): SecretRef {
  const sanitized = { ...meta };
  delete sanitized["value"];
  scanForSecrets(sanitized as Record<string, string>);

  const ref: SecretRef = {
    id: randomUUID(),
    firstSeen: new Date().toISOString(),
    ...sanitized,
  };

  const refs = readRefs();
  refs.push(ref);
  writeRefs(refs);
  return ref;
}

export function removeRef(id: string): boolean {
  const refs = readRefs();
  const initialLength = refs.length;
  const filtered = refs.filter(ref => ref.id !== id);
  if (filtered.length === initialLength) return false;
  writeRefs(filtered);
  return true;
}

export function markUsed(id: string): SecretRef | null {
  const refs = readRefs();
  const ref = refs.find(r => r.id === id);
  if (!ref) return null;
  ref.lastUsed = new Date().toISOString();
  writeRefs(refs);
  return ref;
}
```