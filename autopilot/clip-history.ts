// Clipboard history store. Keeps a local, newest-first ring of recent clipboard
// values (max 20) so the owner can glance back at "what did I copy a minute ago?"
// and restore any entry to the OS clipboard.
//
// PRIVACY (F-003/F-029): secrets (API keys, tokens, JWTs, long opaque blobs) are
// detected and never written to disk in plaintext. For a secret entry the raw
// value is held ONLY in an ephemeral in-memory cache (cleared on server restart)
// so restore() works during the session; on disk its value is blanked. Non-secret
// clipboard text is still persisted so it survives a restart. clip-counts.json
// stores a one-way hash as the dedup key — never the raw value. list()/topRepeats()/
// suggest() return ClipEntry only (redacted preview), never the raw value.
//
// All file/spawn I/O is wrapped in try/catch; nothing here throws.

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import { writeJsonAtomic } from "../lib/atomic";

const FILE = path.join(process.cwd(), "clip-history.json");
// Sibling file: persistent per-distinct-value counts across all history (survives
// the rolling MAX cap, so "most used" reflects long-term frequency, not just the
// last 20 entries). Keyed by a one-way hash of the value; each row keeps a
// redacted-safe preview. The raw value is NEVER stored here.
const COUNTS_FILE = path.join(process.cwd(), "clip-counts.json");
const MAX = 20;

// Ephemeral, in-process raw-value cache (id -> raw). Lets restore() return a
// secret to the OS clipboard during the session without ever writing it to disk.
// Lost on restart by design — a secret should not be restorable from a plaintext
// file that outlives the session.
const RAW_CACHE = new Map<string, string>();

function keyOf(text: string): string {
  // One-way dedup key. Not reversible -> safe to persist for secrets.
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

interface CountRow {
  key: string;       // sha256(value) — distinct-value key; NOT the raw value
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

// Internal record carries the raw value in memory; the on-disk form blanks the
// value for secrets (see toDisk).
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

// On-disk shape of a record: secrets are stored with a blanked value so no raw
// secret bytes ever touch clip-history.json. Non-secrets keep their value so they
// can be restored after a restart.
function toDisk(rec: ClipRecord): ClipRecord {
  return rec.isSecret ? { ...rec, value: "" } : rec;
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
    writeJsonAtomic(FILE, recs.map(toDisk));
  } catch (e) {
    console.error("clip-history write failed:", e);
  }
}

function readCounts(): CountRow[] {
  try {
    const raw = JSON.parse(fs.readFileSync(COUNTS_FILE, "utf8"));
    if (!Array.isArray(raw)) return [];
    // Tolerate legacy rows that used a raw `value` field: migrate to a hash key
    // and drop the raw value so we never re-persist a plaintext secret.
    return (raw as any[]).map((r) => {
      if (r && typeof r.key === "string") return r as CountRow;
      const legacyVal = typeof r?.value === "string" ? r.value : "";
      return {
        key: legacyVal ? keyOf(legacyVal) : keyOf(String(r?.id || Math.random())),
        preview: String(r?.preview ?? ""),
        isSecret: Boolean(r?.isSecret),
        length: Number(r?.length ?? 0),
        count: Number(r?.count ?? 1),
        lastTs: String(r?.lastTs ?? ""),
        id: String(r?.id ?? "")
      } as CountRow;
    });
  } catch {
    return [];
  }
}

function writeCounts(rows: CountRow[]): void {
  try {
    writeJsonAtomic(COUNTS_FILE, rows);
  } catch (e) {
    console.error("clip-counts write failed:", e);
  }
}

// Increment the distinct-value count for a freshly recorded entry. Dedup is by a
// one-way hash of the raw value; only a redacted-safe preview is persisted.
function bumpCount(rec: ClipRecord): void {
  try {
    const k = keyOf(rec.value);
    const rows = readCounts();
    const hit = rows.find((r) => r.key === k);
    if (hit) {
      hit.count += 1;
      hit.lastTs = rec.ts;
      hit.preview = rec.preview;
      hit.isSecret = rec.isSecret;
      hit.length = rec.length;
    } else {
      rows.push({
        key: k,
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

// Resolve a record's raw value: ephemeral cache first (covers secrets recorded
// this session), then the on-disk value (non-secrets only — secrets are blanked).
function rawFor(rec: ClipRecord): string {
  return RAW_CACHE.get(rec.id) || rec.value || "";
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
    // Keep the raw value in the ephemeral cache so restore works this session,
    // even for secrets (which are blanked on disk).
    RAW_CACHE.set(rec.id, text);
    // Frequency counting tracks every copy of a distinct value, including repeats
    // of the most-recent one (so "most used" stays accurate even when the history
    // list dedupes the visual entry below).
    bumpCount(rec);
    // Dedupe only when the new text equals the most recent entry's value.
    if (recs.length > 0 && rawFor(recs[0]) === text) return;
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

// Autocomplete: distinct entries whose raw value (when available this session, or
// on disk for non-secrets) or preview starts with / contains `prefix`,
// case-insensitive. The returned ClipEntry never includes the raw value — only
// the redacted preview. Empty prefix → recent top.
export function suggest(prefix: string, n = 8): ClipEntry[] {
  try {
    const q = String(prefix || "").trim().toLowerCase();
    const limit = Math.max(0, n);
    const seen = new Set<string>();
    const pool: { hay: string; entry: ClipEntry }[] = [];
    for (const r of read()) {
      const k = keyOf(rawFor(r) || r.id);
      if (seen.has(k)) continue;
      seen.add(k);
      // Match against raw value when we have it this session, else the preview.
      pool.push({ hay: (rawFor(r) || r.preview).toLowerCase(), entry: toEntry(r) });
    }
    for (const r of readCounts()) {
      if (seen.has(r.key)) continue;
      seen.add(r.key);
      pool.push({
        hay: r.preview.toLowerCase(),
        entry: { id: r.id, ts: r.lastTs, preview: r.preview, isSecret: r.isSecret, length: r.length }
      });
    }
    if (!q) return pool.slice(0, limit).map((p) => p.entry);
    const starts: ClipEntry[] = [];
    const contains: ClipEntry[] = [];
    for (const p of pool) {
      if (p.hay.startsWith(q)) starts.push(p.entry);
      else if (p.hay.includes(q)) contains.push(p.entry);
    }
    return [...starts, ...contains].slice(0, limit);
  } catch {
    return [];
  }
}

// Restore an entry's raw value to the OS clipboard via PowerShell Set-Clipboard,
// passing the value through stdin so it never lands on the command line. Secrets
// are restorable only during the session they were copied (ephemeral cache); a
// secret aged out of the cache (e.g. after a restart) cannot be restored — by design.
export function restore(id: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const value =
        RAW_CACHE.get(id) ||
        read().find((r) => r.id === id && !r.isSecret)?.value ||
        "";
      if (!value) return resolve(false);
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
    RAW_CACHE.clear();
    write([]);
    writeCounts([]);
  } catch (e) {
    console.error("clip-history clear failed:", e);
  }
}
