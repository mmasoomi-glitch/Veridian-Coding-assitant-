// Clipboard history store. Keeps a local, newest-first ring of recent clipboard
// values (max 50) so the owner can glance back at "what did I copy a minute ago?"
// and restore any entry to the OS clipboard.
//
// PRIVACY: secrets (API keys, tokens, JWTs, long opaque blobs) are detected and
// their preview is redacted to the first 4 chars. The raw value is kept on disk
// ONLY locally (clip-history.json at process.cwd()) so restore() can work, but it
// is NEVER returned by list() — callers (and the AI / UI) only see ClipEntry.
//
// All file/spawn I/O is wrapped in try/catch; nothing here throws.

import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const FILE = path.join(process.cwd(), "clip-history.json");
const MAX = 50;

export interface ClipEntry {
  id: string;
  ts: string;
  preview: string;
  isSecret: boolean;
  length: number;
}

// Internal record carries the raw value; never serialized out via list().
interface ClipRecord extends ClipEntry {
  value: string;
}

// High-signal secret patterns: provider key prefixes, JWTs, plus the words
// secret/password/api key/token, plus any single long opaque token (>=40 chars).
const SECRET_TOKEN =
  /\b(sk-[A-Za-z0-9]{6,}|sk_[A-Za-z0-9]{6,}|xi-[A-Za-z0-9]{6,}|gh[pousr]_[A-Za-z0-9]{16,}|AIza[0-9A-Za-z_\-]{20,}|eyJ[A-Za-z0-9_\-]{10,})\b/;
const SECRET_WORD = /(secret|password|api[\s_-]?key|token)/i;
const SECRET_BLOB = /^\S{40,}$/;

function isSecret(text: string): boolean {
  const t = text.trim();
  return SECRET_TOKEN.test(t) || SECRET_WORD.test(t) || SECRET_BLOB.test(t);
}

function makePreview(text: string, secret: boolean): string {
  if (secret) return text.slice(0, 4) + "…[secret]";
  // single line, first 80 chars
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.slice(0, 80);
}

function read(): ClipRecord[] {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return Array.isArray(raw) ? (raw as ClipRecord[]) : [];
  } catch {
    return [];
  }
}

function write(recs: ClipRecord[]): void {
  try {
    fs.writeFileSync(FILE, JSON.stringify(recs, null, 2), "utf8");
  } catch (e) {
    console.error("clip-history write failed:", e);
  }
}

function toEntry(r: ClipRecord): ClipEntry {
  // Strip the raw value — list() must never leak it.
  return { id: r.id, ts: r.ts, preview: r.preview, isSecret: r.isSecret, length: r.length };
}

// Record a clipboard value: dedupe against the most recent entry, cap at MAX,
// persist. Empty/whitespace-only text is ignored.
export function record(text: string): void {
  try {
    if (typeof text !== "string") return;
    if (!text.trim()) return;
    const recs = read();
    // Dedupe only when the new text equals the most recent entry's value.
    if (recs.length > 0 && recs[0].value === text) return;
    const secret = isSecret(text);
    const rec: ClipRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: new Date().toISOString(),
      preview: makePreview(text, secret),
      isSecret: secret,
      length: text.length,
      value: text
    };
    const next = [rec, ...recs].slice(0, MAX);
    write(next);
  } catch (e) {
    console.error("clip-history record failed:", e);
  }
}

// Return entries newest-first WITHOUT the raw value.
export function list(): ClipEntry[] {
  try {
    return read().map(toEntry);
  } catch {
    return [];
  }
}

// Restore an entry's raw value to the OS clipboard via PowerShell Set-Clipboard,
// passing the value through stdin so it never lands on the command line.
export function restore(id: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const rec = read().find((r) => r.id === id);
      if (!rec) return resolve(false);
      const ps = spawn(
        "powershell",
        ["-NoProfile", "-Command", "$input | Set-Clipboard"],
        { shell: true }
      );
      ps.on("error", () => resolve(false));
      ps.on("close", (code) => resolve(code === 0));
      ps.stdin.on("error", () => resolve(false));
      ps.stdin.write(rec.value);
      ps.stdin.end();
    } catch {
      resolve(false);
    }
  });
}

// Wipe history.
export function clear(): void {
  try {
    write([]);
  } catch (e) {
    console.error("clip-history clear failed:", e);
  }
}
