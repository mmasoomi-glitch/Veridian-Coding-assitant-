// Notebook store. A private, server-side scratchpad: free-text notes, dropped
// snippets, and uploaded files the developer wants to keep next to a project.
// Entries live in `notebook.json` at the repo root; uploaded file bytes live
// under `notebook-files/`. Everything here is best-effort and NEVER throws —
// the UI polls this constantly and a thrown error would crash the request.

import fs from "fs";
import path from "path";
import { writeJsonAtomic } from "../lib/atomic";

const FILE = path.join(process.cwd(), "notebook.json");
const FILES_DIR = path.join(process.cwd(), "notebook-files");

export interface NoteEntry {
  id: string;
  ts: string;
  type: "note" | "file" | "snippet";
  title: string;
  content: string;
  project?: string;
  fileName?: string;
}

// Monotonic counter to make ids unique even within the same millisecond.
let counter = 0;
function makeId(): string {
  counter = (counter + 1) % 1_000_000;
  // "random-ish" suffix derived from the counter + a small jitter, kept short.
  const suffix = (counter * 2654435761) % 0xfffff;
  return `${Date.now()}-${suffix.toString(36)}`;
}

function read(): NoteEntry[] {
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as NoteEntry[]) : [];
  } catch {
    return [];
  }
}

function write(entries: NoteEntry[]): void {
  try {
    writeJsonAtomic(FILE, entries);
  } catch (e) {
    console.error("notebook write failed:", e);
  }
}

function ensureFilesDir(): void {
  try {
    if (!fs.existsSync(FILES_DIR)) fs.mkdirSync(FILES_DIR, { recursive: true });
  } catch (e) {
    console.error("notebook files dir create failed:", e);
  }
}

export function listEntries(): NoteEntry[] {
  return read();
}

export function addEntry(e: {
  type: "note" | "file" | "snippet";
  title: string;
  content: string;
  project?: string;
}): NoteEntry {
  const entry: NoteEntry = {
    id: makeId(),
    ts: new Date().toISOString(),
    type: e.type,
    title: e.title,
    content: e.content,
    ...(e.project ? { project: e.project } : {})
  };
  try {
    const entries = read();
    entries.push(entry);
    write(entries);
  } catch (err) {
    console.error("notebook addEntry failed:", err);
  }
  return entry;
}

export function deleteEntry(id: string): void {
  if (!id) return;
  try {
    const entries = read();
    const kept = entries.filter((x) => x.id !== id);
    const removed = entries.find((x) => x.id === id);
    // If a file entry is removed, try to clean up its bytes on disk too.
    if (removed && removed.type === "file" && removed.content) {
      try {
        const abs = path.join(process.cwd(), removed.content);
        if (abs.startsWith(FILES_DIR) && fs.existsSync(abs)) fs.unlinkSync(abs);
      } catch { /* best-effort cleanup */ }
    }
    write(kept);
  } catch (err) {
    console.error("notebook deleteEntry failed:", err);
  }
}

export function saveFile(name: string, base64: string, project?: string): NoteEntry {
  const id = makeId();
  // Sanitize the supplied name to a bare filename (no path traversal).
  const safeName = path.basename(name || "file");
  const relPath = path.join("notebook-files", `${id}-${safeName}`);
  try {
    ensureFilesDir();
    // Strip a possible data-URL prefix ("data:...;base64,") before decoding.
    const comma = base64.indexOf(",");
    const payload = base64.startsWith("data:") && comma >= 0 ? base64.slice(comma + 1) : base64;
    const bytes = Buffer.from(payload, "base64");
    fs.writeFileSync(path.join(process.cwd(), relPath), bytes);
  } catch (err) {
    console.error("notebook saveFile failed:", err);
  }
  const entry: NoteEntry = {
    id,
    ts: new Date().toISOString(),
    type: "file",
    title: safeName,
    content: relPath,
    fileName: safeName,
    ...(project ? { project } : {})
  };
  try {
    const entries = read();
    entries.push(entry);
    write(entries);
  } catch (err) {
    console.error("notebook saveFile persist failed:", err);
  }
  return entry;
}
