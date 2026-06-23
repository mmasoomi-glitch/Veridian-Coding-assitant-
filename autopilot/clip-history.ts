// Clipboard history store. Keeps a local, newest-first ring of recent clipboard
// values (max 20) so the owner can glance back at "what did I copy a minute ago?"
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
// Sibling file: persistent per-distinct-value counts across all history (survives
// the rolling MAX cap, so "most used" reflects long-term frequency, not just the
// last 20 entries). Keyed by raw value; each row keeps a redacted-safe preview.
const COUNTS_FILE = path.join(process.cwd(), "clip-counts.json");
const MAX = 20;

interface CountRow {
  value: string;     // raw value (used as the distinct key; restoreable id derived from it)
  preview: string;   // redacted-safe preview (secrets already masked)
  isSecret: boolean;
  length: number;
  count: number;     // how many times this distinct value was recorded
  lastTs: string;    // last time it was recorded (ISO)
  id: string;        // stable id so the UI can click-to-restore from counts
}

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

function readCounts(): CountRow[] {
  try {
    const raw = JSON.parse(fs.readFileSync(COUNTS_FILE, "utf8"));
    return Array.isArray(raw) ? (raw as CountRow[]) : [];
  } catch {
    return [];
  }
}

function writeCounts(rows: CountRow[]): void {
  try {
    fs.writeFileSync(COUNTS_FILE, JSON.stringify(rows, null, 2), "utf8");
  } catch (e) {
    console.error("clip-counts write failed:", e);
  }
}

// Increment the distinct-value count for a freshly recorded entry. Stores only a
// redacted-safe preview so the counts file never widens secret exposure beyond
// what clip-history.json already holds (raw value is needed there for restore).
function bumpCount(rec: ClipRecord): void {
  try {
    const rows = readCounts();
    const hit = rows.find((r) => r.value === rec.value);
    if (hit) {
      hit.count += 1;
      hit.lastTs = rec.ts;
      hit.preview = rec.preview;
      hit.isSecret = rec.isSecret;
      hit.length = rec.length;
    } else {
      rows.push({
        value: rec.value,
        preview: rec.preview,
        isSecret: rec.isSecret,
        length: rec.length,
        count: 1,
        lastTs: rec.ts,
        id: rec.id
      });
    }
    writeCounts(rows);
  } catch (e) {
    console.error("clip-counts bump failed:", e);
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
    const secret = isSecret(text);
    const rec: ClipRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: new Date().toISOString(),
      preview: makePreview(text, secret),
      isSecret: secret,
      length: text.length,
      value: text
    };
    // Frequency counting tracks every copy of a distinct value, including repeats
    // of the most-recent one (so "most used" stays accurate even when the history
    // list dedupes the visual entry below).
    bumpCount(rec);
    // Dedupe only when the new text equals the most recent entry's value.
    if (recs.length > 0 && recs[0].value === text) return;
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

// Most-frequently-recorded distinct entries, top n by count (ties broken by most
// recent). Never leaks raw secret values — returns the redacted preview only.
export function topRepeats(n = 5): ClipEntry[] {
  try {
    const rows = readCounts();
    return rows
      .slice()
      .sort((a, b) => b.count - a.count || b.lastTs.localeCompare(a.lastTs))
      .slice(0, Math.max(0, n))
      .map((r) => ({
        id: r.id,
        ts: r.lastTs,
        preview: r.preview,
        isSecret: r.isSecret,
        length: r.length
      }));
  } catch {
    return [];
  }
}

// Autocomplete: distinct entries whose raw value starts with (preferred) or
// contains `prefix`, case-insensitive. Matching is done against the raw value so
// secrets can still be found by what you typed, but the returned ClipEntry never
// includes the raw value — only the redacted preview. Empty prefix → recent top.
export function suggest(prefix: string, n = 8): ClipEntry[] {
  try {
    const q = String(prefix || "").trim().toLowerCase();
    const limit = Math.max(0, n);
    // Distinct by raw value: prefer history (has ids + raw values) and fall back
    // to count rows for values aged out of the rolling list.
    const seen = new Set<string>();
    const pool: { value: string; entry: ClipEntry }[] = [];
    for (const r of read()) {
      if (seen.has(r.value)) continue;
      seen.add(r.value);
      pool.push({ value: r.value, entry: toEntry(r) });
    }
    for (const r of readCounts()) {
      if (seen.has(r.value)) continue;
      seen.add(r.value);
      pool.push({
        value: r.value,
        entry: { id: r.id, ts: r.lastTs, preview: r.preview, isSecret: r.isSecret, length: r.length }
      });
    }
    if (!q) return pool.slice(0, limit).map((p) => p.entry);
    const starts: ClipEntry[] = [];
    const contains: ClipEntry[] = [];
    for (const p of pool) {
      const v = p.value.toLowerCase();
      if (v.startsWith(q)) starts.push(p.entry);
      else if (v.includes(q)) contains.push(p.entry);
    }
    return [...starts, ...contains].slice(0, limit);
  } catch {
    return [];
  }
}

// Restore an entry's raw value to the OS clipboard via PowerShell Set-Clipboard,
// passing the value through stdin so it never lands on the command line.
export function restore(id: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      // Look in the rolling history first; fall back to the counts file so a
      // "most used"/autocomplete entry that has aged out of the last 20 can still
      // be restored.
      const value =
        read().find((r) => r.id === id)?.value ??
        readCounts().find((r) => r.id === id)?.value;
      if (value == null) return resolve(false);
      const ps = spawn(
        "powershell",
        ["-NoProfile", "-Command", "$input | Set-Clipboard"],
        { shell: true }
      );
      ps.on("error", () => resolve(false));
      ps.on("close", (code) => resolve(code === 0));
      ps.stdin.on("error", () => resolve(false));
      ps.stdin.write(value);
      ps.stdin.end();
    } catch {
      resolve(false);
    }
  });
}

// Wipe history (and the frequency counts that back "most used").
export function clear(): void {
  try {
    write([]);
    writeCounts([]);
  } catch (e) {
    console.error("clip-history clear failed:", e);
  }
}
